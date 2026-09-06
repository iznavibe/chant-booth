/**
 * Put a song's own audio where the booth can reach it.
 *
 * Taken from the video the timings were made against, so it needs no lining
 * up: `tools/check-audio.cjs` measures what the encode moved it by, which is a
 * tenth of a millisecond. It goes in beside the guide clips under the name the
 * booth already uses for a whole song.
 */
const fs = require('fs');
const path = require('path');

global.window = {};
require(path.join(__dirname, '..', 'config.js'));
const { url, key } = window.BOOTH_CONFIG;
const master = process.env.GUIDE_KEY || key;

const songs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'songs', 'index.json'), 'utf8')).songs;
const only = process.argv.slice(2);

(async () => {
  for (const song of songs) {
    if (only.length && !only.includes(song.name)) continue;
    const file = path.join(__dirname, '..', 'audio', `${song.name}.mp3`);
    if (!fs.existsSync(file)) { console.log(`${song.title}: nothing extracted`); continue; }
    const body = fs.readFileSync(file);
    const res = await fetch(`${url}/storage/v1/object/guides/${song.name}/_song`, {
      method: 'POST',
      headers: {
        apikey: master,
        Authorization: `Bearer ${master}`,
        'Content-Type': 'audio/mpeg',
        'x-upsert': 'true',
        'cache-control': '3600',
      },
      body,
    });
    console.log(`${song.title.padEnd(10)} ${Math.round(body.length / 1024)} KB  `
      + (res.ok ? 'sent' : 'FAILED ' + res.status + ' ' + (await res.text()).slice(0, 120)));
  }
})();
