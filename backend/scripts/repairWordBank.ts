/** OPS: re-resolve saved words whose stored meaning is stale or wrong.
 *
 *  Three separate defects have put bad data in word banks, and each is
 *  invisible to the checks that catch the others:
 *
 *    - "conquer" lemmatised to the non-word "conqu", which the translator
 *      echoed back, so the stored meaning was English.
 *    - "tired" lemmatised to "tir", which the translator rendered
 *      phonetically as "טיר" — Hebrew letters, English fragment. Any
 *      script-based check passes it.
 *    - "tore" was stored with the NOUN sense of "tear" (דִמעָה) despite being
 *      tagged a verb, because the meaning was resolved without the lyric line.
 *      Its lemma and its script are both perfectly fine.
 *
 *  So this does not try to detect breakage. It re-resolves every row through
 *  the current lookup and writes back whatever changed, which covers all three
 *  and any fourth not yet found. Senses are cached per lemma in the database,
 *  so a second run costs almost nothing.
 *
 *  SRS columns are never touched — a repair must not cost anyone their review
 *  history.
 *
 *  From backend/ (dry run by default, prints what it would change):
 *    npx tsx scripts/repairWordBank.ts
 *    npx tsx scripts/repairWordBank.ts --apply
 */
import { prisma } from '../src/lib/prisma.js';
import { enrichWord } from '../src/services/morphology/enrich.js';
import { lookupWord } from '../src/services/wordLookupService.js';
import { serializeForms } from '../src/services/wordBankService.js';

const HEBREW = /[֐-׿]/;
const apply = process.argv.includes('--apply');

/**
 * Normalises Hebrew for comparison: drops vowel points and cantillation,
 * removes a parenthetical transliteration ("לשכב (Lish'kav)"), and collapses
 * whitespace. Stored values come from several generations of the translation
 * code, so the same word can be spelled with or without nikud.
 */
function normaliseHebrew(text: string): string {
  return text
    .replace(/\([^)]*\)/g, '')
    .replace(/[֑-ׇ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when the stored translation is already one of the dictionary's own
 * senses for this word, so there is no reason to overwrite it.
 *
 * This is what keeps "lay" alone. Its lemma is "lie", whose verb senses are
 * [לְשַׁקֵר, לִשְׁכַּב, …] — *to tell an untruth* first, *to recline* second.
 * The stored לשכב is correct for "and you, you'd lay", and picking the
 * dictionary's first entry would have replaced it with לשקר. Nothing in the
 * part of speech distinguishes the two; both are verbs. So when the value on
 * record is a legitimate sense, it is left as it is.
 *
 * Scoped to the inferred part of speech when there is one — without that, the
 * NOUN sense דִמעָה stored against the verb "tore" would also look legitimate
 * and survive, which is the bug this script exists to fix. With no part of
 * speech to go on, every sense counts, since there is no evidence to overrule
 * what is already there.
 */
function isKnownSense(
  stored: string,
  senses: readonly { pos: string; translations: string[] }[],
  pos: string,
): boolean {
  const scoped = pos === 'UNKNOWN' || pos === 'OTHER' ? senses : senses.filter((s) => s.pos === pos);
  const target = normaliseHebrew(stored);
  return scoped.some((group) => group.translations.some((t) => normaliseHebrew(t) === target));
}

async function main() {
  const rows = await prisma.userWordBank.findMany({
    select: {
      id: true,
      userId: true,
      word: true,
      lemma: true,
      translation: true,
      contextLine: true,
    },
    orderBy: { word: 'asc' },
  });

  console.log(`${rows.length} saved words — re-resolving each.`);
  if (!apply) console.log('(dry run — pass --apply to write)\n');

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const row of rows) {
    // The SURFACE form is the input, never the stored lemma: the lemma is the
    // value under suspicion, and the part-of-speech tagger needs to find the
    // word inside its context line ("tear" does not appear in "and tore you
    // open", but "tore" does).
    const enrichment = enrichWord(row.word, row.contextLine);
    if (!enrichment) {
      console.log(`  SKIP  ${row.word}: no usable word token`);
      skipped += 1;
      continue;
    }

    let lookup: Awaited<ReturnType<typeof lookupWord>>;
    try {
      lookup = await lookupWord(row.word, row.contextLine);
    } catch (err) {
      console.log(`  SKIP  ${row.word}: lookup failed (${(err as Error).message})`);
      skipped += 1;
      continue;
    }

    const translation = lookup.translation;

    if (!HEBREW.test(translation)) {
      console.log(`  SKIP  ${row.word}: still not Hebrew ("${translation}")`);
      skipped += 1;
      continue;
    }

    // Never overwrite a meaning that is already right. Within one part of
    // speech the dictionary's ranking is not evidence, so a stored value that
    // is a legitimate sense stays.
    const storedIsValid =
      HEBREW.test(row.translation) &&
      isKnownSense(row.translation, lookup.senses, lookup.partOfSpeech);

    const lemmaChanged = enrichment.lemma !== row.lemma;
    const translationChanged = translation !== row.translation && !storedIsValid;
    if (!lemmaChanged && !translationChanged) {
      if (storedIsValid && translation !== row.translation) {
        console.log(`  KEEP  ${row.word}: "${row.translation}" is already a valid sense`);
      }
      unchanged += 1;
      continue;
    }

    // (userId, lemma) is unique and a repair can change the lemma. If the
    // corrected one is already taken, this learner holds both the broken and
    // the good entry; merging would mean choosing whose review history
    // survives, so report it and leave the data alone.
    if (lemmaChanged) {
      const clash = await prisma.userWordBank.findUnique({
        where: { userId_lemma: { userId: row.userId, lemma: enrichment.lemma } },
        select: { id: true },
      });
      if (clash && clash.id !== row.id) {
        console.log(
          `  SKIP  ${row.word}: "${enrichment.lemma}" already saved separately — delete one by hand`,
        );
        skipped += 1;
        continue;
      }
    }

    const parts = [
      lemmaChanged ? `lemma ${row.lemma} -> ${enrichment.lemma}` : null,
      translationChanged ? `"${row.translation}" -> "${translation}"` : null,
    ].filter(Boolean);
    console.log(`  FIX   ${row.word}: ${parts.join(', ')}`);

    if (apply) {
      await prisma.userWordBank.update({
        where: { id: row.id },
        data: {
          lemma: enrichment.lemma,
          root: enrichment.root,
          partOfSpeech: enrichment.partOfSpeech,
          cefrLevel: enrichment.cefrLevel,
          forms: serializeForms(enrichment.forms),
          // A valid stored meaning survives even when the family around it is
          // being rebuilt.
          translation: storedIsValid ? row.translation : translation,
        },
      });
    }
    changed += 1;
  }

  console.log(
    `\n${apply ? 'Repaired' : 'Would repair'} ${changed}, left ${unchanged} unchanged, ` +
      `skipped ${skipped}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
