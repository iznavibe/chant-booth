/**
 * Prove the extracted song still sits where the video put it.
 *
 * The audio is taken from the same file the timings were made against and
 * nothing is trimmed, so it should line up to the sample. The one thing that
 * could move it is the encode: an mp3 encoder writes a few hundred samples of
 * its own at the front, and a decoder that ignores the header that says so
 * plays everything a few milliseconds late.
 *
 * So the extracted file is compared against the video it came from, rather
 * than against a clip cut by hand. Same passage, same performance, no question
 * of which chorus is which: what is left over is the encode's own offset, and
 * a search of a fifth of a second either way is more than enough room.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FF = process.env.FFMPEG || 'C:/Users/FD/cmd/yt-dlp/ffmpeg';
const RATE = 44100;
const LOOK = 0.2;    // how far either way an offset is looked for
const TAKE = 6;      // seconds of the song to line up

/** One channel of floats, from a given second, for a given number of them. */
function pcm(file, from, secs) {
  const raw = execFileSync(FF, [
    '-hide_banner', '-loglevel', 'error',
    '-ss', String(from), '-i', file, '-t', String(secs),
    '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-',
  ], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}

/** How far b has to move to sit on a, in samples, searched either way. */
function offsetOf(a, b, room) {
  const n = Math.min(a.length, b.length) - 2 * room;
  let best = -2;
  let at = 0;
  let ma = 0;
  for (let i = 0; i < n; i += 1) ma += a[room + i] * a[room + i];
  ma = Math.sqrt(ma) || 1;
  for (let shift = -room; shift <= room; shift += 1) {
    let dot = 0;
    let mb = 0;
    for (let i = 0; i < n; i += 1) {
      const v = b[room + i + shift];
      dot += a[room + i] * v;
      mb += v * v;
    }
    const r = dot / (ma * (Math.sqrt(mb) || 1));
    if (r > best) { best = r; at = shift; }
  }
  return { samples: at, score: best };
}

const songs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'songs', 'index.json'), 'utf8')).songs;
const sources = new Map(
  fs.readFileSync(path.join(__dirname, '..', 'audio', 'sources.tsv'), 'utf8')
    .split('\n').filter(Boolean).map((l) => l.split('\t')),
);
const only = process.argv[2];
const room = Math.round(RATE * LOOK);
let worst = 0;

songs.forEach((song) => {
  if (only && song.name !== only) return;
  const made = path.join(__dirname, '..', 'audio', `${song.name}.mp3`);
  const from = sources.get(song.name);
  if (!fs.existsSync(made)) { console.log(`${song.title}: not extracted`); return; }
  if (!from || !fs.existsSync(from)) { console.log(`${song.title}: source video gone`); return; }

  // Taken from the middle, where a song is playing rather than fading in.
  const at = 60;
  const a = pcm(from, at - LOOK, TAKE + 2 * LOOK);
  const b = pcm(made, at - LOOK, TAKE + 2 * LOOK);
  const { samples, score } = offsetOf(a, b, room);
  const ms = (samples / RATE) * 1000;
  worst = Math.max(worst, Math.abs(ms));
  console.log(
    `${song.title.padEnd(10)} ${ms >= 0 ? '+' : ''}${ms.toFixed(1).padStart(6)} ms   `
    + `(match ${(score * 100).toFixed(1)}%)`,
  );
});

console.log(`\nworst is ${worst.toFixed(1)} ms`
  + (worst < 10 ? ' — nothing a listener could hear' : ' — worth correcting'));
