/** OPS: repair word-bank rows whose translation is not actually Hebrew.
 *
 *  A lemmatizer bug turned words ending in -er into non-words ("conquer" ->
 *  "conqu"); the translator echoed the non-word back, and the echo was stored
 *  as the word's meaning. Both holes are closed, but rows written before that
 *  are still in people's banks, so they need re-resolving.
 *
 *  Re-enriches each broken row from its SURFACE form and stored context line,
 *  then re-resolves the translation through the current lookup. SRS columns are
 *  never touched — a repair must not cost anyone their review history.
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

async function main() {
  const rows = await prisma.userWordBank.findMany({
    select: { id: true, userId: true, word: true, lemma: true, translation: true, contextLine: true },
  });

  // Two symptoms, two detections. A translation with no Hebrew is the obvious
  // one ("conquer" -> "conqu"). The subtler one carries Hebrew letters and is
  // still wrong: "tired" lemmatised to the non-word "tir", which Google
  // rendered phonetically as "טיר". That passes any script check, so it is
  // caught instead by re-deriving the lemma from the stored surface form — a
  // row whose lemma the current lemmatizer would not produce was written by
  // the broken one.
  const broken = rows.filter((r) => {
    if (!HEBREW.test(r.translation)) return true;
    const current = enrichWord(r.word, r.contextLine);
    return current !== null && current.lemma !== r.lemma;
  });

  console.log(`${rows.length} saved words, ${broken.length} needing repair.`);
  if (broken.length === 0) return;
  if (!apply) console.log('(dry run — pass --apply to write)\n');

  let fixed = 0;
  let skipped = 0;

  for (const row of broken) {
    // The surface form is what the learner actually tapped; the stored lemma is
    // the value under suspicion, so it must not be the input to the repair.
    const enrichment = enrichWord(row.word, row.contextLine);
    if (!enrichment) {
      console.log(`  SKIP  ${row.word}: no usable word token`);
      skipped += 1;
      continue;
    }

    let translation: string;
    try {
      translation = (await lookupWord(row.word, row.contextLine)).translation;
    } catch (err) {
      console.log(`  SKIP  ${row.word}: lookup failed (${(err as Error).message})`);
      skipped += 1;
      continue;
    }

    if (!HEBREW.test(translation)) {
      console.log(`  SKIP  ${row.word}: still not Hebrew ("${translation}")`);
      skipped += 1;
      continue;
    }

    // (userId, lemma) is unique, and the repair can change the lemma — if the
    // corrected one is already taken, the learner has both the broken and the
    // good entry. Merging would mean choosing whose review history survives,
    // so report it and leave the data alone.
    if (enrichment.lemma !== row.lemma) {
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

    console.log(
      `  FIX   ${row.word}: ${row.lemma} -> ${enrichment.lemma}, ` +
        `"${row.translation}" -> "${translation}"`,
    );

    if (apply) {
      await prisma.userWordBank.update({
        where: { id: row.id },
        data: {
          lemma: enrichment.lemma,
          root: enrichment.root,
          partOfSpeech: enrichment.partOfSpeech,
          cefrLevel: enrichment.cefrLevel,
          forms: serializeForms(enrichment.forms),
          translation,
        },
      });
    }
    fixed += 1;
  }

  console.log(`\n${apply ? 'Repaired' : 'Would repair'} ${fixed}, skipped ${skipped}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
