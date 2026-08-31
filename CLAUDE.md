# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

[ARCHITECTURE.md](ARCHITECTURE.md) is the declared source of truth — authoritative Prisma schema, difficulty-scoring spec, and a numbered Step 1–5 build order. Read it before doing anything.

**Steps 1–4 are complete**: backend + Prisma; Spotify auth + ingestion; lyrics processing + difficulty engine + `/api/tracks/ranked`; and a **React web client** (UI shell, ranked-tracks list, and an HTML5-audio sync player). The backend lives in [backend/](backend/), the React app in [frontend/](frontend/). Next up is Step 5: word-bank interactions on the player (clickable words → Hebrew translation → `UserWordBank`). This repo is not yet under git.

**The frontend was pivoted twice.** It is now **React (Vite + TypeScript + Tailwind CSS)** — an earlier mobile-Flutter then Flutter-Web attempt were both replaced. `frontend/` contains only the React app. An empty `mobile/` directory may still linger from the first rename (a stale IDE file handle blocked its deletion); it has no `package.json`/`pubspec.yaml` and can be removed.

## Architecture

LingoTrack syncs a user's Spotify liked songs, scores each track by linguistic difficulty, and plays synchronized lyrics as tappable word chips that push Hebrew translations into a personal word bank.

Two deployables, one shared contract:

- **Backend** — Node.js + TypeScript + Express, Prisma ORM against **PostgreSQL** (`provider = "postgresql"`). `Track.difficultyLevel` and `UserWordBank.status` remain `String` with commented-out value sets rather than Prisma enums — originally a SQL Server constraint (the DB was migrated from SQL Server to Postgres for cloud deployment), kept so the value sets can evolve without a migration. Deployed on **Railway** (backend + managed Postgres); see the Deployment section.
- **Frontend** — **React** SPA ([frontend/](frontend/)): Vite + TypeScript + Tailwind CSS, React Router, mobile-first responsive. Session token in `localStorage`, sent as a Bearer header via a small `fetch` wrapper. See the "React web client" section below.

### Data model shape

`User` holds Spotify OAuth material directly (`accessToken`, `refreshToken`, `tokenExpiresAt`) — tokens are meant to be encrypted at rest and auto-refreshed by a dedicated mechanism, so never read those columns as plaintext without going through that layer.

`Track.id` is **not** generated — it is the Spotify track ID, so ingestion upserts by that key and tracks are shared across all users. Per-user state lives in the two join models instead:

- `UserWordBank` — unique on `(userId, word)`, so word capture is an upsert, not an insert.
- `UserTrackProgress` — unique on `(userId, trackId)`.

`LyricLine` carries `startTime`/`endTime` in **milliseconds** and a `lineNumber`; the player matches these against Spotify playback position. All child relations cascade on delete.

### Difficulty scoring

The score is a single `Float` 0.0–10.0 on `Track`, computed from three weighted layers, then bucketed into `BEGINNER` (0.0–3.5), `INTERMEDIATE` (3.6–7.0), `ADVANCED` (7.1–10.0). **Weights are `vocabulary 0.60 / textComplexity 0.10 / audioDynamics 0.30`** — a recalibration from the spec's 60/20/20 (see `DIFFICULTY_WEIGHTS` in [backend/src/config/difficulty.ts](backend/src/config/difficulty.ts) for the rationale). Both the raw score and the bucket are persisted — the three dashboard tabs ("Easy Tracks", "Medium", "Challenging") map to the three buckets, served by `/api/tracks/ranked`. Keep thresholds in one place so the bucket boundaries can't drift from the tab labels.

### Auth and ingestion (Step 2)

Two token systems, easily confused:

- **Spotify tokens** — stored AES-256-GCM encrypted in `User.accessToken`/`refreshToken`, never leave the server. Read them *only* via `getValidAccessToken()` in [backend/src/services/tokenService.ts](backend/src/services/tokenService.ts), which decrypts, refreshes 60s before expiry, re-encrypts, and de-dupes concurrent refreshes per user. Spotify usually omits `refresh_token` on refresh, so the stored one is preserved when absent.
- **LingoTrack session tokens** — HMAC-signed `base64url(payload).sig`, held by the web client, verified by `requireAuth`. Not a JWT, deliberately: no algorithm field, no alg-confusion bugs.

OAuth `state` is stateless — a signed nonce+timestamp with a 10-minute TTL, so no server-side session store. `/api/auth/callback` ends by redirecting the browser back to `WEB_APP_URL` with `?token=` (or `?error=` on any auth problem — the browser is mid top-level navigation, so failures are handed to the SPA, not returned as JSON). The SPA reads the token from its own URL on load. Because the SPA calls the API cross-origin (different port), the app enables **CORS** for `WEB_APP_URL` in [backend/src/app.ts](backend/src/app.ts); the OAuth redirect endpoints are top-level navigations, not XHR, so they don't depend on CORS.

Ingestion (`syncLikedTracks`) is a **background** job — `POST /api/sync/liked-tracks` returns 202 immediately, 409 if one is already running for that user, and the client polls `GET /api/sync/status`. Job state is an in-process `Map`, so this only holds for a single API instance; horizontal scaling needs a shared queue.

Two invariants the ingestion upsert depends on, both covered by tests:
- The `update` clause touches title/artist/album art **only**. `difficultyLevel`, `difficultyScore`, and `lyricsSynced` are owned by the Step 3 pipeline; refreshing them on every sync would silently re-queue the whole library.
- Saved items with a `null` track id (local files, unavailable tracks) are skipped, not written.

### Lyrics + difficulty engine (Step 3)

The engine is deliberately split into a **pure core** and a **DB-facing service** so the scoring math is unit-testable without a database:

- [backend/src/services/grading/difficultyEngine.ts](backend/src/services/grading/difficultyEngine.ts) — pure, deterministic, no I/O. `gradeTrack({lines, durationMs})` returns `{score, level, layers}`. This is where the §3 three-layer formula lives.
- [backend/src/services/grading/tokenizer.ts](backend/src/services/grading/tokenizer.ts) — shared text normalisation. Also the eventual source of truth for the player's word chips, so a word graded as "known" is the same token the UI makes tappable.
- [backend/src/config/cefr.ts](backend/src/config/cefr.ts) — CEFR lexicon. **A curated seed, NOT the full wordlists**; unknown words are treated as near-C2, so expanding it improves accuracy but its gaps never crash grading. If simple songs start grading too hard, the fix is usually adding common content words here.
- [backend/src/services/gradingService.ts](backend/src/services/gradingService.ts) — the **only** writer of `Track.difficultyLevel`/`difficultyScore`. `gradeStoredTrack()` grades from stored lyrics; `processTrack()` runs the full fetch→ingest→grade pipeline.
- [backend/src/services/lyrics/](backend/src/services/lyrics/) — `lyricsParser.ts` (pure LRC parser: timestamps→ms, compressed-LRC expansion, metadata-tag skipping), `lyricsService.ts` (replaces lines transactionally, toggles `lyricsSynced`), `provider.ts` (the external-lyrics-API seam; `NullLyricsProvider` is the placeholder until a vendor is wired in).

Two calibration decisions worth understanding before touching the engine:

- **Vocabulary is profiled over CONTENT words only** (function words filtered via `FUNCTION_WORDS`). Averaging over all tokens compressed the range so badly that nothing reached ADVANCED — ~35% of any lyric is trivially-A1 grammatical words. This mirrors how real CEFR text-profilers work.
- To land **ADVANCED** a track needs hard vocabulary **and** fast delivery — mainly high vocab + high words-per-minute, since audio is weighted 0.30. Real fast rap (Eminem "Rap God"/"Godzilla", Tech N9ne "Worldwide Choppers") lands 7.1–7.6; mainstream pop stays BEGINNER/INTERMEDIATE. Don't reweight further without re-checking the calibration samples in `tests/difficultyEngine.test.ts` (and re-run `scripts/regradeAll.ts` after any engine/weight change to refresh stored grades).
- **Text complexity uses word length, not line length.** Synced (LRC) lyrics are short fragments, so an average-words-per-line signal wrongly scored dense rap as "simple" and capped everything below ADVANCED. `scoreTextComplexity` now blends mean content-word length + lexical diversity + advanced-grammar density — none of which penalise short lines.

Grading requires lyrics: a track with none stays `UNGRADED` rather than getting a meaningless score, so it never appears in a ranked tab.

### Endpoints

Live: `/api/health`, `/api/health/db`, `/api/auth/spotify`, `/api/auth/callback`, `/api/auth/me`, `/api/sync/liked-tracks`, `/api/sync/status`, `/api/tracks/ranked`, `GET /api/tracks/:trackId`, `POST /api/tracks/:trackId/lyrics`, `POST /api/tracks/:trackId/prepare`, `GET /api/spotify/token`, `GET /api/translate`, and the Step 5 word-bank set: `POST /api/words` (capture; 201 new / 200 reinforced), `GET /api/words` (+`?status=`), `GET /api/words/stats`, `GET /api/words/:wordId` (+ review history), `DELETE /api/words/:wordId`, `GET /api/practice/session`, `POST /api/practice/submit`.

Note `GET /api/words/stats` is registered **before** `/api/words/:wordId` so "stats" isn't swallowed as a word id — same ordering constraint as the tracks router. CORS allows `DELETE` because of the word-bank delete.

`/api/tracks/ranked` returns the caller's graded liked tracks grouped into the three tabs (easiest-first within each), optional `?level=`. `GET /api/tracks/:trackId` returns one track (incl. `previewUrl`) plus its ordered lyric lines — the sync player's payload. `POST /api/tracks/:trackId/lyrics` (body `{lrc}`) ingests + grades in one call — the entry point for lyrics until a real provider is configured. All three are **library-scoped**: a track not in the caller's library 404s, so track ids can't be enumerated.

`Track.previewUrl` (nullable) is Spotify's 30-second preview MP3, persisted by ingestion. It's null for this app (a 2024 Spotify change), so full playback uses the Web Playback SDK instead (below).

### Word bank + practice (Step 5)

Tapping a word in the player translates it, and "Save to word bank" captures it enriched. Same pure-core/DB-shell split as the grading engine — all the linguistics and scheduling are unit-testable without a database.

- **Morphology is offline and rule-based** ([backend/src/services/morphology/](backend/src/services/morphology/)), deliberately not an external API: `irregulars.ts` (curated irregular verb/plural/comparative tables), `inflect.ts` (orthographic rules generating the labelled family), `pos.ts` (part of speech from lyric-line context first, suffix shape second), `lemma.ts` (`lemmatize` undoes inflection, `deriveRoot` undoes derivation), `enrich.ts` (the orchestrator capture calls). Gaps degrade to a narrower word family, never a crash.
- **`commonWords.ts` is a validation-only word list, NOT a difficulty lexicon.** It exists because `config/cefr.ts` is a 465-word seed that lacks "climb"/"stop", so lemmatization couldn't confirm candidates. Adding those words to `cefr.ts` instead would silently re-grade the whole library (an unlisted word scores near-C2). Keep the two lists separate. `NON_DERIVED_WORDS` guards words that only *look* derivational ("water" is not water+er).
- **SRS is a SM-2 variant** ([backend/src/services/practice/srs.ts](backend/src/services/practice/srs.ts)) — pure, `now` always injected. `status` (LEARNING/REVIEW/MASTERED) is *projected* from the schedule by `deriveStatus`, never stored independently, so the badge can't disagree with the due date. A lapse resets repetitions and keeps the ease penalty.
- **Quiz generation is deterministic** ([backend/src/services/practice/quizGenerator.ts](backend/src/services/practice/quizGenerator.ts)) — seeded mulberry32, never `Math.random`, so re-requesting a session doesn't reshuffle it. Four exercise types (`MCQ_EN_TO_HE`, `MCQ_HE_TO_EN`, `FILL_BLANK` from the stored lyric line, `FORM_MATCH` across the word family). A word that can't support any type (no distractors, no usable context) is skipped rather than turned into a degenerate 1-option question; `practiceService` supplies a fallback distractor pool so a tiny bank still works.
- **`UserWordBank` is unique on `(userId, lemma)`, not `(userId, word)`** — a deliberate change from the original spec. Tapping "climbing" then "climbed" must reinforce one entry, not fragment the family; `word` keeps the first-tapped surface form for display. Re-capturing refreshes enrichment and context but **never** touches the SRS columns, so a learner can't erase their history by re-tapping. `captureWord` returns `{entry, created}` because an existing-but-unpractised row is indistinguishable from a new one after the upsert.
- `WordReview` is an append-only answer log, kept alongside the aggregate counters so retention stats can be recomputed if the SRS is retuned.
- Frontend: [WordBankPage](frontend/src/pages/WordBankPage.tsx) (list, status tabs, expandable family cards), [PracticePage](frontend/src/pages/PracticePage.tsx) (session runner), `WORD_STATUS_META` in [types/word.ts](frontend/src/types/word.ts) is the single source for status labels/colors (full Tailwind literals, same JIT rule as `DIFFICULTY_META`), and pure helpers live in [lib/practiceProgress.ts](frontend/src/lib/practiceProgress.ts).

### Player pipeline (Step 5, in progress)

- **English-only, two layers.** Ingestion skips tracks whose **title/artist** are non-Latin script (`isEnglishTrack`, removes Hebrew/Arabic/etc.); at **prepare** time `isEnglishLyrics` re-checks the actual fetched lyrics (script gate + English-stopword ratio), which also catches Latin-script non-English (French/Spanish) — those are reset to `UNGRADED` so they never reach a tab. Both in [backend/src/services/languageFilter.ts](backend/src/services/languageFilter.ts).
- **Real synced lyrics via LRCLIB** ([backend/src/services/lyrics/lrclibProvider.ts](backend/src/services/lyrics/lrclibProvider.ts)) — free, key-less, tries exact-match then search. `POST /api/tracks/:trackId/prepare` runs fetch→English-check→ingest→grade; returns `{prepared:false}` (not an error) on a miss or non-English lyrics.
- **Full-song playback = Spotify Web Playback SDK (Premium).** `GET /api/spotify/token` hands the caller's Spotify access token to the browser (the one place a Spotify token leaves the server — the SDK needs it client-side). The frontend `useSpotifyPlayer` hook loads the SDK, starts a track via the Web API, and polls playback position to drive lyric highlighting. **Requires the `streaming` + `user-modify-playback-state` scopes** — added to `SPOTIFY_SCOPES`, so **existing users must sign out and reconnect** to grant them.
- **Translation via MyMemory** ([backend/src/services/translationService.ts](backend/src/services/translationService.ts)) — free, key-less English→Hebrew, cached in the `Translation` table (unique on `source+target`). `GET /api/translate?text=` serves word taps and per-line translation.

## Commands

All backend commands run from [backend/](backend/):

```bash
npm run dev              # tsx watch on src/server.ts
npm run build            # tsc -> dist/
npm run typecheck        # tsc --noEmit
npm run lint             # eslint (flat config)
npm test                 # vitest run
npm run test:watch
npx vitest run tests/difficulty.test.ts          # single file
npx vitest run -t 'maps the ARCHITECTURE.md'     # single test by name
npm run prisma:generate  # after ANY schema.prisma edit
npm run prisma:migrate   # prisma migrate dev
npm run prisma:validate
```

`tests/` is excluded from `tsconfig.json` (Vitest compiles it), so `npm run typecheck` does **not** cover test files — a type error there surfaces only when the test runs.

`tests/integration.oauthSync.test.ts` and `tests/integration.grading.test.ts` hit the **real database** (stubbing `globalThis.fetch` for Spotify) and clean up after themselves; they fail rather than skip if `DATABASE_URL` is unreachable. All other backend tests are pure.

React web commands run from [frontend/](frontend/) (Node 20, npm on PATH):

```bash
npm install
npm run dev            # Vite dev server on http://localhost:5199
npm run build          # tsc --noEmit && vite build  (type-check + prod build)
npm run lint           # eslint (flat config)
npm test               # vitest run (pure-logic unit tests)
```

**The dev server is pinned to port 5199** (`strictPort` in [frontend/vite.config.ts](frontend/vite.config.ts)) so the origin matches the backend's `WEB_APP_URL` / CORS origin and the OAuth redirect target. It is deliberately **not** Vite's default 5173 — that port is used by another local project on this machine, and `strictPort` fails loudly rather than silently switching (which would break the callback + CORS). If 5199 is ever taken too, change it in `vite.config.ts` **and** the backend's `WEB_APP_URL` together. The backend base URL is read from `VITE_API_BASE_URL` (default `http://localhost:3000`, see [frontend/src/config.ts](frontend/src/config.ts)).

To run the whole app: start the backend (`npm run dev` in `backend/`), then the frontend (`npm run dev` in `frontend/`), and open http://localhost:5199. Login still needs real Spotify credentials in `backend/.env`. `build`, `lint`, and `test` are all verified green here.

## Environment

`backend/.env` is git-ignored; [backend/.env.example](backend/.env.example) is the template. `src/config/env.ts` validates it with zod at import time and throws on anything missing, so a bad `.env` fails at startup rather than at first query.

`DATABASE_URL` is a **PostgreSQL** connection string. (The app was migrated off a local SQL Server / Windows-auth instance; that data was derived — re-syncable from Spotify — and did not migrate. The old value is kept in `backend/.env.backup-sqlserver`.)

### Local Postgres (portable, on D:)

Local dev runs a **portable PostgreSQL 16.4** that lives entirely on `D:` — the machine's `C:` drive is full, so nothing may be installed there. It is not a Windows service and touches no system state; deleting `D:\LingoTrack\tools\pgsql` and `pgdata` removes it completely.

```bash
# start (from anywhere)
D:/LingoTrack/tools/pgsql/bin/pg_ctl -D D:/LingoTrack/tools/pgdata -l D:/LingoTrack/tools/pg.log start
D:/LingoTrack/tools/pgsql/bin/pg_ctl -D D:/LingoTrack/tools/pgdata stop      # stop
D:/LingoTrack/tools/pgsql/bin/pg_isready -h 127.0.0.1 -p 5432                # check
```

It does **not** start on boot — if `/api/health/db` reports `unreachable`, start it with the command above. The superuser is `postgres` and the database is `lingotrack`; the local password is in `backend/.env` (git-ignored) — it is dev-only and the server listens on loopback only.

Because `.env` is read once at process start, **changing `DATABASE_URL` requires restarting the backend** — `tsx watch` does not reload it.

npm/npx write to `C:` by default and that drive is full, so prefer the local binaries (`./node_modules/.bin/prisma`, `./node_modules/.bin/vitest`) or set `TEMP`/`TMP`/`npm_config_cache` to a path on `D:`.

## Deployment

- **Frontend** — Firebase Hosting, project `lingotrack-7cb80` (served at `https://lingotrack-7cb80.web.app`). Config in [firebase.json](firebase.json) (`public: frontend/dist`, SPA rewrite to `/index.html`). Deploy: `cd frontend && npm run build && firebase deploy --only hosting`. The build **must** be run with `VITE_API_BASE_URL` set to the deployed backend URL (via `frontend/.env.production`), otherwise the SPA falls back to `http://localhost:3000` and login dead-ends at `ERR_CONNECTION_REFUSED`.
- **Backend** — Railway (Nixpacks). [backend/nixpacks.toml](backend/nixpacks.toml) forces `npm ci --include=dev` (build needs tsc/prisma from devDependencies); `build` runs `prisma generate && tsc`; `start` runs `prisma migrate deploy && node dist/server.js` (migrations apply on every boot). Railway injects `PORT` and, via the Postgres plugin, `DATABASE_URL`. Required service vars: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` (= `https://<backend-domain>/api/auth/callback`), `TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`, `WEB_APP_URL` (= the Firebase Hosting origin), `NODE_ENV=production`.
- **Spotify dashboard** — the registered Redirect URI must be the **backend** callback `https://<backend-domain>/api/auth/callback` (byte-for-byte with `SPOTIFY_REDIRECT_URI`), never the SPA. The app is in Development mode, so testers must be added under User Management.

## Backend conventions

ESM throughout (`"type": "module"`, `module: NodeNext`), so **relative imports need the `.js` extension** even in `.ts` source. `verbatimModuleSyntax` is on, so type-only imports must use `import type`.

`createApp()` in [backend/src/app.ts](backend/src/app.ts) builds the Express app without binding a port — mount new routers there and let [backend/src/server.ts](backend/src/server.ts) own the listen/shutdown. `errorHandler` must stay registered last, and keeps its unused `next` parameter because Express detects error middleware by arity.

Import the shared client from [backend/src/lib/prisma.ts](backend/src/lib/prisma.ts) rather than constructing `new PrismaClient()`; it is cached on `globalThis` so `tsx watch` reloads don't leak connection pools.

Difficulty thresholds, bucket names, and layer weights live only in [backend/src/config/difficulty.ts](backend/src/config/difficulty.ts). The Step 3 scoring engine should consume `toDifficultyLevel()` rather than re-deriving the boundaries.

**`UNGRADED` is a documented deviation from ARCHITECTURE.md.** The spec lists three `difficultyLevel` values, but Step 2 ingests tracks before Step 3 can grade them and the column is non-nullable with no default. Ingestion therefore writes `UNGRADED` / score `0.0`. It is intentionally excluded from `DIFFICULTY_LEVELS`, so `/api/tracks/ranked` filtering by the three real buckets omits ungraded tracks automatically — do not "fix" this by adding it to that array.

## React web client (Step 4)

Vite + React + TypeScript + Tailwind under [frontend/src/](frontend/src/), organised by concern rather than heavy layering: `api/` (typed backend calls), `auth/` (context + token + redirect parsing), `components/`, `pages/`, `lib/` (pure helpers + the `fetch` wrapper), `types/`. Routing is React Router in [frontend/src/App.tsx](frontend/src/App.tsx): `/login`, and a `RequireAuth` group wrapping `/` (dashboard) and `/player/:trackId`.

Conventions a new feature should follow:

- **All backend calls go through `apiRequest`** ([frontend/src/lib/apiClient.ts](frontend/src/lib/apiClient.ts)) and typed wrappers in [frontend/src/api/](frontend/src/api/). It attaches the Bearer token, throws a typed `ApiError` (status 0 = unreachable), and on **401** clears the token and calls a registered `onUnauthorized` handler. `AuthContext` registers that handler and flips to unauthenticated — so an expired session anywhere routes back to login, decoupled the same way the backend's `SessionEvents` is (the client and context don't import each other's internals).
- **Login is a full-page redirect, not a popup/WebView.** `useAuth().login()` sets `window.location.href = ${API_BASE}/api/auth/spotify`; the backend runs the OAuth exchange (**the Spotify client secret never reaches the browser**) and redirects back with `?token=`/`?error=`. On mount `AuthProvider` reads the result from `window.location.search` via the pure `parseAuthRedirect` ([frontend/src/auth/authRedirect.ts](frontend/src/auth/authRedirect.ts)), persists the token to `localStorage`, and immediately `history.replaceState`s the query away (so the token isn't left in the URL/history/referer) before falling back to any stored session. The bootstrap is guarded by a ref against StrictMode's double-invoke.
- **`DIFFICULTY_META` / `DIFFICULTY_ORDER`** ([frontend/src/types/track.ts](frontend/src/types/track.ts)) are the single source for tab labels, colors, and level order, mapping to the backend wire strings (`BEGINNER`/`INTERMEDIATE`/`ADVANCED`). Tailwind class names there are written as **full string literals** — dynamically-concatenated class names get purged by Tailwind's JIT scanner.
- **The sync player** ([frontend/src/pages/PlayerPage.tsx](frontend/src/pages/PlayerPage.tsx)) uses a native HTML5 `<audio>` element as the clock: its `timeupdate`/`seeked` events feed `positionMs`, and the pure `findActiveLineIndex` ([frontend/src/lib/lyricSync.ts](frontend/src/lib/lyricSync.ts)) picks the active lyric line (half-open `[start, end)` intervals), which is highlighted and scrolled into view. Audio source is `track.previewUrl`; when null, the player still renders lyrics and tapping a line moves the highlight (visual-only) so the sync is demonstrable. Caveat baked into the UI: Spotify previews are ~30s and won't align with full-song lyric timings.
- **Tests are Vitest over pure logic only** (`*.test.ts` beside the source: `authRedirect`, `lyricSync`) — `environment: 'node'`, no jsdom/RTL. Keep new logic in pure functions so it's testable without a DOM harness.

The dev backend runs over HTTP on `localhost`; production should serve both API and SPA over HTTPS (and set `WEB_APP_URL` accordingly). The Spotify redirect URI registered on the dashboard is the **backend** callback (`http://127.0.0.1:3000/api/auth/callback`), never the SPA — Spotify only ever redirects to the backend, which then redirects to the SPA at `WEB_APP_URL`.
