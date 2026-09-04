# Chant Booth

A page where fans record an izna fanchant one shout at a time, so the takes come
back already the right length and already lined up.

Live at `https://iznavibe.github.io/chant-booth/`

- Fans: `.../?song=beep`
- You, recording the guides: `.../?song=beep#guide`

## How it works

The song never plays while the mic is open. That keeps the backing track out of
every recording, sidesteps iOS ducking playback the moment a recording starts,
and means headphones are optional, which is the difference between people taking
part and not.

What a fan hears instead is your guide voice with the words sweeping in time,
then a 3-2-1 count-in. Recording runs for the chant's own length plus 0.7s and
starts at a fixed offset from the count, so every take of a given chant is the
same length and lands in the same place on the timeline. Do not tighten them up
afterwards: a crowd chanting in perfect lockstep sounds wrong, and the natural
spread between takes is the sound you want.

Chant timings come from the finished lyric video, exported out of VibeSub.

## Setting up storage (once)

Both config values are public by design. The anon key is meant to sit in page
code; what stops a passer-by writing wherever they like is the bucket policy,
not secrecy.

1. Make a free project at supabase.com.
2. **Storage**, then create two buckets:
   - `takes`, **not** public
   - `guides`, **public**
3. **SQL Editor**, run this:

```sql
-- Anyone may add a take, nobody may read them back.
create policy "anon can add takes"
  on storage.objects for insert to anon
  with check (bucket_id = 'takes');

create policy "anon can replace own take"
  on storage.objects for update to anon
  using (bucket_id = 'takes');

-- Guides are readable by everyone and writable while you are recording them.
create policy "anon can add guides"
  on storage.objects for insert to anon
  with check (bucket_id = 'guides');

create policy "anon can replace guides"
  on storage.objects for update to anon
  using (bucket_id = 'guides');
```

4. **Project Settings, API**: copy the project URL and the anon key into
   `config.js`, then push.

Once the guides are recorded, drop the two `guides` write policies. Guide mode
is only a URL fragment, so anyone who reads the page source could otherwise
overwrite a guide:

```sql
drop policy "anon can add guides" on storage.objects;
drop policy "anon can replace guides" on storage.objects;
```

## What lands in the bucket

```
takes/beep/c1/n8fk2p1a.webm        one chant, one fan
takes/beep/_singers/n8fk2p1a.json  {handle, at, kept}
guides/beep/c1.webm                your guide for that chant
```

`c1`..`c15` are the chant ids in `songs/beep.json`, ordered shortest first.

## Adding another song

Drop a `songs/<name>.json` next to `beep.json` and link `?song=<name>`. The
shape is one object with `title`, `artist` and `chants`; each chant carries an
`id`, the Korean `kr`, the `ro` romanisation, `dur` in seconds, how many times
it `count`s in the song, and `w`, the per-word timings that drive the sweep.
These are generated from the VibeSub project file, not written by hand.

## Local testing

`getUserMedia` needs a secure context, so `file://` will not do:

```
python -m http.server 8000
```

then open `http://localhost:8000/` (localhost counts as secure).
