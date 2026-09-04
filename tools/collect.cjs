/**
 * Pull the takes out of Supabase, and optionally clear them out.
 *
 *   SUPABASE_SERVICE_KEY=... node tools/collect.cjs beep
 *   SUPABASE_SERVICE_KEY=... node tools/collect.cjs beep --delete
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

const URL_BASE = 'https://mhquiiaivhwhwsjywzmo.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
const song = process.argv[2] || 'beep';
const bucket = process.env.BUCKET || 'takes';
const wipe = process.argv.includes('--delete');
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
