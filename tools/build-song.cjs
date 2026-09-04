/**
 * Turn a VibeSub .vibelyric project into a song file for the booth.
 *
 *   node tools/build-song.cjs <project.vibelyric> <name> "<Title>"
 *
 * The unit is a block, not a chant. A block is one screenful in the finished
 * video, and it is what a guide clip would naturally be cut to. Recording a
 * whole block also keeps the spacing between consecutive chants, which
 * recording them one at a time throws away.
 *
 * Within a block only the lines carrying a fanchant are kept. The purely sung
 * lines are izna's and there is nothing for anyone to record against them, so
 * they would be clutter on a phone. Where a dropped line leaves a gap the gap
 * stays, because the timings are absolute: the wait is part of the chant.
 *
 * Timings are copied out untouched, absolute seconds for the block and relative
 * for every word inside it, so a finished take drops back onto the timeline
 * exactly where it came from.
 */
const fs = require('fs');

const [src, name, title] = process.argv.slice(2);
if (!src || !name) {
  console.error('usage: build-song.cjs <project.vibelyric> <name> "<Title>"');
  process.exit(1);
}

const p = JSON.parse(fs.readFileSync(src, 'utf8'));

/** A word is a chant when it sits inside brackets: that is how the video marks them. */
function chantFlags(texts) {
  const flags = [];
  let inside = false;
  for (const t of texts) {
    const opens = t.includes('(');
    if (opens) inside = true;
    flags.push(inside);
    if (t.includes(')')) inside = false;
  }
  return flags;
}

const strip = (t) => t.replace(/[()]/g, '');

// Group lines by the block they are drawn in.
const blocks = new Map();
p.lines.forEach((l, i) => {
  if (!l.syllables.length) return;
  const id = l.blockId || `solo-${i}`;
  if (!blocks.has(id)) blocks.set(id, []);
  blocks.get(id).push(i);
});

const out = [];

// The opening cheer lives as a text box rather than a lyric line, so it has to
// be picked up separately or it is missed entirely.
const cheer = (p.annotations || []).find((a) => /함성|CHEER/i.test(a.text || ''));
if (cheer && cheer.appearAt !== undefined) {
  out.push({
    at: +cheer.appearAt.toFixed(2),
    dur: +(cheer.disappearAt - cheer.appearAt).toFixed(2),
    lines: [{ w: [{ k: '함성!', r: 'CHEER!', t: 0, d: +(cheer.disappearAt - cheer.appearAt).toFixed(2), c: 1 }] }],
  });
}

for (const idx of blocks.values()) {
  const flat = idx.flatMap((i) => p.lines[i].syllables.map((s) => s.text));
  if (!flat.some((t) => t.includes('('))) continue;

  // Brackets run across lines: the intro chant opens on the first line of its
  // block and closes on the third. Flags are worked out over the whole block
  // and handed back per line, or the middle of a chant reads as ordinary lyric.
  const flags = chantFlags(flat);
  let seen = 0;

  const raw = idx.map((i) => {
    const src = p.lines[i].syllables;
    const mine = flags.slice(seen, seen + src.length);
    seen += src.length;
    return { i, src, mine };
  }).filter((l) => l.mine.some(Boolean));

  if (!raw.length) continue;

  // The window covers the kept lines only, so a block that chants at its end
  // does not open with several silent seconds of somebody else's verse.
  const start = Math.min(...raw.map((l) => l.src[0].start));
  const end = Math.max(...raw.map((l) => l.src[l.src.length - 1].end));

  const lines = raw.map(({ i, src, mine }) => {
    const ro = (p.romaji && p.romaji.lines[i] && p.romaji.lines[i].syllables) || [];
    return {
      w: src.map((s, j) => ({
        k: strip(s.text).trim(),
        r: strip((ro[j] && ro[j].text) || '').trim(),
        t: +(s.start - start).toFixed(2),
        d: +(s.end - s.start).toFixed(2),
        c: mine[j] ? 1 : 0,
      })),
    };
  });

  out.push({ at: +start.toFixed(2), dur: +(end - start).toFixed(2), lines });
}

out.sort((a, b) => a.at - b.at);
out.forEach((b, i) => { b.id = 'b' + (i + 1); });

const song = { title: title || name.toUpperCase(), artist: 'izna', chants: out };
fs.writeFileSync(`songs/${name}.json`, JSON.stringify(song, null, 1));

out.forEach((b, i) => {
  const words = b.lines.flatMap((l) => l.w);
  const shout = words.filter((w) => w.c).map((w) => w.k).join(' ');
  console.log(
    String(i + 1).padStart(2),
    `${b.at}s`.padStart(8),
    `${b.dur}s`.padStart(6),
    `${b.lines.length}L`,
    '|',
    shout.slice(0, 60)
  );
});
console.log(`\nsongs/${name}.json: ${out.length} blocks`);
