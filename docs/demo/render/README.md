# Demo render

A 113.0 second cut at 1920x1080, 30 fps, 3390 frames. The phone screen is real
emulator capture; the capture is raw material and the edit lives in
[`timeline.ts`](src/timeline.ts). [`../script.md`](../script.md) is the script and
the only source for scene order, copy, stage, camera and sound.

The cut follows the script's twelve scenes, its stage, its camera vocabulary and
its copy. There is no cold open and no promise card.

## Footage

`public/capture.json` and `public/slices/` hold 15 slices from the MCP capture
pipeline: 135.4 s of CFR 60, 1080x2400, with the exact time of every tap
(`taps[]`), every keystroke (`keys[]`) and every named mark (`marks[]`). Nothing
is re-recorded here.

| Slice           | Used for                                                     |
| --------------- | ------------------------------------------------------------ |
| `connect_empty` | the empty SSH host form, as the phone arrives                 |
| `connect_key`   | the generated public key                                      |
| `connect_fill`  | the host field being typed; then the filled form              |
| `connect_test`  | the test tap; then the host fingerprint                       |
| `connect_trust` | the trust tick                                                |
| `connect_save`  | the save tap                                                  |
| `landing`       | the chat landing, then the achievement on the same recording  |
| `new_session`   | the session menu, the new session form, the chat opening       |
| `plan`          | the 338-character plan prompt, four real windows               |
| `question`      | the plan reply, the question card, the answer sheet            |
| `build`         | the 251-character build prompt, then the settled reply         |
| `usage`         | the context and cost line                                     |
| `changes`       | the empty scope, the branch list, the diff                     |
| `worktrees`     | the worktree sheet                                            |
| `pr`            | the PR prompt, the URL, and the close                          |

## The scenes

The cut is 3390 frames. That is 113.0 s at 30 fps. Every scene holds one light
state, and a state change eases over 1.2 s before it holds.

| Scene         | Frames | Range   | Seconds | Light     | Footage                                                                 | Copy                                                     |
| ------------- | ------ | ------- | ------- | --------- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| `intro`       | 105    | 1-105   | 3.5     | `alone`   | none                                                                    | slide: logo, subtitle, CTA                               |
| `ssh`         | 600    | 106-705 | 20.0    | `arrival` | `connect_empty`, `connect_key`, `connect_fill` x2, `connect_test` x2, `connect_trust`, `connect_save`, `landing` | `[CARD place=stage]` Harold over SSH to your agent hosts |
| `achievement` | 225    | 706-930 | 7.5     | `reward`  | `landing` (tail, continuous)                                            | `[SPOTLIGHT]` Achievement unlocked / Work from Couch     |
| `newSession`  | 180    | 931-1110 | 6.0    | `work`    | `new_session` x3                                                        | `[NOTE]` Start something new                             |
| `plan`        | 420    | 1111-1530 | 14.0   | `work`    | `plan` x4                                                               | `[CALLOUT]` Plan, Attachments                            |
| `question`    | 180    | 1531-1710 | 6.0    | `work`    | `question` x3                                                           | `[CALLOUT]` Agent question                               |
| `build`       | 450    | 1711-2160 | 15.0   | `work`    | `build` x5                                                              | `[CALLOUT]` Build                                        |
| `usage`       | 150    | 2161-2310 | 5.0    | `work`    | `usage`                                                                 | `[CALLOUT]` Usage                                        |
| `changes`     | 360    | 2311-2670 | 12.0   | `work`    | `changes` x6                                                            | `[CALLOUT]` Changes, Changes                             |
| `worktrees`   | 105    | 2671-2775 | 3.5    | `work`    | `worktrees` x2                                                          | `[CALLOUT]` Worktrees                                    |
| `pr`          | 465    | 2776-3240 | 15.5   | `full`    | `pr` x5                                                                 | `[CALLOUT]` Draft PR, `[SPOTLIGHT]` the close            |
| `outro`       | 150    | 3241-3390 | 5.0    | `alone`   | none                                                                    | slide: logo, subtitle, CTA, site                         |
| **Total**     | **3390** | **1-3390** | **113.0** |      |                                                                         |                                                          |

The achievement sits third, right after the SSH scene, while the cost of setup is
still fresh. It is the film's only `[POP]` and only `[CF]`.

## The stage

Four layers, back to front, in [`stage.ts`](src/stage.ts) and
[`stage-view.tsx`](src/stage-view.tsx):

- **back**: wall, floor, the seam between them, a vignette. Always the darkest.
- **pool**: the lit ellipse where the floor meets the wall, plus a bloom ring.
  The rim is broken up by seeded lumps of light, so the edge reads as light on a
  rough floor and not as a drawn plate.
- **phone**: the handset, between the pool and the haze. It carries a lit edge on
  the side that faces the pool.
- **haze**: the foreground shaft and 64 seeded dust motes. The nearest layer, so
  it passes over the phone.

Five light states, in [`stage.ts`](src/stage.ts:44): `alone`, `arrival`,
`reward`, `work`, `full`. Each is a full shape — radius, centre, intensity, haze,
flare — and a change eases over 1.2 s and then holds exactly until the next one.
`lightAt` is the only place a state becomes pixels; the tests assert that every
scene holds the shape its state names.

The confetti is lit by the pool. `poolLit` returns how lit a stage point is, and
`confetti.tsx` multiplies every particle's opacity by it, so the shower falls *in*
the light and catches the pool instead of dropping onto a flat black field.

### Parallax

```ts
export const PARALLAX = { back: 0.08, pool: 0.4, phone: 1, haze: 1.8 }
```

The camera drifts at 1.0. The pool drifts slower than the camera, the haze faster,
the wall barely at all: no two layers share a speed, so movement always slides the
phone across the light. The drift rate is authored per scene in percent of frame
width per second, and every scene is between 1 and 2. The accumulator restarts on
every cut, so a shot pans at one constant rate and the cut absorbs the reset.

## The phone as a character

[`body.ts`](src/body.ts) holds the body language as poses: `x`, `y`, `rotateZ`,
`rotateY`, `rotateX`, `scale`. `poseAt` eases between cues, and every scene with
footage states its pose on the cut.

- `ssh` enters with the waddle: a damped roll, a bob, and a turn that rings down
  over 1.5 s, while the camera docks from 0.34 to 0.5 and the pool tightens.
- `plan` leans in — turned towards the camera, scaled up, pushed towards the light.
- `question` sits back — turned away, pushed back, smaller.
- `build` holds still and watches.
- `usage` tilts its top towards the camera to present the header.
- `changes` turns to present its screen, ten degrees at the cut, level within 0.8 s.
- `achievement` turns to camera as the light blooms.

A slow idle sway rides on top of every held pose, so a hold is never a still
image. The waddle is additive, not a one-off: it is the same body language the
rest of the film uses.

## Layouts and camera

Two layouts: `[L1 phone]` one column, phone centred, copy off; `[L2C copy|phone]`
two columns, copy left, phone right (`dock` 0.68). The achievement is the only
`[L2C]`.

Camera presets, in [`camera.ts`](src/camera.ts:31), describe framing and never a
feature:

| Preset                | Scale | Focus          | Dock |
| --------------------- | ----- | -------------- | ---- |
| `full`                | 1     | 0.5, 0.5       | 0.5  |
| `right-full`          | 1     | 0.5, 0.5       | 0.72 |
| `top-two-thirds`      | 2     | 0.5, 0.25      | 0.5  |
| `center-two-thirds`   | 2     | 0.5, 0.5       | 0.5  |
| `lower-center`        | 1.7   | 0.5, 0.78      | 0.5  |
| `lower-right`         | 2.6   | 0.78, 0.8      | 0.5  |
| `upper-center`        | 1.6   | 0.5, 0.22      | 0.5  |

`scale` is magnification against 1x, where 1x is the whole handset standing on
the stage at `PHONE_FIT` (0.82) of the stage height — 398 x 886 px. At 1x the app
is small: that is the wide shot, and it is why the film can show a phone standing
in a pool of light at all. Readability comes from the pushes the script asks for.
`focus` is a point on the phone screen, and the camera puts it at the centre of
the frame, clamped so the stage can never show through the phone.

The `usage` scene honours the script's override exactly:

```ts
{ at: 0, preset: "upper-center", scale: 2.2, focus: { x: 0.5, y: 0.08 } }
```

That is 2.2x, framed on the header: the cost line lands at roughly 23 px on stage,
about twice the 1x device framing, and sharp.

A camera state holds until the next one. A preset change is a cut; nothing eases
between states.

## Copy primitives

[`copy.tsx`](src/copy.tsx) implements what the scenes call:

| Primitive   | Behaviour                                                                 | Used |
| ----------- | ------------------------------------------------------------------------- | ---- |
| `[CARD]`    | white card; `place=stage` sits it beside the phone, otherwise inside the screen and it tracks the camera | 1 |
| `[CALLOUT]` | lime tag, drawn leader line, pulsing target, `compact placement=edge`, `connector=T` | 9 |
| `[SPOTLIGHT]` | mono kicker, lime rule, display title, sentence case as written          | 2 |
| `[NOTE]`    | paper note with a lime tape, slides out from behind the phone and back    | 1 |
| `[BOX]`     | lime box that moves between controls, card text swaps                     | 0 |
| `[CAP]`     | bottom caption, fallback only                                            | 0 |

No scene uses `[BOX]` or `[CAP]`; both are implemented because the vocabulary
names them, and the tests assert the film uses neither.

**The callout anchor rule.** A callout anchors to the first tap of its shot. If
the callout names `targetX`/`targetY`, that point wins. In this capture the taps
stop at `connect_save`, and no scene with a callout plays a slice with taps, so
every callout in the film uses the override — and every override was measured off
the captured frames (the mode chip at `0.79, 0.703`, the question card at
`0.5, 0.69`, the send control at `0.872, 0.78`, and so on). The rule itself is
tested against a shot that does ship taps.

Copy strings are the script's, verbatim, including `Use your agent’s plan mode`
with its curly apostrophe and `Pretty diffs!` with its exclamation mark.

## Sound

- One ping per copy primitive, at the frame it lands.
- One tap sound and one ripple per recorded `[TAP]` that survives a cut: four in
  total (host field, test, trust tick, save).
- One key sound per recorded keystroke the cut actually draws, thinned so a
  12 cps burst does not read as a rattle. Keystrokes are never interpolated.
- `[POP]` and `[CF]` are silent.
- The music bed is measured, not dialled: `MUSIC_VOLUME = 0.16` puts `music.mp3`
  at -26.3 LUFS, a measured 11 dB under a tap.

Taps and keys are mapped through the inverse of `clipFrame`, so a keystroke sound
fires on the frame where the phone draws that character.

## Pacing

- `question` plays at 1.0x throughout: 1.15-5.45 s of a 6.05 s capture, with a
  short hold on the open sheet. Nothing on that scene is slowed.
- No shot is slower than 0.5x.
- The long prompts play a real window at 6-8 characters a second and then cut
  ahead: `plan` 14.0 s, `build` 15.0 s, `pr` 15.5 s, all from capture that would
  otherwise run 45 s at a human cadence.

## Working on it

```sh
bun install
bun run dev        # studio, scrub the timeline
bun test src       # scenes, light, parallax, body, camera, copy, sound, pacing
bun run lint       # eslint + tsc
```

One still, without a full render:

```sh
bunx remotion bundle --out-dir=../work/render/bundle-v2
bunx remotion still ../work/render/bundle-v2 HaroldDemo ../work/render/qa-v2/f-740.png --frame=740
```

The review set lives in `../work/render/qa-v5/`: twelve stills at frames 45, 400,
760, 980, 1200, 1600, 1800, 2240, 2400, 2700, 3000 and 3300, all 1920x1080.

## What this cut cannot fix

- **Most of the film is the wide shot.** At 1x the app renders at 0.37 life size,
  so the diff, the plan text and the PR URL are small. The script only asks for
  matches on `achievement` and `usage`; everywhere else the phone is an object in
  the light and the copy carries the meaning. Readability would need a second,
  tighter preset per scene, which the script does not ask for.
- **The taps that open each screen are off camera.** The capture has no taps
  after `connect_save` and the system pickers were never filmed, so `Attach
  photo`, `Add (1)`, `Attach files`, `Against main`, `settings.js`, `Dismiss` and
  friends are described by the copy, not shown as taps.
- **The calibration blink reloads a session.** `question` and `build` do not start
  on the exact transcript `plan` left.
- **`plan`'s mode chip reads BUILD.** The capture's chip is in build mode, so the
  PLAN tag brackets the chip pointing at the right control with the wrong word.
- **The clips are upscales above 1x.** `usage` at 2.2x is a mild upscale of a
  1080-wide capture. Sharp at the numbers, soft at the edges.
