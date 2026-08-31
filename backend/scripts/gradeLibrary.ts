/** DEV: grade the signed-in user's entire ungraded library now (real LRCLIB
 *  lyrics). Run from backend/:  npx tsx scripts/gradeLibrary.ts */
import { prisma } from '../src/lib/prisma.js';
import { gradeLibrary } from '../src/services/gradeLibraryService.js';

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!user) return console.error('No user.');

  console.log('Grading library — this fetches real lyrics for every ungraded track…');
  const { graded, processed, total } = await gradeLibrary(user.id);
  console.log(`\nProcessed ${processed}/${total}. Newly graded: ${graded}.`);

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
