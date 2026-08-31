# LingoTrack - System Architecture & Implementation Guide

This document serves as the source of truth for building LingoTrack. It defines the software architecture, database schema, and sequential implementation roadmap for the developer model.

---

## 1. System Overview & Technology Stack

LingoTrack is a language-learning application that syncs with a user's Spotify account, analyzes their liked songs, ranks them by linguistic difficulty, and provides an interactive lyric player for real-time Hebrew translation and active vocabulary building.

- **Frontend:** Flutter (Mobile App) using Clean Architecture and BLoC or Provider for state management.
- **Backend:** Node.js with TypeScript and Express.js.
- **Database:** Microsoft SQL Server (MSSQL) with Prisma ORM.
- **External Integration:** Spotify Web API (OAuth2, Playback State, Liked Tracks), Lyrics Provider API.

---

## 2. Database Schema (Prisma ORM for SQL Server)

```prisma
datasource db {
  provider = "sqlserver"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id               String            @id @default(uuid())
  email            String            @unique
  spotifyId        String            @unique
  accessToken      String
  refreshToken     String
  tokenExpiresAt   DateTime
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  wordBank         UserWordBank[]
  progress         UserTrackProgress[]
}

model Track {
  id              String            @id
  title           String
  artist          String
  albumArtUrl     String?
  difficultyLevel String            // BEGINNER, INTERMEDIATE, ADVANCED
  difficultyScore Float
  lyricsSynced    Boolean           @default(false)
  lyrics          LyricLine[]
  userProgress    UserTrackProgress[]
}

model LyricLine {
  id        String   @id @default(uuid())
  trackId   String
  track     Track    @relation(fields: [trackId], references: [id], onDelete: Cascade)
  text      String
  startTime Int      // Milliseconds from start of song
  endTime   Int      // Milliseconds from start of song
  lineNumber Int
}

model UserWordBank {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  word        String
  translation String
  contextLine String?
  status      String   @default("LEARNING") // LEARNING, MASTERED
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([userId, word])
}

model UserTrackProgress {
  id           String   @id @default(uuid())
  userId       String
  trackId      String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  track        Track    @relation(fields: [trackId], references: [id], onDelete: Cascade)
  masteredPct  Float    @default(0.0)
  lastPlayedAt DateTime @default(now())

  @@unique([userId, trackId])
}
```

---

## 3. Lyrics Difficulty Grading Specification

The backend service will tokenize raw lyric lines, strip punctuation, and filter words into an array. It will compute a `difficultyScore` (0.0 to 10.0) based on three linguistic layers:

1. **Vocabulary Profiling (60% Weight):** Cross-reference track vocabulary against standardized CEFR wordlists (A1 to C2). 
   - A1/A2 words = Low weight.
   - B1/B2 words = Medium weight.
   - C1/C2 words / Rare idioms = High weight.
2. **Text Complexity (20% Weight):** Average line length, structural variety, and use of advanced grammatical tenses (e.g., Perfect or Passive voice).
3. **Audio Dynamics (20% Weight):** Word density per second (Words Per Minute calculation based on total track length).

### Difficulty Threshold Mapping:
- **BEGINNER (Level 1):** Score `0.0 - 3.5` (Simple pop, acoustic ballads, slow tempo).
- **INTERMEDIATE (Level 2):** Score `3.6 - 7.0` (Moderate tempo rock/pop, standard expressions, basic idioms).
- **ADVANCED (Level 3):** Score `7.1 - 10.0` (Fast-paced hip-hop/rap, heavy slang, complex metaphors).

---

## 4. Sequential Execution Checklist for Claude Code

### Step 1: Backend Infrastructure & Prisma Setup
- [ ] Initialize TypeScript + Node.js project.
- [ ] Install dependencies: `express`, `@prisma/client`, `typescript`, `dotenv`.
- [ ] Configure `schema.prisma` for SQL Server and run initial migrations.

### Step 2: Spotify Auth & Ingestion Service
- [ ] Implement OAuth2 flow routes (`/api/auth/spotify` and `/api/auth/callback`).
- [ ] Create Token Encryption/Decryption and auto-refresh mechanisms.
- [ ] Build background synchronization workers to fetch `$GET /v1/me/tracks$` and populate the database.

### Step 3: Lyrics Processing Engine
- [ ] Create a ingestion service layer that clean up text, parses timestamps, and structures lines into `LyricLine`.
- [ ] Implement the Difficulty Grading service using standard vocabulary profiles.
- [ ] Build a endpoint `/api/tracks/ranked` that exposes categorized tracks.

### Step 4: Flutter Mobile Client Shell
- [ ] Scaffold Flutter project with clear directory organization (data, domain, presentation).
- [ ] Set up secure local storage for tokens and network routing client using `dio`.
- [ ] Build Login screen with a secure WebView for Spotify integration.
- [ ] Construct the main UI dashboard displaying three cleanly styled tabs: "Easy Tracks", "Medium", and "Challenging".

### Step 5: The Interactive Sync Player & Word Bank (Core UX)
- [ ] Build a responsive player UI that polls or streams active Spotify playback state.
- [ ] Render synchronized lyrics block-by-block. Break lines into clickable tokenized word chips.
- [ ] Implement an `onTap` handler for word chips: triggers an internal Hebrew dictionary/translation lookup, pops open a non-intrusive bottom sheet sheet, and posts the transaction to the user's `UserWordBank` endpoint.
