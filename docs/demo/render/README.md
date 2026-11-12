# Demo render

A 184.9 second cut at 1920x1080, 30 fps, 5548 frames. The phone screen is real
emulator capture; the capture is raw material. The opening act lives in
[`opening.ts`](src/opening.ts) and [`opening.scene.tsx`](src/opening.scene.tsx).
The achievement act lives in [`achievement.ts`](src/achievement.ts) and
[`achievement.scene.tsx`](src/achievement.scene.tsx). The rest of the cut lives
in [`timeline.ts`](src/timeline.ts). One shared stage draws pool, beam, phone,
and haze. [`../script.md`](../script.md) is the script and the only source for
scene order, copy, stage, camera and sound.

The cut follows the script's twelve scenes, its stage, its camera vocabulary and
its copy. There is no cold open and no promise card.

## Footage

`public/capture.json` and `public/slices/` hold 11 slices from the MCP capture
pipeline, 1080x2400, with the exact time of every tap (`taps[]`), every
keystroke (`keys[]`) and every named mark (`marks[]`). Nothing is re-recorded
here.

| Slice           | Used for                                                     |
| --------------- | ------------------------------------------------------------ |
| `home_empty`    | the empty home, as the phone arrives                         |
| `connect`       | Add connection, typing, scroll, test, trust, save            |
| `landing`       | the chat landing after save                                   |
| `new_session`   | the session menu, the new session form, the chat opening       |
| `plan`          | the 338-character plan prompt, four real windows               |
| `question`      | the plan reply, the question card, the answer sheet            |
| `build`         | the 251-character build prompt, then the settled reply         |
| `usage`         | the context and cost line                                     |
| `changes`       | the empty scope, the branch list, the diff                     |
| `worktrees`     | the worktree sheet                                            |
| `pr`            | the PR prompt, the URL, and the close                          |

## The scenes

The cut is 5548 frames. That is 184.9 s at 30 fps. Every scene holds one light
state, and a state change eases over 1.2 s before it holds.

| Scene         | Frames | Range     | Seconds | Light     | Footage                                      | Copy                                                     |
| ------------- | ------ | --------- | ------- | --------- | -------------------------------------------- | -------------------------------------------------------- |
| `intro`       | 126    | 1-126     | 4.2     | `alone`   | none                                         | slide: logo, subtitle, CTA                               |
| `ssh`         | 606    | 127-732   | 20.2    | `arrival` | `home_empty` hold, `connect` to the save tap | `[CARD place=stage]` Look what I can do! |
| `achievement` | 232    | 733-964   | 7.7     | `reward`  | `connect` from the save tap, then `landing`  | `[SPOTLIGHT]` Achievement unlocked / Work from Couch     |
| `newSession`  | 162    | 965-1126  | 5.4     | `work`    | `new_session`                                | `[NOTE]` Start something new                             |
| `plan`        | 1662   | 1127-2788 | 55.4    | `work`    | `plan`                                       | `[CALLOUT]` Plan, Attachments                            |
| `question`    | 171    | 2789-2959 | 5.7     | `work`    | `question`                                   | `[CALLOUT]` Agent question                               |
| `build`       | 1330   | 2960-4289 | 44.3    | `work`    | `build`                                      | `[CALLOUT]` Build                                        |
| `usage`       | 130    | 4290-4419 | 4.3     | `work`    | `usage`                                      | `[CALLOUT]` Usage                                        |
| `changes`     | 327    | 4420-4746 | 10.9    | `work`    | `changes`                                    | `[CALLOUT]` Changes, Changes                             |
| `worktrees`   | 107    | 4747-4853 | 3.6     | `work`    | `worktrees`                                  | `[CALLOUT]` Worktrees                                    |
| `pr`          | 545    | 4854-5398 | 18.2    | `full`    | `pr`                                         | `[CALLOUT]` Draft PR, `[SPOTLIGHT]` the close            |
| `outro`       | 150    | 5399-5548 | 5.0     | `alone`   | none                                         | slide: logo, subtitle, CTA, site                         |
| **Total**     | **5548** | **1-5548** | **184.9** |        |                                              |                                                          |

The achievement sits third, right after the SSH scene, while the cost of setup is
still fresh. It is the film's only `[POP]` and only `[CF]`.

## The stage

Four layers, back to front, in [`stage.ts`](src/stage.ts) and
[`stage-view.tsx`](src/stage-view.tsx):

- **back**: a dark void. It never moves.
- **floor**: a faint wall bounce, a soft horizon seam, and the light that
  spills past the pool.
- **pool**: one soft ellipse on the floor with a hot centre. `reward` adds one
  lime flare.
- **beam**: a blurred cone from a lamp above the frame down to the pool
  (`beamCone`), with dust behind the phone.
- **phone**: the handset. `rimLevels` lights each edge by how far the pool sits
  to that side, so the rim follows the light as it moves. The contact shadow
  only reads inside the pool.
- **haze**: a thin front layer of the beam and a few motes. It fades out as the
  camera gets close so the screen stays clean.
- **grade**: a vignette and film grain. The grain keeps the dark gradients from
  banding in the encode.

Floor, pool, beam and haze are drawn in world pixels inside `StageWorld`. A
scene can pass `worldLock`, a camera state where the world sits 1:1. The world
then scales and moves with the camera, pinned to the phone's feet. The opening
locks to its frame-filling camera, so the wide shot sees the whole stage from
further back and the push-in carries the stage with the phone. Scenes without a
lock draw the world in screen space, as before.

Five light states, in [`stage.ts`](src/stage.ts): `alone`, `arrival`, `reward`,
`work`, `full`. Each is its own shape (radius, centre, intensity, haze, flare).
A change eases over 1.2 s and then holds exactly until the next one. `alone` is
a wide dim pool under the lockup. `arrival` is brighter and sits a little left
of the phone, so the phone is lit from one side. `reward` floods the floor on the phone's side and is the
only flare. That pool stays off the left copy. `work` is a tight hot pool and
the haze dims. `full` is a wide centred pool. `lightAt` is the only place a
state becomes pixels. The tests assert that every scene holds the shape its
state names.

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
`rotateY`, `rotateX`, `scale`. Close cues ease across their gap. A longer gap
holds the pose, then eases in the last 0.6s. Every scene with footage states
its pose on the cut.

- `intro` runs 4.2s. The lamp flickers on, the mark pops at 0.5s, the title
  rises word by word, then the lockup lifts away at 3.15s and the pool slides
  right and tightens for the phone.
- `ssh` waddles in small and further back over 1.6s, seven snappy steps, then
  hops and lands in the pool. The card pops in beside it at 1.2s. The camera
  pushes in from 2.85s until the phone fills the frame. After the push, the
  idle walk stops and the phone no longer takes the camera drift. The camera
  punches in on Add connection at 4.1s, taps, then punches back out to the
  full form. All of these times live at the top of
  [`opening.ts`](src/opening.ts).
- `achievement` eases from the filled handoff into the right slot at 2x, blooms
  the pool, then holds. The phone leans in as the home screen lands and settles
  before new-session. One pop. All of these times live at the top of
  [`achievement.ts`](src/achievement.ts).
- `newSession` returns to centre and holds.
- `plan` leans in and holds: rotateY -16, rotateX -10, scale 1.07.
- `question` sits back and holds: rotateY 14, scale 0.92.
- `build` watches and holds: rotateX -8, scale 1.05.
- `usage` gives a small nod toward the header and holds. The camera does the zoom.
- `changes` turns to present and holds: rotateY -16. `worktrees` keeps that turn.
- `pr` sits centred in the wide pool.

`idleAt` keeps a quiet waddle on every held pose. Camera scale 1.5 and up uses
a smaller idle so a close-up stays readable.

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
stop at `connect`, and no scene with a callout plays a slice with taps, so
every callout in the film uses the override — and every override was measured off
the captured frames (the mode chip at `0.79, 0.703`, the question card at
`0.5, 0.69`, the send control at `0.872, 0.78`, and so on). The rule itself is
tested against a shot that does ship taps.

Copy strings are the script's, verbatim, including `Use your agent’s plan mode`
with its curly apostrophe and `Pretty diffs!` with its exclamation mark.

## Sound

- One ping per copy primitive, at the frame it lands.
- One tap sound and one ripple per recorded tap in a played slice.
- One key sound per recorded keystroke, thinned when two land closer than
  0.16 s. Keystrokes are never interpolated.
- `[POP]` and `[CF]` are silent.
- The music bed is measured, not dialled: `MUSIC_VOLUME = 0.16` puts `music.mp3`
  at -26.3 LUFS, a measured 11 dB under a tap.

Taps and keys are mapped through the inverse of `clipFrame`, so a keystroke sound
fires on the frame where the phone draws that character.

## Pacing

Each slice plays once, from the start, at the speed it was recorded. The scene
is as long as those slices. Intro and outro are the only fixed lengths. Typing
is not sped up and not cut short to hit a runtime.

## Working on it

```sh
bun install
bun run dev        # studio, scrub HaroldDemo, HaroldOpening or HaroldAchievement
bun test src       # scenes, light, parallax, body, camera, copy, sound, pacing
bun run lint       # eslint + tsc
```

`HaroldAchievement` previews the act from the chat landing screen. It does not
replay the SSH form that leads into the main cut.

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
  after `connect` and the system pickers were never filmed, so `Attach
  photo`, `Add (1)`, `Attach files`, `Against main`, `settings.js`, `Dismiss` and
  friends are described by the copy, not shown as taps.
- **The calibration blink reloads a session.** `question` and `build` do not start
  on the exact transcript `plan` left.
- **`plan`'s mode chip reads BUILD.** The capture's chip is in build mode, so the
  PLAN tag brackets the chip pointing at the right control with the wrong word.
- **The clips are upscales above 1x.** `usage` at 2.2x is a mild upscale of a
  1080-wide capture. Sharp at the numbers, soft at the edges.
