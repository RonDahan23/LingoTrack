/**
 * DEV: re-fetch REAL synced lyrics (LRCLIB) for every track currently marked
 * lyricsSynced — replacing the old placeholder/seed lyrics. Tracks LRCLIB can't
 * match, or whose lyrics aren't English, are reset to UNGRADED (drop off tabs).
 * Run from backend/:  npx tsx scripts/reprepareAll.ts
 */
import { prisma } from '../src/lib/prisma.js';
import { LrcLibProvider } from '../src/services/lyrics/lrclibProvider.js';
import { processTrack } from '../src/services/gradingService.js';

async function main() {
  const tracks = await prisma.track.findMany({
    where: { lyricsSynced: true },
    select: { id: true, title: true, artist: true },
    orderBy: { title: 'asc' },
  });

  console.log(`Re-preparing ${tracks.length} tracks with real LRCLIB lyrics...\n`);
  const provider = new LrcLibProvider();
  let real = 0;
  let dropped = 0;

  for (const track of tracks) {
    const outcome = await processTrack(track.id, provider);
    if (outcome.graded) {
      real++;
      console.log(`  REAL  ${outcome.level.padEnd(12)} ${track.title} — ${track.artist}`);
    } else {
      dropped++;
      console.log(`  drop  (${outcome.reason ?? 'no lyrics'})  ${track.title} — ${track.artist}`);
    }
  }

  console.log(`\nDone. ${real} now have real lyrics; ${dropped} reset to UNGRADED.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
