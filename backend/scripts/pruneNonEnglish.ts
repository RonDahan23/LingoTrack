/** DEV: remove already-ingested non-English tracks for the signed-in user.
 *  Run from backend/:  npx tsx scripts/pruneNonEnglish.ts */
import { prisma } from '../src/lib/prisma.js';
import { pruneNonEnglishTracks } from '../src/services/syncService.js';
import { isEnglishTrack } from '../src/services/languageFilter.js';

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!user) return console.error('No user.');

  const before = await prisma.userTrackProgress.count({ where: { userId: user.id } });

  // Preview a few that will be removed.
  const all = await prisma.track.findMany({
    where: { userProgress: { some: { userId: user.id } } },
    select: { title: true, artist: true },
  });
  const doomed = all.filter((t) => !isEnglishTrack(t.title, t.artist));
  console.log(`Non-English tracks to remove: ${doomed.length} of ${before}`);
  for (const t of doomed.slice(0, 15)) console.log(`  - ${t.title} — ${t.artist}`);
  if (doomed.length > 15) console.log(`  … and ${doomed.length - 15} more`);

  const removed = await pruneNonEnglishTracks(user.id);
  const after = await prisma.userTrackProgress.count({ where: { userId: user.id } });
  console.log(`\nRemoved ${removed}. Library: ${before} -> ${after} tracks (English only).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
