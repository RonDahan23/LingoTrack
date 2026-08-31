/** DEV: re-grade every track that has stored lyrics, applying the current
 *  engine/weights (no lyric re-fetch). Run after a calibration change.
 *  From backend/:  npx tsx scripts/regradeAll.ts */
import { prisma } from '../src/lib/prisma.js';
import { gradeStoredTrack } from '../src/services/gradingService.js';

async function main() {
  const tracks = await prisma.track.findMany({
    where: { lyricsSynced: true },
    select: { id: true },
  });
  console.log(`Re-grading ${tracks.length} tracks with current weights…`);

  for (const t of tracks) {
    try {
      await gradeStoredTrack(t.id);
    } catch {
      /* skip */
    }
  }

  const counts = await prisma.track.groupBy({ by: ['difficultyLevel'], _count: true });
  console.log('\nLibrary distribution:');
  for (const c of counts) console.log(`  ${c.difficultyLevel.padEnd(12)} ${c._count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
