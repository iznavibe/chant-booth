/**
 * Rebuild every song from the VibeSub projects.
 *
 * The projects live in the app's own folder, one file per song under a name
 * nobody can read, so the pairing is made by title. Changing a rule in
 * build-song.cjs and running this is how a fix reaches all ten songs at once,
 * and diffing the songs afterwards is how the reach of that fix is checked.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = path.join(process.env.APPDATA, 'com.vibesub.app', 'vibesub-companion', 'projects');
const HERE = path.join(__dirname, '..');

const want = new Map(
  JSON.parse(fs.readFileSync(path.join(HERE, 'songs', 'index.json'), 'utf8'))
    .songs.map((s) => [s.title.toLowerCase(), s]),
);

// A project is named for the video it makes, not the song, so the song is
// whatever the name says before it starts describing itself.
const found = new Map();
fs.readdirSync(DIR).filter((f) => f.endsWith('.vibelyric')).forEach((f) => {
  const p = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const key = String(p.name || '').replace(/\s+Fanchant\b.*$/i, '').trim().toLowerCase();
  if (want.has(key)) found.set(key, path.join(DIR, f));
});

let missing = 0;
want.forEach((song, key) => {
  const file = found.get(key);
  if (!file) { console.log('no project for ' + song.title); missing += 1; return; }
  execFileSync(process.execPath,
    [path.join(__dirname, 'build-song.cjs'), file, song.name, song.title],
    { cwd: HERE, stdio: 'inherit' });
});

if (missing) { process.exitCode = 1; return; }

execFileSync(process.execPath, [path.join(__dirname, 'build-index.cjs')], { cwd: HERE, stdio: 'inherit' });
// The readings need every song built first, and the index to know their names.
execFileSync(process.execPath, [path.join(__dirname, 'add-readings.cjs')], { cwd: HERE, stdio: 'inherit' });
