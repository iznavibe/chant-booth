/**
 * List the songs, so the front page has something to offer.
 *
 *   node tools/build-index.cjs
 *
 * Reads every songs/*.json and writes songs/index.json. Run it after adding a
 * song; nothing else has to change.
 */
const fs = require('fs');

const songs = fs
  .readdirSync('songs')
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => {
    const name = f.replace(/\.json$/, '');
    const j = JSON.parse(fs.readFileSync('songs/' + f, 'utf8'));
    const blocks = j.chants.length;
    const seconds = j.chants.reduce((n, b) => n + b.dur + 2.5, 0);
    const shouts = j.chants.reduce(
      (n, b) => n + b.lines.flatMap((l) => l.w).filter((w) => w.c).length,
      0
    );
    return { name, title: j.title, blocks, shouts, minutes: +(seconds / 60).toFixed(1) };
  })
  .sort((a, b) => a.title.localeCompare(b.title));

fs.writeFileSync('songs/index.json', JSON.stringify({ songs }, null, 1));
songs.forEach((s) =>
  console.log(
    s.title.padEnd(12),
    String(s.blocks).padStart(3) + ' blocks',
    String(s.shouts).padStart(4) + ' shouts',
    s.minutes + ' min'
  )
);
console.log(`\nsongs/index.json: ${songs.length} songs`);
