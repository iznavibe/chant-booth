/**
 * Check every booth timing back against the project it came from.
 *
 * A take is recorded against the sweep and dropped back onto the video
 * timeline, so a word that is a tenth out here is a tenth out in the finished
 * cut, and nothing downstream would catch it. The build copies timings rather
 * than computing them, so the check is that every number still appears in the
 * project: each word begins where some syllable begins and ends where one ends,
 * each block is exactly as long as the words it holds, and each row runs
 * forwards.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(process.env.APPDATA, 'com.vibesub.app', 'vibesub-companion', 'projects');
const HERE = path.join(__dirname, '..');
const r2 = (n) => Math.round(n * 100) / 100;

const want = new Map(
  JSON.parse(fs.readFileSync(path.join(HERE, 'songs', 'index.json'), 'utf8'))
    .songs.map((s) => [s.title.toLowerCase(), s]),
);

const project = new Map();
fs.readdirSync(DIR).filter((f) => f.endsWith('.vibelyric')).forEach((f) => {
  const p = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const key = String(p.name || '').replace(/\s+Fanchant\b.*$/i, '').trim().toLowerCase();
  if (want.has(key)) project.set(key, p);
});

let bad = 0;
let words = 0;
want.forEach((song, key) => {
  const p = project.get(key);
  if (!p) { console.log(song.title + ': no project'); bad += 1; return; }

  /*
   * Every moment the project marks, on either row.
   *
   * Matched loosely rather than exactly, because the numbers are rounded to a
   * hundredth as they are written and adding them back up accumulates that. A
   * start is the block's own start plus an offset, two roundings; an end adds a
   * length on top, three. So a start may be 10ms out and an end 15ms, and both
   * are the moment they came from. Anything larger is real drift, and at that
   * point a fan's take would land visibly off the word it was sung to.
   */
  const starts = [];
  const ends = [];
  const rows = [p.lines, p.romaji && p.romaji.lines].filter(Boolean);
  rows.forEach((ls) => ls.forEach((l) => l.syllables.forEach((s) => {
    starts.push(s.start);
    ends.push(s.end);
  })));
  const near = (list, v, slack) => list.some((x) => Math.abs(x - v) <= slack);

  const chants = JSON.parse(fs.readFileSync(path.join(HERE, 'songs', song.name + '.json'), 'utf8')).chants;
  const say = (m) => { console.log('  ' + song.title + ' ' + m); bad += 1; };

  chants.forEach((b) => {
    const all = b.lines.flatMap((l) => l.w);
    if (!all.length) return say(b.id + ': no words');
    const t0 = Math.min(...all.map((w) => w.t));
    const t1 = Math.max(...all.map((w) => w.t + w.d));
    if (r2(t0) !== 0) say(b.id + ': starts ' + r2(t0) + 's after its own start');
    if (Math.abs(r2(t1) - b.dur) > 0.011) say(b.id + ': runs ' + r2(t1) + 's but is ' + b.dur + 's long');

    b.lines.forEach((l, i) => {
      l.w.forEach((w, j) => {
        words += 1;
        // The cheer is built by hand from an annotation, not read off a line.
        if (w.k === '(함성!)' && b.lines.length === 1 && l.w.length === 1) return;
        if (!near(starts, b.at + w.t, 0.011)) say(`${b.id} line${i} "${w.k}": starts ${r2(b.at + w.t)}s, which no syllable does`);
        if (!near(ends, b.at + w.t + w.d, 0.016)) say(`${b.id} line${i} "${w.k}": ends ${r2(b.at + w.t + w.d)}s, which no syllable does`);
        if (w.d <= 0) say(`${b.id} line${i} "${w.k}": lasts ${w.d}s`);
        // A chant sung over a line shares the line and the seconds, and is held
        // after the words it covers, so only words that follow one another in
        // time are expected to follow one another here.
        const prev = l.w[j - 1];
        const apart = prev && w.t >= prev.t + prev.d - 0.05;
        if (prev && apart && w.t + 0.001 < prev.t) say(`${b.id} line${i}: "${w.k}" comes before "${prev.k}"`);
      });
    });

    b.lines.forEach((l, i) => {
      const prev = b.lines[i - 1];
      if (prev && l.w[0].t + 0.05 < prev.w[0].t) say(`${b.id}: line${i} starts before line${i - 1}`);
    });
  });
});

console.log(bad ? `\n${bad} problem(s) in ${words} words` : `\nevery timing checks out, ${words} words across ${want.size} songs`);
process.exitCode = bad ? 1 : 0;
