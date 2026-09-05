# VibeChant

A page where fans sing an izna fanchant a block at a time, so the takes come back
already the right length and already lined up.

Live at `https://iznavibe.github.io/chant-booth/`

Ten songs. The bare link offers the list; `?song=<name>` goes straight to one:
`beep` `dumbhot` `headache` `izna` `mammamia` `metronome` `racecar` `rip` `sign`
`timebomb`. Add `#guide` to record or upload that song's guides.

Takes, guides and the on-device store are all keyed by song, so the ten never
mix.

The unit is a **block**: one screenful of the finished video, and the same span a
guide clip would naturally be cut to. Every block containing a fanchant is
recorded and none are reused between similar chants.

A block is trimmed to the run from its first chanting line to its last. Leading
and trailing sung lines are izna's alone and only crowd a phone screen, but a
sung line *between* two chants is kept: it is what a fan counts through while
waiting for their next entry, and without it the gap in the sweep looks like a
mistake. Timings stay absolute either way, so the wait is real.

Both rows fill in karaoke, the original and its romaji together, with a hard
edge running through the letters over exactly the time each word is held. izna's
words fill purple, the fan's fill izna pink and stand out bold, so what is theirs
to shout is obvious without reading a legend. Words struck through in the video
are struck here too: izna singing underneath the chant.

**What counts as a fanchant** is the fanchant colour, the one the fanchant button
paints on, not brackets. BEEP has 58 coloured words against 31 bracketed, and
whole chants like the 치우고 / 지우고 answers carry no brackets at all. Brackets
are still honoured on top, so a chant typed straight into a lyric line is not
missed.

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

While recording, a live bar shows what the mic is hearing. It taps the end of the
gain chain and then runs into a gain of zero connected to the speakers: that sink
is load-bearing, because a branch reaching no destination is not guaranteed to be
processed, and an analyser hanging off the side will read zeroes forever while
the recording it is watching comes out fine. A silent take and a
broken mic look identical afterwards, and someone holding a phone has no way to
tell which they got. Only a provably silent take is refused. `decodeAudioData` cannot read every
container (iOS writes an mp4 Safari will not always decode), and a quiet meter is
not evidence of a quiet recording, so anything unproven is kept with a note to go
and listen. Discarding a good take because a measurement failed is much worse
than keeping a poor one.

Chants are listed in the order they happen in the song. The first is the CHEER
over the intro, which lives as a text box in the project rather than a lyric
line.

The mic is released the instant a take finishes, and this is not tidiness. While
a page holds an open microphone, iOS keeps its audio session in record mode,
which routes sound to the earpiece instead of the speaker and caps the volume, so
everything played afterwards is faint however far up the side button is pressed.
Handing the tracks back puts playback right. Takes are then played through Web
Audio with a gain stage and a limiter, because someone shouting into a phone at
arm's length still comes back quieter than music.

The mic is asked for with echo cancellation, noise suppression and auto gain all
switched **off**. That is not a detail: requesting echo cancellation puts iOS
into its phone-call voice-processing mode, which narrows the band, rides the
gain and picks the receiver-facing mic, and a shout through it comes back thin.
Nothing plays while recording, so there is no echo to cancel anyway.

With those off the raw input is quiet, so the gain is applied here instead:
`mic -> gain x5 -> compressor -> MediaRecorder`. Lift first, then sit on the
peaks so a real shout does not clip. Doing it this way is deterministic and
never touches the audio session, unlike letting the browser's automatic gain do
it. If a take ever comes back silent while the level meter saw sound, the page
decides this browser will not record a processed stream and falls back to the
bare microphone for the rest of the session.

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
create policy "vibechant write" on storage.objects
  for insert to public
  with check (bucket_id in ('takes', 'guides'));

create policy "vibechant replace" on storage.objects
  for update to public
  using      (bucket_id in ('takes', 'guides'))
  with check (bucket_id in ('takes', 'guides'));

-- Guides only. Takes must stay unreadable.
create policy "vibechant read guides" on storage.objects
  for select to public
  using (bucket_id = 'guides');
```

`to public` means any role, which covers the newer `sb_publishable_` keys where
`to anon` does not bind. Policies name their bucket as a plain string, so it does
not matter whether they or the buckets come first.

4. **Project Settings, API**: copy the project URL and the publishable key into
   `config.js`, then push. Never the `service_role` key: that one bypasses every
   policy.

Once the guides are in, narrow the write policies to `takes` alone. Guide mode is
only a URL fragment, so anyone reading the page source could otherwise replace a
guide:

```sql
alter policy "vibechant write"   on storage.objects with check (bucket_id = 'takes');
alter policy "vibechant replace" on storage.objects using (bucket_id = 'takes')
                                                   with check (bucket_id = 'takes');
```

## What lands in the bucket

```
takes/beep/b7/n8fk2p1a-1.webm           one block, one fan, first attempt
takes/beep/_singers/n8fk2p1a-<ms>.json  {handle, at, kept}
guides/beep/b7.webm                     your guide for that block
```

`b1`..`b21` are the block ids in `songs/beep.json`, in song order. Where a fan
has more than one attempt at a block, the highest number is the one they meant.

**Nothing may read the `takes` bucket**, which is also why nothing may overwrite
in it: replacing a file means first finding it. So every upload writes to a path
no file has occupied before and the page remembers what already went. Pressing
upload twice is harmless, and a redo after an upload lands as a second file
rather than a refusal.

Do not add a read policy on `takes` to make overwriting work. The publishable key
is in the page source, so a read policy would let anyone list and download every
fan's recording.

The consent line promises recordings are deleted once the project is finished, so
clear the `takes` bucket when the video is out.

## Surviving a refresh

Takes are written to IndexedDB as they are recorded, keyed by song and block,
along with the handle and whether each one has been sent. A reload, a mistyped
tap, or coming back tomorrow finds them still there, and the intro says how many
and offers to carry on at the first block still waiting.

localStorage cannot hold a blob, so IndexedDB is the only option that keeps the
audio itself. Every call fails silently: a phone in private browsing throws on
the first one, and the booth has to keep working from memory alone rather than
refuse to start.

## Getting the takes back out

Nothing may read the `takes` bucket, which is what keeps fans' recordings
private, and that applies to you too through the page's key. The dashboard can
read it, because it authenticates as the project owner and bypasses the
policies, but clicking through hundreds of files is not a plan. So:

```
SUPABASE_SERVICE_KEY=... node tools/collect.cjs beep
SUPABASE_SERVICE_KEY=... node tools/collect.cjs beep --delete
```

It walks the bucket, writes everything to `collected/beep/<block>/`, checks each
file landed at the size the bucket claimed, and gathers the handles into
`credits.txt`. With `--delete` it clears a file only after that check passed, so
a failed download never costs a take.

Add `--wav` (or `--mp3`) to convert as it goes. Browsers record webm/opus on
Chrome and mp4/aac on Safari, both better than mp3 at the same size but neither
guaranteed to import into an editor, so this gives one predictable format. It
takes channel 0 rather than averaging the pair, which is identical where both
carry the same signal and avoids halving a shout where only one does. That also
repairs anything recorded before the channel merge went in, which played in one
ear only.

The service_role key is on the same dashboard page as the publishable one and
bypasses every policy. Pass it on the command line for the length of one run.
It must never reach `config.js`, this repo, or anywhere a browser could see it.

## What it costs

One fan singing all 21 BEEP blocks is **2.9 minutes of audio, about 2.7 MB** at
128 kbps mono. Supabase's free tier gives 1 GB, so roughly **380 fans**; the
$25/month tier gives 100 GB, so about 38,000. Egress is the other limit, 2 GB a
month free, but only you ever download these, so a full 1 GB pull is well inside
it. Dropping to 96 kbps would reach ~500 fans and 64 kbps ~760, at some cost to
a shout's clarity. 128 is worth keeping unless the free tier actually fills.

Draining the bucket with `collect.cjs --delete` makes that 1 GB a rolling limit
rather than a ceiling, so the number of fans stops being capped by storage at
all. Every ~380 fans, pull and clear.

## Sending takes in

A fan's takes stay on their phone until they press **Upload my takes** on the
last screen, which sends them one at a time and reports how many went. Guides
are the exception and go up the moment they are recorded, since there is one of
each and the person making them wants them there.

The finished screen is a grid of every block. Tapping one opens a panel to hear
that take back or record it again, and nothing is ever closed off: a recorded
block is still reachable by arrow, by tapping its dot, or from that grid.

## The guides

```
?song=beep#guide
```

**`#guide` is not a lock.** It is a fragment in the URL of a public repository,
so anyone can read the page source and find it. The lock is the bucket policy:
anon may write takes and read guides, and nothing else. Run this once, after the
first set of guides is in:

```sql
alter policy "vibechant write"   on storage.objects with check (bucket_id = 'takes');
alter policy "vibechant replace" on storage.objects using (bucket_id = 'takes')
                                                   with check (bucket_id = 'takes');
```

After that, writing a guide needs a key that outranks anon. Guide mode has a
field for the **service_role** key: it is held in a variable for as long as the
tab is open and stored nowhere, not localStorage, not this repository. Paste it
when adding guides, close the tab when done. Do not do this on a shared machine,
and never put that key in `config.js`.

**Easiest: cut them from one file.** Drop the whole song in, video or audio, and
every block is sliced from it at the timings the video already uses. No trimming,
no naming, no exporting 21 clips. "Hear this block" checks the alignment and the
nudge box shifts every slice at once if the file starts late or early, which it
will if it has a channel bumper on the front.

Each slice runs from one second before the block's first word to 1.5 seconds
after its last, the same shape a take has, so guide and sweep line up. They come
out as 32kHz mono WAV, around 10MB for a song.

**Or trim them yourself and line them up here.** Cutting roughly around a block
in an editor takes seconds and you can see the waveform; landing the first word
on the beat is the fiddly part, and doing that by exporting, uploading and
listening is a slow loop. So "Upload a clip for this block" decodes what you
give it and holds it: `-0.1` and `+0.1` slide it, "Hear it" plays it under the
sweep, and Save writes a window of exactly the right length. Rough trimming plus
a couple of taps beats trying to cut frame-accurately in the editor.

An mp3 out of CapCut is ideal. It need not be exact, or even long enough: a clip
shorter than the block is padded with silence rather than truncated, because a
guide that is short would shift every word in it forward.

Record guide still records one by voice. All three routes write to the same
place, so they mix freely.

Guides are stored with no file extension. What arrives may be webm, mp4 or wav
depending on where it came from, the page reads the bytes rather than the name,
and calling them all `.webm` would only be a claim that happens to be false.

## Adding another song

```
node tools/build-song.cjs <project.vibelyric> <name> "<Title>"
node tools/build-index.cjs
```

Reads a VibeSub project, keeps the blocks containing fanchants, and writes
`songs/<name>.json`. The second command rebuilds the list the front page reads. Timings are copied out untouched: `at` is the block's
absolute second in the song, and every word's `t` is relative to the block, so a
finished take drops back exactly where it came from. Link it as `?song=<name>`.

## Local testing

`getUserMedia` needs a secure context, so `file://` will not do:

```
python -m http.server 8000
```

then open `http://localhost:8000/` (localhost counts as secure).
