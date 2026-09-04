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
then a 3-2-1 count-in.

Every clip is the same shape: **1s lead-in, the chant, 1.5s tail**, with the mic
open for all of it. The lead-in is a silent beat to draw breath, and room at the
head of the clip so the attack of a shout is never clipped. Nothing sounds
during it, because anything sounding while the mic is open ends up in the
recording. A bar closes to nothing across that second and the card pulses on the
beat itself, which says "come in now" better than a number does.

While recording, a live bar shows what the mic is hearing. A silent take and a
broken mic look identical afterwards, and someone holding a phone has no way to
tell which they got. A take that comes back empty or silent is refused rather
than kept.

Chants are listed in the order they happen in the song. The first is the CHEER
over the intro, which lives as a text box in the project rather than a lyric
line.

The mic is asked for with echo cancellation, noise suppression and auto gain all
switched **off**. That is not a detail: requesting echo cancellation puts iOS
into its phone-call voice-processing mode, which narrows the band, rides the
gain and picks the receiver-facing mic, and a shout through it comes back thin.
Nothing plays while recording, so there is no echo to cancel anyway.

Because the lead-in is fixed, the first word sits exactly 1s into every take of
every chant, so the whole pile drops onto the timeline at one offset. Do not
tighten them up afterwards: a crowd chanting in perfect lockstep sounds wrong,
and the natural spread between takes is the sound you want.

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
