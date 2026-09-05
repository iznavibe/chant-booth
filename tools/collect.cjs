/**
 * Pull the takes out of Supabase, and optionally clear them out.
 *
 *   SUPABASE_SERVICE_KEY=... node tools/collect.cjs beep
 *   SUPABASE_SERVICE_KEY=... node tools/collect.cjs beep --wav
 *   SUPABASE_SERVICE_KEY=... node tools/collect.cjs beep --wav --delete
 *
 * Nothing may read the takes bucket, which is what keeps fans' recordings
 * private, and that applies to you as well through the page's key. This uses
 * the service_role key instead, which bypasses the policies. That key must
 * never go in config.js, in this repo, or anywhere a browser could see it: pass
 * it on the command line for the length of one run and no longer.
 *
 * With --delete, a file is removed only after it has been written to disk and
 * its size checked, so a failed download never costs a take. Draining the
 * bucket this way turns the free tier's 1 GB into a rolling limit rather than a
 * ceiling.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const URL_BASE = 'https://mhquiiaivhwhwsjywzmo.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
const song = process.argv[2] || 'beep';
const bucket = process.env.BUCKET || 'takes';
const wipe = process.argv.includes('--delete');
/*
 * What the browser records is not what an editor wants to open.
 *
 * Chrome writes webm/opus and Safari mp4/aac, both of which are better than mp3
 * at the same size and neither of which every editor will import. Converting on
 * the way out gives one predictable format, and forcing mono while we are here
 * repairs anything recorded before the channels were merged, which played in
 * one ear only.
 */
const wav = process.argv.includes('--wav');
const mp3 = process.argv.includes('--mp3');
const out = path.join('collected', song);

if (!KEY) {
  console.error('Set SUPABASE_SERVICE_KEY. Supabase dashboard: Project Settings, API keys.');
  process.exit(1);
}

const head = { apikey: KEY, Authorization: 'Bearer ' + KEY };

/** Everything under a prefix, walking into folders as it finds them. */
async function list(prefix) {
  const found = [];
  let offset = 0;
  for (;;) {
    const res = await fetch(`${URL_BASE}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { ...head, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 100, offset }),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
    const page = await res.json();
    if (!page.length) break;

    for (const item of page) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      // A folder comes back with no id of its own.
      if (item.id === null) found.push(...(await list(full)));
      else found.push({ path: full, size: item.metadata && item.metadata.size });
    }
    if (page.length < 100) break;
    offset += page.length;
  }
  return found;
}

async function download(objectPath, to) {
  const res = await fetch(`${URL_BASE}/storage/v1/object/${bucket}/${encodeURI(objectPath)}`, { headers: head });
  if (!res.ok) throw new Error(`${res.status} on ${objectPath}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, bytes);
  return bytes.length;
}

/** One predictable mono file per take, next to the original. */
function convert(from) {
  const to = from.replace(/\.[^.]+$/, wav ? '.wav' : '.mp3');
  // Take the first channel rather than averaging the two. Where both carry the
  // same signal that is identical, and where only one does, averaging would
  // halve a shout that is already quiet.
  const args = ['-y', '-loglevel', 'error', '-i', from, '-af', 'pan=mono|c0=c0'];
  if (wav) args.push('-c:a', 'pcm_s16le', '-ar', '48000');
  else args.push('-c:a', 'libmp3lame', '-b:a', '192k');
  args.push(to);
  try {
    execFileSync('ffmpeg', args, { stdio: 'pipe' });
    fs.unlinkSync(from);
  } catch (e) {
    console.log(`
  could not convert ${path.basename(from)}: is ffmpeg on PATH?`);
  }
}

async function remove(paths) {
  const res = await fetch(`${URL_BASE}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: { ...head, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
}

(async () => {
  const files = await list(song);
  if (!files.length) {
    console.log(`Nothing under ${bucket}/${song}/.`);
    return;
  }

  const done = [];
  let bytes = 0;
  for (const f of files) {
    const to = path.join(out, f.path.slice(song.length + 1));
    try {
      const n = await download(f.path, to);
      // Only count it collected once it is on disk at the size the bucket said.
      if (f.size && n !== f.size) throw new Error(`${n} bytes, expected ${f.size}`);
      bytes += n;
      if ((wav || mp3) && /\.(webm|mp4|m4a|aac|ogg)$/i.test(to)) convert(to);
      done.push(f.path);
      process.stdout.write('.');
    } catch (e) {
      console.log(`\n  failed: ${f.path}  ${e.message}`);
    }
  }

  console.log(`\n${done.length} of ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB, into ${out}/`);

  // Who sang what, for the credits.
  const who = {};
  for (const f of done.filter((p) => p.includes('_singers/'))) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(out, f.slice(song.length + 1)), 'utf8'));
      if (j.handle) who[f.split('/').pop().split('-')[0]] = j.handle;
    } catch (e) { /* a singer with no name is still a singer */ }
  }
  const names = [...new Set(Object.values(who))].sort();
  if (names.length) {
    fs.writeFileSync(path.join(out, 'credits.txt'), names.join('\n') + '\n');
    console.log(`${names.length} named singers, written to ${out}/credits.txt`);
  }

  /*
   * How far to pull each take forward.
   *
   * What went up is the recording untouched, and a microphone hands a sound
   * over some way after it happened: on a phone a fifth of a second, more
   * through earphones. The booth measures that from a click it can hear in the
   * recording and sends the figure alongside. Shifting a take earlier by its
   * own number puts the voice where the naya actually sang it.
   *
   * A take with no figure is left alone rather than guessed at.
   */
  const late = [];
  for (const f of done.filter((p) => p.includes('_singers/'))) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(out, f.slice(song.length + 1)), 'utf8'));
      const session = f.split('/').pop().split('-')[0];
      const lags = j.lags || {};
      const blocks = Object.keys(lags);
      if (blocks.length) {
        blocks.forEach((b) => late.push([b, session, Math.round(lags[b] * 1000)]));
      } else if (j.micLag) {
        // Sent before takes carried their own: one figure for the session.
        late.push(['every block', session, Math.round(j.micLag * 1000)]);
      }
    } catch (e) { /* a session that says nothing asks for nothing */ }
  }
  if (late.length) {
    late.sort((a, b) => (a[1] + a[0]).localeCompare(b[1] + b[0]));
    const doc = ['block\tsession\tpull earlier by']
      .concat(late.map((r) => `${r[0]}\t${r[1]}\t${r[2]}ms`))
      .join('\n');
    fs.writeFileSync(path.join(out, 'delays.txt'), doc + '\n');
    console.log(`${late.length} take(s) carry a delay, written to ${out}/delays.txt`);
  }

  if (wav || mp3) console.log(`converted to ${wav ? 'wav' : 'mp3'}, mono`);

  if (!wipe) {
    console.log('\nNothing deleted. Add --delete to clear them from the bucket.');
    return;
  }
  for (let i = 0; i < done.length; i += 50) await remove(done.slice(i, i + 50));
  console.log(`Deleted ${done.length} files from ${bucket}/.`);
})().catch((e) => {
  console.error('\n' + e.message);
  process.exit(1);
});
