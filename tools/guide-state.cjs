/**
 * What guide each block is actually playing, and when that file was last written.
 *
 * A guide is replaced under the name it already had, so nothing about a block
 * says whether the file behind it is the one that was meant. This asks storage
 * directly: every block with a guide, the file it points at, that file's size
 * and the moment it was last written. A block whose file is older than the
 * timing set against it is the one to look at.
 */
const fs = require('fs');
const path = require('path');

global.window = {};
require(path.join(__dirname, '..', 'config.js'));
const { url } = window.BOOTH_CONFIG;

const songs = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'songs', 'index.json'), 'utf8'),
).songs;

const only = process.argv[2];

(async () => {
  for (const song of songs) {
    if (only && song.name !== only) continue;
    const res = await fetch(`${url}/storage/v1/object/public/guides/${song.name}/manifest.json?t=${Date.now()}`);
    if (!res.ok) { console.log(`${song.title}: no guides yet`); continue; }
    const map = await res.json();
    const blocks = Object.keys(map).filter((k) => !k.startsWith('_'));
    const n = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'songs', `${song.name}.json`), 'utf8')).chants.length;
    console.log(`\n=== ${song.title}  ${blocks.length} of ${n} blocks placed`);

    // One request per distinct file: several blocks can share a whole song.
    const seen = new Map();
    for (const id of blocks) {
      const file = map[id].file;
      if (!seen.has(file)) {
        const head = await fetch(`${url}/storage/v1/object/public/guides/${song.name}/${file}`, { method: 'HEAD' });
        seen.set(file, head.ok
          ? { when: head.headers.get('last-modified'), size: +head.headers.get('content-length') }
          : { when: null, size: 0 });
      }
      const said = seen.get(file);
      const num = +id.slice(1);
      console.log(
        `  block ${String(num).padStart(2)}  plays ${file.padEnd(7)}`
        + (said.when
          ? `${String(Math.round(said.size / 1024)).padStart(5)} KB  written ${said.when}`
          : '  MISSING from storage'),
      );
    }
    const missing = [];
    for (let i = 1; i <= n; i += 1) if (!map['b' + i]) missing.push(i);
    if (missing.length) console.log('  no guide yet: block ' + missing.join(', '));
  }
})();
