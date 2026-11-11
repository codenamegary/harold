# Demo render

A 115.2 second cut, 1920x1080 at 30 fps (3456 frames). The phone screen is real
emulator capture; the capture is raw material and the edit lives in
`timeline.ts`. [`../script.md`](../script.md) is the script, and it is the only
one.

> **Status: the cut described below is superseded.** It was built before the
> current `script.md` and does not follow it. It opens cold on the host form with
> no intro slide, where the script now opens on the logo and the subtitle. The
> beat table further down describes that older cut. Rewrite it against the
> script rather than copying it forward.

`capture.json` and `public/slices/` hold 15 slices from the MCP-driven capture
pipeline: 135.4 s of CFR 60, 1080x2400, with the exact time of every tap, every
keystroke, and every named mark. That footage is good, and a rebuild reuses it
rather than re-recording.

| Slice           | Used for                                                      |
| --------------- | ------------------------------------------------------------- |
| `connect_empty` | the phone rising onto the empty SSH host form                  |
| `connect_key`   | the generated `ssh-ed25519` key, cropped                       |
| `connect_fill`  | typing the host field; then the filled form, read out          |
| `connect_test`  | the test tap; then the SHA256 fingerprint, cropped              |
| `connect_trust` | the trust tick                                                 |
| `connect_save`  | the save tap                                                   |
| `landing`       | the chat landing, then the achievement hinge on the same clip  |
| `new_session`   | the session menu, the workspace pick, `Start Session`          |
| `plan`          | the 338-character plan prompt, three real windows              |
| `question`      | the agent's question card, cropped; then the sheet             |
| `build`         | the 251-character build prompt, then the settled reply         |
| `usage`         | the context and cost line, cropped                             |
| `changes`       | the empty scope, the branch list, then the `settings.js` diff  |
| `worktrees`     | the worktree sheet                                             |
| `pr`            | the PR prompt, the URL, and the close spotlight                |

## The beats

`BEATS` in `timeline.ts` is the shape of the film. The boundaries are authored
in frames and the seconds are derived, so a retime cannot drift the total off
3456 behind a float.

| Beat          | Window        | Frames      |
| ------------- | ------------- | ----------- |
| `coldOpen`    | 0.0 – 2.4     | 0 – 72      |
| `key`         | 2.4 – 5.4     | 72 – 162    |
| `fill`        | 5.4 – 9.8     | 162 – 294   |
| `test`        | 9.8 – 13.0    | 294 – 390   |
| `trust`       | 13.0 – 15.8   | 390 – 474   |
| `save`        | 15.8 – 17.4   | 474 – 522   |
| `landing`     | 17.4 – 19.0   | 522 – 570   |
| `achievement` | 19.0 – 22.0   | 570 – 660   |
| `newSession`  | 22.0 – 31.0   | 660 – 930   |
| `plan`        | 31.0 – 47.4   | 930 – 1422  |
| `question`    | 47.4 – 53.0   | 1422 – 1590 |
| `build`       | 53.0 – 71.8   | 1590 – 2154 |
| `usage`       | 71.8 – 76.0   | 2154 – 2280 |
| `changes`     | 76.0 – 91.6   | 2280 – 2748 |
| `worktrees`   | 91.6 – 96.8   | 2748 – 2904 |
| `pr`          | 96.8 – 110.0  | 2904 – 3300 |
| `outro`       | 110.0 – 115.2 | 3300 – 3456 |

`STEPS` holds the shots. Each one names a slice, a render start, an in-point, a
rate, and how long it plays. Most beats are several shots on the same slice: a
short window of real typing, then a cut ahead to the frame that matters.

## The question retime

`question` used to stretch 6.05 s of capture across 14.4 s: the middle ran at
0.40x and the tail at 0.28x. It now plays at **1.0x** on a **1.15-5.45 s
window**, in 168 frames (5.6 s), with two deliberate freezes (0.9 s on the open
sheet, 0.4 s before the build). The 264 reclaimed frames went to `build`
(+168, now 18.8 s) and `changes` (+96, now 15.6 s). The total is still 3456
frames.

## The hinge

`achievement` is the hinge: the promise lands early and the rest of the film
proves it. It reuses the `landing` recording, split at **source 2.40 s** — the
landing plays 1.60 → 2.40, the hinge picks the tail up at 2.40 and holds to 3.90.

At 19.0 s the phone pushes in to `screenWidth 700`, `centerX 1460`,
`top -314.5`, leaving the left third of the stage empty. The spotlight card
slides in from the left at 19.4 s (frame 582) with the script's own copy:

```
kicker: Achievement unlocked
title: Work from Couch
```

The kicker renders in sentence case. `spotlight.tsx` never uppercases it. The
pop fires at 19.6 s (frame 588) and the confetti with it. This is the only pop
and the only confetti in the film, and it is silent: the spotlight's own ping is
the only sound. The close ends on `The whole loop / From plan to PR` with a
spotlight and no pop.

`celebration.test.ts` pins the contract: one celebration, at frame 588, with
`confetti: true`, 96 particles, inside the achievement beat, and none in `pr`.

## Two shots: device and screen

`STAGE_MOVES` parks the whole handset. Two equal moves 0.05 s apart are a cut; a
lone pair is a move. `FRAMING_MOVES` decides whether the frame is the device at
all:

- **device** — the whole phone, bezel and all, docked to one side with the copy
  column opposite. The app renders at 470/1080 of its captured size, so a 28 px
  label in the app lands at **~12 px** on stage. Fine for shape, hopeless for
  reading.
- **screen** — no bezel, no body, no dock. The video is the frame, cropped to a
  window and scaled until that window is the full stage width, with the copy
  demoted to a lower third over a scrim.

The magnification is the window width, not a lens: a window `w` of the screen
width is drawn `1920 / (w * 1080)` times life size. The six moments that carry
the argument are cropped, each with a measured window:

| Beat      | Moment            | Window                          | Scale | 28 px label |
| --------- | ----------------- | ------------------------------- | ----- | ----------- |
| `key`     | the public key    | `{x 0.5, y 0.55, width 0.92}`   | 1.93x | ~54 px      |
| `test`    | the fingerprint   | `{x 0.5, y 0.79, width 0.75}`   | 2.37x | ~66 px      |
| `question`| the question card | `{x 0.5, y 0.784, width 0.95}`  | 1.87x | ~52 px      |
| `usage`   | the cost line     | `{x 0.5, y 0.148, width 1}`     | 1.78x | ~50 px      |
| `changes` | the `settings.js` diff | `{x 0.5, y 0.28, width 1}` | 1.78x | ~50 px      |
| `pr`      | the draft PR URL  | `{x 0.5, y 0.762, width 1}`     | 1.78x | ~50 px      |

The full-width windows are deliberate: clipping the left edge of a line of code
or a URL is worse than the magnification a narrower window buys. Crop geometry
comes from `capture.json`'s `width`/`height`, and the window is clamped inside
the screen, so a crop that asks for the bottom edge slides up instead of showing
the stage behind the app.

The lower third sits on solid ink, not on a long fade: `hero.tsx` holds the
gradient opaque to 76% of the bar's height and fades above it, so a caption over
live pixels is the only thing you can read there. The bar is content tall, so a
hero can also name `scrimFrom`, the stage line where solid ink starts. `usage`
sets it to `0.505` and the diff in `changes` to `0.713`, which covers the half
line of transcript each crop used to leave above the copy. The fade above that
edge is only 24 px, so the ink reads as a band rather than a long wash.

## Typing cadence

The capture types at ~12 characters a second, which reads robotic, and the plan
prompt is 338 characters: played at a human cadence it would cost 45 s of screen
time. Each long prompt is therefore a short real window at 0.55 rate, then a cut
ahead:

| Prompt    | Source windows (s)                    | On-screen cadence | Beat  |
| --------- | ------------------------------------- | ----------------- | ----- |
| `plan`    | 0.90–4.75, 26.0–28.2, 28.2–30.7       | 6.6 cps           | 16.4 s |
| `build`   | 0.85–4.92, 19.6–21.47, 21.5–22.94, 22.58–24.5 | 6.6 cps    | 18.8 s |
| `pr`      | 0.88–3.08, 6.3–7.73, 7.8–8.79          | 6.5 cps           | 13.2 s |
| `fill`    | 0.78–1.83, 8.62–9.85                   | 6.7 cps           | 4.4 s  |

No window is a hand-declared typing animation: every character drawn is a
character the capture drew. `question` is not in the table because it is not a
typing beat: it plays at 1.0x.

## Sound and taps are not invented

`buildSounds` reads `taps[].atSec` and `keys[].atSec` out of the capture and maps
them into render time with the inverse of `clipFrame`:

```
render = shot.at + (sourceSec - shot.startSec) / shot.rate
```

`clipFrame` is the only place a source second becomes a frame:
`startSec + (sec - from) * rate`. Because both directions use the same rate, a
keystroke sound always fires on the frame where the phone draws that character.
There is no interpolation across a hand-declared typing window, and no hardcoded
keystroke loop.

Only four taps fall inside a shot: the host field, the test button, the trust
tick and the save button. Those four are the four ripples and the four tap
sounds; the taps the cut-aheads skip are not sounded because they are not on
screen.

The key bed is thinned. At 0.55 rate a 12 cps burst is a 0.15 s gap, which reads
as a rattle, so any key inside `KEY_CROWD_SEC` (0.16 s) of one that already
sounded is dropped. The survivors are still real keystrokes at their real source
times.

The music bed is normalised against the effects, not the other way round.
`music.mp3` measures **-10.43 LUFS integrated with a +0.80 dBTP peak**.
`MUSIC_VOLUME = 0.16` puts it at **-26.3 LUFS / -15.1 dBTP**, a measured 11 dB
below a tap at 0.9.

## Files

| File             | Role                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| `timeline.ts`    | The edit: beats, shots, stage, framing, sounds, overlays, from JSON   |
| `Demo.tsx`       | Stage assembly: phone, confetti, overlays, sound sequences, outro     |
| `phone.tsx`      | Device frame and screen crop, clip playback, scaled tap ripples       |
| `hero.tsx`       | Copy column, or the lower-third bar used on cropped beats             |
| `spotlight.tsx`  | The kicker/rule/title card, used twice: the hinge and the close        |
| `confetti.tsx`   | 96 seeded particles for the hinge, deterministic frame by frame        |
| `celebration.ts` | One damped squash, on the hinge only                                  |
| `ledger.tsx`     | Live read-out of the typed values                                     |
| `slides.tsx`     | The outro card                                                        |
| `callout.tsx`    | Lime tag with a bracket over the control it names                     |
| `ssh-data.ts`    | The key, the fingerprint, the address, the cost line, the PR URL       |
| `theme.ts`       | Brand tokens, same values as `Color.kt`                               |
| `fonts.ts`       | Geist and Geist Mono (OFL), loaded from `public/fonts`                |

## Working on it

```sh
bun install

bun run dev        # studio, scrub the timeline
bun test src       # capture contract, beats, cadence, framing, copy, hinge
bun run lint       # eslint + tsc
```

One still, without a full render:

```sh
bunx remotion bundle --out-dir=../work/render/bundle
bunx remotion still ../work/render/bundle HaroldDemo ../work/render/qa-final-story/f-600.png --frame=600
```
 
The review set is one still per scene plus one per screen crop, written to
`../work/render/qa-final-story/` as `f-<frame>.png`. Render from the bundle, not
the entry point, or every still pays for its own bundle.

`bun run render` produces the finished cut at `../harold.mp4`. It renders a
high-quality master to `../work/render/harold-master.mp4`, then runs `ffmpeg` to
compress it to H.264 CRF 26 with 96 kbps AAC and faststart.

## What this cut cannot fix

- **The calibration blink reloads a session.** Every slice opens with a short
  sleep/wake blink so the sync can be measured. After the plan beat the wake
  reloads the app onto a session, so `question` and `build` do not start on the
  exact transcript the plan left. The cut never pretends they are one take.
- **The crops are upscales.** A 1080 wide capture is drawn at 1.8–2.4x. Pause on
  the key or the fingerprint and the app's text is soft. Fixing that needs a
  capture at the target size, not a better upscale.
- **The plan and build prompts are cut ahead.** The viewer sees the start and the
  end of each prompt, not every character. The alternative was 45 s of typing.
- **No taps after `landing`.** Those slices ship no `taps[]`, so their taps have
  no ripples and no tap sounds. Only the typing in `plan`, `build` and `pr` is
  sounded.
- **The system pickers are never filmed.** `Attach photo` and `Attach files` open
  Android UI. The cut shows the chips landing in the composer, not the pickers.
- **`plan`'s mode chip reads BUILD.** The capture was taken with the chip in
  build mode, so the PLAN tag brackets the composer instead of the chip. The copy
  is the script's and the bracket is honest.
- **The host-side line is an overlay.** The authorize command on the key beat is
  drawn from `ssh-data.ts`. That step genuinely happened off camera during the
  pre-roll, so there is no footage of it.
