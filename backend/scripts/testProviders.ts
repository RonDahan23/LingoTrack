/** DEV: verify LRCLIB lyrics + MyMemory translation work live, and prepare a
 *  few real English tracks. Run from backend/: npx tsx scripts/testProviders.ts */
import { prisma } from '../src/lib/prisma.js';
import { LrcLibProvider } from '../src/services/lyrics/lrclibProvider.js';
import { processTrack } from '../src/services/gradingService.js';
import { translateToHebrew } from '../src/services/translationService.js';

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!user) return console.error('No user.');

  const links = await prisma.userTrackProgress.findMany({
    where: { userId: user.id },
    take: 8,
    include: { track: { select: { id: true, title: true, artist: true, durationMs: true } } },
  });

  const provider = new LrcLibProvider();
  let hits = 0;

  console.log('--- LRCLIB + grading (real synced lyrics) ---');
  for (const { track } of links) {
    const lrc = await provider.fetchSyncedLyrics(track);
    if (!lrc) {
      console.log(`  miss   ${track.title} — ${track.artist}`);
      continue;
    }
    hits++;
    const outcome = await processTrack(track.id, provider);
    const firstLine = lrc.split('\n').find((l) => /\]\s*\S/.test(l))?.replace(/\[.*?\]/g, '').trim();
    console.log(`  HIT    ${outcome.level.padEnd(12)} ${track.title} — ${track.artist}  ("${firstLine}")`);
  }
  console.log(`LRCLIB: ${hits}/${links.length} tracks had synced lyrics.\n`);

  console.log('--- MyMemory translation ---');
  for (const w of ['love', 'yesterday', 'freedom']) {
    console.log(`  ${w} -> ${await translateToHebrew(w)}`);
  }
  console.log(`  (line) "I want to break free" -> ${await translateToHebrew('I want to break free')}`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
