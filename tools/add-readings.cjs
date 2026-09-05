/**
 * Give every word a reading in the other script.
 *
 * The booth shows two rows: the words as the video writes them, and a reading
 * underneath. Which reading is useful depends on who is looking. A Korean fan
 * reading DUMB HOT wants the Japanese in Hangul; a Japanese fan reading BEEP
 * wants the Korean in katakana. Neither wants Latin romaji, which is a third
 * script they are only reading because it was the one we had.
 *
 * So a Korean song gains `ja` and a Japanese song gains `ko`, and the romaji
 * row already there stays as the English one. A word only carries the extra
 * where it differs from the romaji: "BEEP" is "BEEP" in every script, and
 * storing it three times says nothing.
 *
 * The conversion is VibeSub's own, imported rather than copied. That module
 * holds the table of how izna, iznaya, naya and each member's name are spelled
 * in all three scripts, and a second copy of that table would be a second
 * chance for the spellings to drift apart. It is a build-time dependency only:
 * what ships is this file's output.
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const HERE = path.join(__dirname, '..');
const VIBESUB = process.env.VIBESUB_SRC
  || path.join(HERE, '..', 'vibesub-companion', 'src', 'utils', 'transliterate.ts');

const JAPANESE = /[぀-ヿ㐀-䶿一-鿿]/;
const HANGUL = /[가-힯]/;

/** A song is Japanese if its words are, and no Hangul says otherwise. */
function scriptOf(chants) {
  let ja = 0;
  let ko = 0;
  chants.forEach((b) => b.lines.forEach((l) => l.w.forEach((w) => {
    if (JAPANESE.test(w.k)) ja += 1;
    if (HANGUL.test(w.k)) ko += 1;
  })));
  return ja > ko ? 'ja' : 'ko';
}

/**
 * A name is spelled, not sounded.
 *
 * izna, iznaya, naya and each member have a settled spelling in all three
 * scripts, and DUMB HOT writes them in Latin even though the song is Japanese:
 * "Mai, Bang Jeemin, Koko" sits in a line a Korean fan is reading. Sounding
 * those out would give 마이 by luck and something else for the rest, so they are
 * looked up instead. Longest first, or izna would claim the front of iznaya.
 */
function renameIn(text, table, want) {
  const order = [...table].sort((a, b) => b.latin.length - a.latin.length);
  let out = text;
  order.forEach((n) => {
    // Every name is letters and spaces, so it goes into the pattern as it is.
    // Flanked by non-letters on both sides, or "Mai" would fire inside "Maiden".
    out = out.replace(new RegExp(`(^|[^\\p{L}])${n.latin}(?![\\p{L}])`, 'giu'),
      (m, before) => before + n[want]);
  });
  return out;
}

(async () => {
  let tl;
  try {
    tl = await import(pathToFileURL(VIBESUB).href);
  } catch (err) {
    console.error('Could not load VibeSub\'s transliterator at\n  ' + VIBESUB
      + '\nSet VIBESUB_SRC to its path. ' + err.message);
    process.exitCode = 1;
    return;
  }

  const songs = JSON.parse(fs.readFileSync(path.join(HERE, 'songs', 'index.json'), 'utf8')).songs;
  songs.forEach((song) => {
    const file = path.join(HERE, 'songs', song.name + '.json');
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const script = scriptOf(doc.chants);
    let added = 0;

    doc.chants.forEach((b) => b.lines.forEach((l) => l.w.forEach((w) => {
      delete w.ko;
      delete w.ja;
      const want = script === 'ko' ? 'kana' : 'hangul';
      let said;
      if (script === 'ko') {
        // Hangul reads straight across into katakana.
        said = tl.hangulToKana(w.k);
      } else if (JAPANESE.test(w.k)) {
        /*
         * Japanese goes by way of the romaji rather than straight from the
         * kana, which is how VibeSub writes the row too: a taught kanji
         * reading is written in romaji, so routing through it means the one
         * dictionary serves both. Each word here is a whole word already, so
         * every one of them starts one.
         */
        said = tl.romajiToHangul(w.r || w.k, true);
      } else {
        // Not Japanese, so nothing to sound out: "Dumb hot" is itself.
        said = w.k;
      }
      // Whatever is left in Latin may still be a name, in either direction.
      said = renameIn(said, tl.NAMES, want);
      const key = script === 'ko' ? 'ja' : 'ko';
      if (said && said !== w.r) { w[key] = said; added += 1; }
    })));

    fs.writeFileSync(file, JSON.stringify(doc, null, 1));
    console.log(`${song.title.padEnd(10)} ${script === 'ko' ? 'Korean' : 'Japanese'} song, `
      + `${added} word(s) given a ${script === 'ko' ? 'katakana' : 'Hangul'} reading`);
  });
})();
