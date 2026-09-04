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
 * A block is trimmed to the run from its first chanting line to its last.
 * Leading and trailing sung lines are izna's alone and only crowd a phone
 * screen, but a sung line *between* two chants is kept: it is what a fan counts
 * through while waiting for their next entry, and without it the gap in the
 * sweep looks like a mistake.
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

/**
 * Which words are the crowd's.
 *
 * The marking that counts is the fanchant colour, the one the fanchant button
 * paints on: 58 words in BEEP carry it against 31 that sit in brackets, and
 * whole chants like the 치우고 / 지우고 answers are coloured with no brackets
 * anywhere near them. Brackets are still honoured, so a chant typed straight
 * into the lyric line is not missed, and the run between an opening and closing
 * bracket counts even where it crosses a line.
 */
function chantFlags(sylls, fanchant) {
  const want = (fanchant.baseColor || '').toLowerCase();
  const flags = [];
  let inside = false;
  for (const s of sylls) {
    if (s.text.includes('(')) inside = true;
    const painted = !!s.baseColor && s.baseColor.toLowerCase() === want;
    flags.push(inside || painted);
    if (s.text.includes(')')) inside = false;
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
  const flat = idx.flatMap((i) => p.lines[i].syllables);

  // Brackets run across lines: the intro chant opens on the first line of its
  // block and closes on the third. Flags are worked out over the whole block
  // and handed back per line, or the middle of a chant reads as ordinary lyric.
  const flags = chantFlags(flat, p.fanchant || {});
  let seen = 0;

  const all = idx.map((i) => {
    const src = p.lines[i].syllables;
    const mine = flags.slice(seen, seen + src.length);
    seen += src.length;
    return { i, src, mine };
  });

  const first = all.findIndex((l) => l.mine.some(Boolean));
  if (first === -1) continue;
  let last = first;
  all.forEach((l, n) => { if (l.mine.some(Boolean)) last = n; });
  const raw = all.slice(first, last + 1);

  // The window covers the kept run only, so a block that chants at its end does
  // not open with several silent seconds of somebody else's verse.
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
        // Struck through in the video: izna's word that the chant talks over.
        // Not the fan's to sing, but they need to see where they land on it.
        s: s.strike ? 1 : 0,
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
  const struck = words.filter((w) => w.s).length;
  console.log(
    String(i + 1).padStart(2),
    `${b.at}s`.padStart(8),
    `${b.dur}s`.padStart(6),
    `${b.lines.length}L`,
    '|',
    shout.slice(0, 52) + (struck ? `  [${struck} struck]` : '')
  );
});
console.log(`\nsongs/${name}.json: ${out.length} blocks`);
