# Demo render

A 195.1 second cut at 1920x1080, 30 fps, 5854 frames. The phone screen is real
emulator capture; the capture is raw material. Each act lives in its own
`<scene>.ts` + `<scene>.scene.tsx` pair: opening, achievement, new session,
plan, question, build, usage, changes, worktrees, PR, and outro. The act module
owns camera, light, and body; the scene component draws it.
[`timeline.ts`](src/timeline.ts) holds the footage, copy, sound, and scene
lengths. One shared stage draws pool, beam, phone, and haze.
[`../script.md`](../script.md) is the script and the only source for scene
order, copy, stage, camera and sound.

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

The cut is 5854 frames. That is 195.1 s at 30 fps. Every scene holds one light
state. A state change eases over 1.2 s before it holds. Some acts also change
the shape of that state as the camera moves.

| Scene         | Frames | Range     | Seconds | Light     | Footage                                      | Copy                                                     |
| ------------- | ------ | --------- | ------- | --------- | -------------------------------------------- | -------------------------------------------------------- |
| `intro`       | 126    | 1-126     | 4.2     | `alone`   | none                                         | slide: logo, subtitle, CTA                               |
| `ssh`         | 606    | 127-732   | 20.2    | `arrival` | `home_empty` hold, `connect` to the save tap | `[CARD place=stage]` Look what I can do! |
| `achievement` | 232    | 733-964   | 7.7     | `reward`  | `connect` from the save tap, then `landing`  | `[SPOTLIGHT]` Achievement unlocked / Work from Couch     |
| `newSession`  | 468    | 965-1432  | 15.6    | `work`    | `new_session`                                | `[NOTE]` Start something new                             |
| `plan`        | 1662   | 1433-3094 | 55.4    | `work`    | `plan`                                       | `[CALLOUT]` Plan, Attachments                            |
| `question`    | 171    | 3095-3265 | 5.7     | `work`    | `question`                                   | `[CALLOUT]` Agent question                               |
| `build`       | 1330   | 3266-4595 | 44.3    | `work`    | `build`                                      | `[CALLOUT]` Build                                        |
| `usage`       | 130    | 4596-4725 | 4.3     | `work`    | `usage`                                      | `[CALLOUT]` Usage                                        |
| `changes`     | 327    | 4726-5052 | 10.9    | `work`    | `changes`                                    | `[CALLOUT]` Changes, Changes                             |
| `worktrees`   | 107    | 5053-5159 | 3.6     | `work`    | `worktrees`                                  | `[CALLOUT]` Worktrees                                    |
| `pr`          | 545    | 5160-5704 | 18.2    | `full`    | `pr`                                         | `[CALLOUT]` Draft PR, `[SPOTLIGHT]` the close            |
| `outro`       | 150    | 5705-5854 | 5.0     | `alone`   | none                                         | slide: logo, subtitle, CTA, site                         |
| **Total**     | **5854** | **1-5854** | **195.1** |        |                                              |                                                          |

The achievement sits third, right after the SSH scene, while the cost of setup is
still fresh. It is the film's only `[POP]` and only `[CF]`.

`HaroldDemo` is the whole cut. Studio also lists one composition per act:
`HaroldOpening`, `HaroldAchievement`, `HaroldNewSession`, `HaroldPlan`,
`HaroldQuestion`, `HaroldBuild`, `HaroldUsage`, `HaroldChanges`,
`HaroldWorktrees`, `HaroldPr`, and `HaroldOutro`.

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
only flare. That pool stays off the left copy. `work` is a wide hot pool centred
on the handset's bottom edge and the haze dims. `full` is a wider centred field
on the same point, so the phone always stands in the middle of the oval.
`lightAt` is the only place a state becomes pixels. The tests assert that every
scene holds the shape its state names, and that the work and full pools sit on
the phone's feet.

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
- `newSession` eases from the achievement's framing back to centre, pushes in
  on the session form as it opens with the top of the app screen on the top
  edge, holds while the workspace and agent menus are open, then pulls back to
  the full phone as Start Session opens the chat. The reward pool settles into
  a large forward pool, widens with the push-in until it runs off the bottom
  edge, holds through the form, then tightens back to the resting pool. The
  phone is steady between those moves: no idle sway and no camera drift. The
  push and pull follow capture marks in
  [`newSession.ts`](src/newSession.ts).
- `plan` holds the handset straight while the prompt is typed. The light
  narrows from the new-session resting pool into work. Camera, light, and pose
  live in [`plan.ts`](src/plan.ts).
- `question` holds straight while the question is answered.
- `build` holds straight while the build runs.
- `usage` leans in slightly while the camera pushes in, then straightens for the
  hold. The pool opens out with the move.
- `changes` turns slightly while the camera pulls back, then straightens for the
  diff. The pool pulls back with it. `worktrees` holds straight.
- `pr` sits straight while the pool opens from work to full.
- `outro` has no phone. It draws the closing slide in the alone pool.

Every pose and handoff above lives in the act module beside its scene
component.

Every act after `newSession` passes `idleGain={0}` and `phoneDriftFactor={0}`.
The phone is straight and still for every demo hold. The only body rotation is
the short tilt that rides the `usage` push-in and the `changes` pull-back, and
it is gone before the hold. No cut leaves a lean or turn behind. The opening and
achievement keep their own entrance walk and lean.

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
bun run dev        # studio, scrub HaroldDemo or any Harold<Act> composition
bun test src       # scenes, light, parallax, body, camera, copy, sound, pacing
bun run lint       # eslint + tsc
```

`HaroldAchievement` previews the act from the chat landing screen. It does not
replay the SSH form that leads into the main cut. `HaroldNewSession` previews
the act from the session menu.

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
