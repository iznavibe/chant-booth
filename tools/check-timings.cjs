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
let steps = 0;
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

        /*
         * The steps a welded word is swept in have to be the word.
         *
         * They are what makes 만 hold while 감아봤지 goes by, so each one has to
         * begin and end on a moment the project marks, they have to run
         * forwards, and together they have to cover the word and nothing more.
         * A step out of place would put the colour somewhere izna is not.
         */
        [['p', 'lyric'], ['rp', 'romaji']].forEach(([key, row]) => {
          const beats = w[key];
          if (!beats) return;
          steps += beats.length;
          if (beats.length < 2) say(`${b.id} "${w.k}": a single ${row} step is no step`);
          /*
           * Inside the word, rather than exactly the word.
           *
           * A word takes its own start and length from the lyric, and the
           * romaji row is timed by hand separately: TIMEBOMB has 애써 외면
           * beginning at 42.306s and its aesseo at 42.392s, which is the
           * project's own reading of the line and not a fault. Steps that
           * begin late simply hold the colour where it was, so what matters
           * is that none of them fall outside the word.
           */
          const last = beats[beats.length - 1];
          if (beats[0][1] < w.t - 0.011) say(`${b.id} "${w.k}": ${row} steps start ${beats[0][1]}s, before the word at ${w.t}s`);
          if (last[1] + last[2] > w.t + w.d + 0.016) say(`${b.id} "${w.k}": ${row} steps end ${r2(last[1] + last[2])}s, after the word at ${r2(w.t + w.d)}s`);
          if (beats[0][1] > w.t + 0.25) say(`${b.id} "${w.k}": ${row} steps start ${r2(beats[0][1] - w.t)}s into the word`);
          if (last[1] + last[2] < w.t + w.d - 0.25) say(`${b.id} "${w.k}": ${row} steps end ${r2(w.t + w.d - last[1] - last[2])}s before the word does`);
          beats.forEach(([text, bt, bd], n) => {
            if (bd <= 0) say(`${b.id} "${w.k}": ${row} step "${text}" lasts ${bd}s`);
            if (!near(starts, b.at + bt, 0.011)) say(`${b.id} "${w.k}": ${row} step "${text}" starts ${r2(b.at + bt)}s, which no syllable does`);
            if (!near(ends, b.at + bt + bd, 0.016)) say(`${b.id} "${w.k}": ${row} step "${text}" ends ${r2(b.at + bt + bd)}s, which no syllable does`);
            const was = beats[n - 1];
            if (was && bt + 0.011 < was[1] + was[2]) say(`${b.id} "${w.k}": ${row} step "${text}" starts before the one before it ends`);
          });
        });
      });
    });

    /*
     * Lines run forwards, unless this block was ordered by hand.
     *
     * A cheer held across the line that follows it begins first and would lead
     * on time alone, and one block is written the other way round on purpose.
     * The block says so itself, so the exception cannot spread quietly to a
     * block that simply came out wrong.
     */
    if (!b.ordered) {
      b.lines.forEach((l, i) => {
        const prev = b.lines[i - 1];
        if (prev && l.w[0].t + 0.05 < prev.w[0].t) say(`${b.id}: line${i} starts before line${i - 1}`);
      });
    }
  });
});

console.log('');
console.log(bad
  ? `${bad} problem(s) in ${words} words`
  : `every timing checks out: ${words} words, ${steps} sweep steps, ${want.size} songs`);
process.exitCode = bad ? 1 : 0;
