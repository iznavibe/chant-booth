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
 * anywhere near them. Brackets are honoured too, so a chant typed straight into
 * the lyric line is not missed, and a run between an opening and closing
 * bracket counts even where it crosses a line.
 *
 * But brackets are also ordinary punctuation. SIGN writes its backing vocals
 * as "Green light (oh oh oh oh)", where the crowd shouts the green light and
 * izna sing the rest, and reading those brackets as a chant hands a fan four
 * ohs that are not theirs. What separates the two cases is the colour: on a
 * line where the fanchant button has been used at all, it has already said
 * which words are the crowd's and brackets add nothing. Brackets speak only
 * for a line the colour says nothing about. Every bracketed chant in the ten
 * songs is on such a line, and every bracket on a painted line is punctuation.
 *
 * The state still carries across lines either way, since a bracket opened on
 * an unpainted line can close on a painted one.
 */
function chantFlags(lines, fanchant) {
  const want = (fanchant.baseColor || '').toLowerCase();
  const painted = (s) => !!s.baseColor && s.baseColor.toLowerCase() === want;
  const flags = [];
  let inside = false;
  lines.forEach((sylls) => {
    const spoken = sylls.some(painted);
    sylls.forEach((s) => {
      if (s.text.includes('(')) inside = true;
      flags.push(painted(s) || (inside && !spoken));
      if (s.text.includes(')')) inside = false;
    });
  });
  return flags;
}

/**
 * The text as a fan should read it, which is not quite how the video writes it.
 *
 * The video spells the group's name out, 이.즈.나.야, because that is how the
 * karaoke sweep steps through it. Someone learning the chant off a phone wants
 * the word. The cue to shout keeps its brackets, though: 함성 and CHEER are
 * directions rather than lyrics, and losing the brackets made them look like
 * something to sing.
 */
const NAMES = [
  [/이[.\-·!]즈[.\-·!]나[.\-·!]야/g, '이즈나야'],
  [/이[.\-·!]즈[.\-·!]나/g, '이즈나'],
  [/i[.\-·!]z[.\-·!]na[.\-·!]ya/gi, 'iznaya'],
  [/i[.\-·!]z[.\-·!]na/gi, 'izna'],
  // A dash inside a member's name is the sweep stepping through it, not a held
  // note, so 코-코 is 코코. Elsewhere a dash is length and is left alone.
  [/마[-·]이/g, '마이'],
  [/코[-·]코/g, '코코'],
  [/Ma[-·]i/gi, 'Mai'],
  [/Ko[-·]ko/gi, 'Koko'],
];

/**
 * Names that arrive split across several units.
 *
 * The video cuts a word wherever the sweep needs a step, so "iznaya" can be
 * three units, `iz` `na` `ya!`, which reads as three separate things to shout.
 * Where neighbouring units spell one of these, they are put back together. The
 * check is against this list rather than a rule about spaces, because a Korean
 * line is cut one syllable per unit and a rule would weld every line into one
 * word.
 */
const WHOLE = [
  'iznaya', 'izna', 'naya', 'koko', 'mai', '이즈나야', '이즈나', '나야',
  '함성', 'cheer',
];
const bare = (t) => t.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

/**
 * How many syllables a piece of romaji is worth.
 *
 * Used only as a ceiling on how many lyric syllables may be folded into one
 * word. Where a romaji row's timings are loose, one word can appear to cover a
 * syllable belonging to the next, and 하늘 위로 comes out as 하늘위 and 로.
 * Counting nuclei stops the fold before it reaches that far. Korean vowels are
 * often two letters, so the digraphs are listed before the single ones.
 */
const NUCLEUS = /(?:yeo|weo|wae|yae|eo|eu|ae|oe|ui|wa|we|wi|ya|yo|yu|ye|[aeiou])/g;
function syllablesIn(text) {
  const m = text.toLowerCase().match(NUCLEUS);
  return m ? m.length : 1;
}

function joinNames(words) {
  const out = [];
  for (let i = 0; i < words.length; i += 1) {
    let took = 1;
    for (let n = 4; n >= 2; n -= 1) {
      if (i + n > words.length) continue;
      const run = words.slice(i, i + n);
      // Only a run with nothing but the word in it: a space means two words.
      if (run.slice(0, -1).some((w) => /\s$/.test(w.k))) continue;
      if (!WHOLE.includes(bare(run.map((w) => w.k).join('')))) continue;
      out.push({
        ...run[0],
        k: run.map((w) => w.k).join(''),
        r: run.map((w) => w.r).join(''),
        d: +(run[run.length - 1].t + run[run.length - 1].d - run[0].t).toFixed(2),
        c: run.some((w) => w.c) ? 1 : 0,
        s: run.some((w) => w.s) ? 1 : 0,
      });
      took = n;
      break;
    }
    if (took === 1) out.push(words[i]);
    i += took - 1;
  }
  return out;
}

/**
 * Punctuation that opens a unit belongs to the one before it.
 *
 * "Mai" then ", Bang Jeemin," reads as a stray comma waiting for a word. The
 * comma ends the name in front of it, so that is where it goes.
 */
function tidyCommas(words) {
  const shift = (key) => {
    for (let i = 1; i < words.length; i += 1) {
      const m = /^([,.!?;:]+)\s*/.exec(words[i][key]);
      if (!m || !words[i - 1][key]) continue;
      words[i][key] = words[i][key].slice(m[0].length);
      words[i - 1][key] = words[i - 1][key].replace(/\s*$/, '') + m[1];
    }
  };
  // The two rows are punctuated independently: a comma can lead the romaji
  // while the lyric above it has none, so each is walked on its own.
  shift('k');
  shift('r');
  return words.filter((w) => w.k.trim().length || w.r.trim().length);
}

/**
 * A word spelled out for the sweep, put back together.
 *
 * The video writes 메!트!로!놈! and Me.t.ro.nome because the karaoke steps
 * through them a piece at a time. Someone learning the chant wants the word.
 *
 * Two things are left alone. A dash is length, not spelling: 마-이 and
 * SA-A-A-AIGN are held, not spelled, and joining them would be wrong. And a run
 * of single letters is an initialism, so R.I.P stays R.I.P.
 */
const SPELLED = /^(?:[^\s.!·]{1,4}[.!·]){2,}[^\s.!·]{0,4}[.!·]?$/;
const INITIALS = /^(?:[A-Za-z][.!·]){2,}[A-Za-z]?[.!·]?$/;

function unspell(piece) {
  if (!SPELLED.test(piece) || INITIALS.test(piece)) return piece;
  return piece.replace(/[.!·]/g, '');
}

function strip(t) {
  let out = t.replace(/[()]/g, '');
  for (const [re, to] of NAMES) out = out.replace(re, to);
  return out.replace(/\S+/g, unspell);
}

/**
 * The cue to shout keeps its brackets, and it is done last.
 *
 * 함성 and CHEER are directions rather than lyrics, and bare they look like
 * something to sing. It waits until the words have been put back together,
 * because the video sometimes cuts the cue itself in two and half of it would
 * not be recognised on its own.
 */
/**
 * A name keeps the same punctuation on both rows.
 *
 * The lyric writes 이즈나! and its romaji izna, because the two rows were typed
 * separately and the exclamation only made it onto one of them. It is the same
 * shout either way.
 */
function matchNamePunctuation(words) {
  return words.map((w) => {
    if (!WHOLE.includes(bare(w.k)) && !WHOLE.includes(bare(w.r))) return w;
    const tail = (t) => (/([!?]+)\s*$/.exec(t) || ['', ''])[1];
    const kt = tail(w.k);
    const rt = tail(w.r);
    if (kt && !rt && w.r) return { ...w, r: w.r.replace(/\s*$/, '') + kt };
    if (rt && !kt && w.k) return { ...w, k: w.k.replace(/\s*$/, '') + rt };
    return w;
  });
}

function bracketCues(words) {
  const isCue = (t) => /^(함성|cheer)$/i.test(bare(t));
  return words.map((w) => {
    if (!isCue(w.k) && !isCue(w.r)) return w;
    const wrap = (t) => (t.trim() ? t.replace(/^(\s*)(.*?)(\s*)$/, '$1($2)$3') : t);
    return { ...w, k: wrap(w.k), r: wrap(w.r) };
  });
}

// Group lines by the block they are drawn in.
const blocks = new Map();
p.lines.forEach((l, i) => {
  if (!l.syllables.length) return;
  const id = l.blockId || `solo-${i}`;
  if (!blocks.has(id)) blocks.set(id, []);
  blocks.get(id).push(i);
});

const out = [];
const mismatched = [];

// The opening cheer lives as a text box rather than a lyric line, so it has to
// be picked up separately or it is missed entirely.
const cheer = (p.annotations || []).find((a) => /함성|CHEER/i.test(a.text || ''));
if (cheer && cheer.appearAt !== undefined) {
  out.push({
    at: +cheer.appearAt.toFixed(2),
    dur: +(cheer.disappearAt - cheer.appearAt).toFixed(2),
    // Built by hand rather than read off a lyric line, so it has to be written
    // the way strip() would have written it.
    lines: [{
      w: [{
        k: '(함성!)',
        r: '(CHEER!)',
        t: 0,
        d: +(cheer.disappearAt - cheer.appearAt).toFixed(2),
        c: 1,
      }],
    }],
  });
}

for (const idx of blocks.values()) {
  // Brackets run across lines: the intro chant opens on the first line of its
  // block and closes on the third. Flags are worked out over the whole block
  // and handed back per line, or the middle of a chant reads as ordinary lyric.
  const flags = chantFlags(idx.map((i) => p.lines[i].syllables), p.fanchant || {});
  let seen = 0;

  const all = idx.map((i) => {
    const src = p.lines[i].syllables;
    const mine = flags.slice(seen, seen + src.length);
    seen += src.length;
    return { i, src, mine };
  });

  let first = all.findIndex((l) => l.mine.some(Boolean));
  if (first === -1) continue;
  let last = first;
  all.forEach((l, n) => { if (l.mine.some(Boolean)) last = n; });

  /*
   * A chant that outlasts its own line drags the block along with it.
   *
   * The cue to cheer is one word held for four seconds while izna sing two more
   * lines underneath. Measuring the block by its lines cut that to the one it
   * was written on, so the sweep ended while the cheer was still going. The run
   * reaches forward to whatever the longest chant in it is still covering.
   */
  const chantEnd = () => Math.max(...all.slice(first, last + 1)
    .flatMap((l) => l.src.filter((s, j) => l.mine[j]).map((s) => s.end)));
  const lineEnd = (n) => all[n].src[all[n].src.length - 1].end;
  // Only where the chant really runs past the line it is written on. A chant
  // ending with its own line has not outlasted anything, and the line after it
  // merely overlaps, which is a different thing and not the block's business.
  while (last + 1 < all.length
    && chantEnd() > lineEnd(last) + 0.05
    && all[last + 1].src[0].start < chantEnd() - 0.05) last += 1;

  /*
   * A line sung at the same time as a chant comes with it.
   *
   * The two are one moment on screen: izna singing and the crowd answering
   * over the top. Keeping only the chant left the answer with nothing to answer,
   * and put a later line above an earlier one.
   */
  while (first > 0) {
    const before = all[first - 1].src;
    const runStart = all[first].src[0].start;
    if (before[before.length - 1].end <= runStart + 0.05) break;
    first -= 1;
  }

  /*
   * A line whose chant lands almost at once needs the line before it.
   *
   * "Y O U" and BEEP's last block open on the shout, so there is nothing to
   * come in off and the previous line has to supply it. A line that sings for
   * a while before its own chant already provides that, and taking another line
   * only crowds the screen with words nobody is being asked to shout.
   *
   * The second rule is for a pair of lines that goes by too fast to read, which
   * is a different complaint and only ever applies to a pair.
   */
  const leadIn = () => {
    const l = all[first];
    const at = l.src.findIndex((u, j) => l.mine[j]);
    return at < 0 ? 0 : l.src[at].start - l.src[0].start;
  };
  const span = () => all[last].src[all[last].src.length - 1].end - all[first].src[0].start;
  while (first > 0
    && ((last - first + 1 < 2 && leadIn() < 1)
      || (last - first + 1 === 2 && span() < 4))) first -= 1;

  out.push({ ...assemble(all, first, last), all, first, last });
}

/**
 * Turn a run of lines into a block: the words, and the seconds they cover.
 *
 * Separate from choosing the run so that a block can be assembled twice. The
 * hand edits below change which lines a block holds and need the words built
 * again from the new run.
 */
function assemble(all, first, last) {
  const raw = all.slice(first, last + 1);

  // The window covers the kept run only, so a block that chants at its end does
  // not open with several silent seconds of somebody else's verse.
  const start = Math.min(...raw.map((l) => l.src[0].start));
  const end = Math.max(...raw.map((l) => l.src[l.src.length - 1].end));

  /*
   * Lines are shown in the order they happen, not the order they are stored.
   *
   * A chant sung over a line is a separate line in the project, kept after the
   * one it covers, and it often begins first: the crowd comes in ahead of the
   * words it answers. Where two begin together the longer one leads, since it
   * is the frame the other sits inside, and where they are identical the
   * project's own order stands.
   */
  raw.sort((x, y) => {
    const a = x.src[0].start - y.src[0].start;
    if (Math.abs(a) > 0.05) return a;
    // Both tests are loose on purpose. Two lines drawn as one moment are timed
    // by hand and land a hundredth apart, which is not an order, and reading
    // one as an order swaps a pair that was already right.
    const b = y.src[y.src.length - 1].end - x.src[x.src.length - 1].end;
    return Math.abs(b) > 0.25 ? b : 0;
  });

  const lines = raw.map(({ i, src, mine }) => {
    const roRaw = (p.romaji && p.romaji.lines[i] && p.romaji.lines[i].syllables) || [];
    /*
     * The rows are paired by time, not by position.
     *
     * They are often cut differently: 하늘 위로 is four syllables in the lyric
     * and two words in its romaji, so lining them up by index puts a word under
     * the wrong syllable. Both carry timings, so each word takes the romaji that
     * overlaps it most, and a romaji already spoken for is not repeated under
     * the syllable after it. Where the cuts do match, position is used, which is
     * the same answer and cheaper.
     */
    const even = roRaw.length === src.length;
    if (roRaw.length && !even) {
      mismatched.push(`line ${i}: ${src.length} words, ${roRaw.length} romaji`);
    }

    /*
     * Every romaji finds a word, and words sharing one become one.
     *
     * The rows are cut independently and either can be the finer. Where the
     * romaji is finer, asking each word for its single best romaji drops the
     * extras, so instead each romaji is asked which word it belongs to and a
     * word that draws several keeps them all.
     *
     * Where the lyric is the finer, the reverse shows up on screen: 다음은 is
     * one romaji word but three syllables in the lyric, and left alone it reads
     * as three things with the romaji under the first. Syllables that share a
     * romaji are therefore one word, which is what they are.
     *
     * Rows are kept apart, since a chant sung over a line covers the same
     * seconds as the words underneath it.
     */
    const rowOf = (u) => u.row || 0;
    const overlap = (x, y) => Math.min(x.end, y.end) - Math.max(x.start, y.start);

    // Which romaji each word sits under, whether or not it is the only one.
    const owner = src.map((u) => {
      if (even) return -1;
      let best = -1;
      let most = 0;
      roRaw.forEach((r, k) => {
        if (rowOf(r) !== rowOf(u)) return;
        const over = overlap(u, r);
        if (over > most) { most = over; best = k; }
      });
      return best;
    });

    /*
     * Words split for the sweep are put back together.
     *
     * Two ways they get split. A word can be cut mid-letter, "me" then
     * "tronome", to give the sweep a step in the middle of it; the giveaway is
     * a piece ending in a letter with the next beginning in one and no space
     * between, which never happens across a word boundary. Or the lyric is cut
     * finer than its romaji, several syllables under one romaji word, which is
     * capped at however many syllables that romaji has so a loose timing cannot
     * drag in the syllable after it.
     */
    // Hangul only where the two rows are cut alike. Where they are not, the
    // romaji is the better guide to where the words are, and following letters
    // instead would run 하늘 and 위로 together.
    const letter = even ? /[A-Za-z가-힣]/ : /[A-Za-z]/;
    const midWord = (a2, b2) =>
      letter.test(a2.text.slice(-1)) && letter.test(b2.text[0] || '');

    const groups = [];
    src.forEach((u, n) => {
      const prev = groups[groups.length - 1];
      const room = owner[n] >= 0 ? syllablesIn(roRaw[owner[n]].text) : 1;
      const sameRomaji = prev
        && owner[n] >= 0
        && owner[n] === owner[prev.at]
        && prev.units.length < room;
      const joined = prev && midWord(prev.units[prev.units.length - 1], u);
      /*
       * Never across the edge of a chant.
       *
       * The crowd answers the last syllable of a line: izna sing 내 마음이 and
       * the answer is the 이 alone. Joining that syllable to the word in front
       * of it would hand the fan the whole word to shout, which is not the
       * chant. A word split by the sweep always shares one flag.
       */
      const sameFlag = prev && !!mine[n] === !!mine[prev.at + prev.units.length - 1];
      if (prev && sameFlag && (sameRomaji || joined) && rowOf(u) === rowOf(src[prev.at])) {
        prev.units.push(u);
      } else {
        groups.push({ at: n, units: [u] });
      }
    });

    // And every romaji goes to the group it belongs to.
    const parts = groups.map(() => []);
    roRaw.forEach((r) => {
      let best = -1;
      let most = 0;
      groups.forEach((g, n) => {
        if (rowOf(src[g.at]) !== rowOf(r)) return;
        const span = { start: g.units[0].start, end: g.units[g.units.length - 1].end };
        const over = overlap(span, r);
        if (over > most) { most = over; best = n; }
      });
      if (best >= 0) parts[best].push(r.text);
    });

    return {
      w: bracketCues(matchNamePunctuation(joinNames(tidyCommas(groups.map((g, n) => {
        const first = g.units[0];
        const last = g.units[g.units.length - 1];
        return {
          k: strip(g.units.map((u) => u.text).join('')).trim(),
          r: strip(even
            ? g.units.map((u, m) => (roRaw[g.at + m] && roRaw[g.at + m].text) || '').join('')
            : parts[n].join('')).trim(),
          t: +(first.start - start).toFixed(2),
          d: +(last.end - first.start).toFixed(2),
          c: g.units.some((u, m) => mine[g.at + m]) ? 1 : 0,
          // Struck through in the video: izna's word that the chant talks over.
          // Not the fan's to sing, but they need to see where they land on it.
          s: g.units.some((u) => u.strike) ? 1 : 0,
        };
      }))))),
    };
  });

  return { at: +start.toFixed(2), dur: +(end - start).toFixed(2), lines };
}

out.sort((a, b) => a.at - b.at);
out.forEach((b, i) => { b.id = 'b' + (i + 1); });

/**
 * Hand edits, block by block.
 *
 * The rules above get a block right nearly always. Where they do not, the fix
 * is usually a judgement about this one screen rather than a rule waiting to be
 * found, and chasing one of these with a new rule has twice moved blocks in
 * nine other songs. So they are written down here instead, where the reach of
 * each is exactly one block.
 *
 *   pickup  how many words off the end of the line before the block to keep in
 *           front of its first line. RIP's "My evil side" is sung straight out
 *           of the line above it with no breath between the two, and the chant
 *           lands on its second word, so a fan reading only "My evil side" has
 *           nothing to come in on. The rest of that line is not wanted, only
 *           the word that runs into the entry.
 */
const BY_HAND = {
  rip: { b2: { pickup: 1 } },
};

Object.entries(BY_HAND[name] || {}).forEach(([id, edit]) => {
  const b = out.find((x) => x.id === id);
  if (!b) { console.log('no ' + id + ' to edit'); return; }
  if (edit.pickup) {
    if (!b.first) { console.log(id + ': nothing in front to pick up from'); return; }
    const grown = assemble(b.all, b.first - 1, b.last);
    const head = grown.lines[0].w.slice(-edit.pickup);
    if (!head.length) { console.log(id + ': no words to pick up'); return; }
    grown.lines[1].w = head.concat(grown.lines[1].w);
    grown.lines.shift();
    // Built with the extra line in, so the seconds are measured again without
    // the part of it that was dropped.
    Object.assign(b, assembleAgain(grown));
  }
});

/**
 * Re-measure a block after its words have been edited.
 *
 * A block is normally as long as the run it was cut to, but an edit that drops
 * the front of a line leaves it starting seconds before anything is shown. Only
 * an edited block is measured this way: word timings are rounded to a
 * hundredth, so reading the length back off them would cost every other block a
 * hundredth of its own for nothing.
 */
function assembleAgain(b) {
  const t0 = Math.min(...b.lines.flatMap((l) => l.w.map((w) => w.t)));
  const t1 = Math.max(...b.lines.flatMap((l) => l.w.map((w) => w.t + w.d)));
  b.lines.forEach((l) => l.w.forEach((w) => { w.t = +(w.t - t0).toFixed(2); }));
  return { at: +(b.at + t0).toFixed(2), dur: +(t1 - t0).toFixed(2), lines: b.lines };
}

out.forEach((b) => { delete b.all; delete b.first; delete b.last; });

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
if (mismatched.length) {
  console.log(
    `
${mismatched.length} line(s) cut differently from their romaji, matched by time:`
  );
  mismatched.forEach((m) => console.log('  ' + m));
}
