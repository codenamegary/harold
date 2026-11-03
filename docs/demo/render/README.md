# Demo render

Remotion cut for the site and the README. The terminal is drawn here; the phone
screen is assembled from the slices captured by `docs/demo/capture/capture.sh`.

The cut follows docs/demo/script-prompt.md: an intro slide, a terminal-only
opening scene (types `harold start` and prints the server status, zoomed in
close and fixed in place), then the pairing flow - the terminal zooms out to
sit fully in frame on the left, the phone slides in to the right of it, the
terminal types `harold pair` and prints the QR for the recorded pairing code,
the phone taps Pair and its camera scans that QR, names the Harold `Work`, and
lands on `Device paired.`. The first pairing lands on a spotlight beat: the
phone stays right, pops once, confetti falls across the stage, and the
achievement copy fills the left. The first pairing also runs in a 2x close-up:
the phone frames the top two thirds from the Pair tap through the scanner and
name entry, then pans up after the confirm so the landing screen is visible.

After the achievement the cut is one continuous job from the couch. The phone
starts a new session on the `cat-screensaver` feature worktree, switches to
Plan mode, attaches the spec and a cat photo, and sends the plan prompt. The
agent asks one question; the sheet shows `Settings toggle` and `Automatic`, and
the answer `Settings toggle` is submitted. Build mode implements the toggle,
adds tests, and commits on `feat/cat-mode`. The cut holds on the context and
cost line, reviews the clean uncommitted state and the branch diff against
`main`, shows the worktree sheet with `main` and `feat/cat-mode`, then asks for
a draft PR and holds on the URL in the reply. It ends on the `From plan to PR`
spotlight and the existing outro slide.

| File               | Role                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `Demo.tsx`         | Stage assembly: intro/outro slides, terminal stage, phone stage, captions                           |
| `timeline.ts`      | The edit: slice schedule, rates, holds, captions, spotlights, keystrokes, layout, sounds            |
| `spotlight.tsx`    | Large side copy for spotlight beats                                                                 |
| `celebration.ts`   | Squash, shake, and settle for pop beats                                                             |
| `confetti.tsx`     | Full-stage celebration shower driven by the pop beat                                                |
| `terminal.tsx`     | Terminal window, type-on commands, QR drawn from the grid (no scrolling: the whole transcript fits) |
| `terminal-data.ts` | Terminal copy (status block, pairing block) from the recorded run                                   |
| `qr-rows.ts`       | The live pairing QR of the recorded run as half-block rows                                          |
| `qr-matrix.ts`     | Decodes those rows into a module grid so the QR renders as crisp squares                            |
| `phone.tsx`        | Phone frame, active slice playback, tap ripples                                                     |
| `theme.ts`         | Brand tokens                                                                                        |

Six routines run through the walkthrough, matching the script:

- **[KR] keystroke** — every typed character plays `public/sfx/key.wav`;
  Enter plays `public/sfx/enter.wav` (terminal commands and phone prompts).
- **[TAP] tap** — every tap blooms a ring on the phone screen and plays
  `public/sfx/tap.wav`. Positions and in-slice times come from
  `capture.json`; `timeline.ts` maps them onto the shot.
- **[CAP] caption** — each caption fades in with a lift and plays
  `public/sfx/ping.wav`.
- **[ZOOM] zoom** — a step with `focus` pushes the camera into the phone and
  docks the focus point near the stage center. A step with no focus pulls back.
- **[SPOTLIGHT] spotlight** — a step with `spotlight` keeps the phone to one
  side and lands large display-type copy on the other side. `celebrate` adds
  the [POP] squash and shake.
- **[CONFETTI] confetti** — `celebrate` with `confetti: true` drops a 3.2s
  full-stage shower from `confetti.tsx`. It has no sound of its own.

## Spotlight beats

The achievement after the first pairing is the reference spotlight. Set
`spotlight` on a step in `timeline.ts`:

```ts
spotlight: {
  at: 1.2,
  hold: 3.2,
  kicker: "Achievement unlocked",
  title: "Work from Couch",
},
celebrate: { at: 1.7, hold: 1.3, confetti: true },
```

`at` and `hold` are seconds after the shot starts. The default side is `left`.
The paired beat docks a 2x close-up (760px wide) on the right. The final
spotlight is `From plan to PR` with the kicker `The whole loop`.

## Phone stage

The pairing stage channels live in `PAIR_PHONE_WIDTH`,
`PAIR_PHONE_CENTER_X`, and `PAIR_PHONE_TOP`. The story windows are derived in
`buildTimeline` from the `new_session` and `continue` shots and exposed as
`Timeline.phoneStage`:

- Enlarge when the new session form opens.
- Hold the large framing through workspace selection.
- Pull back after Continue.

`Demo.tsx`, the callouts, the phone cards, and the annotations read the derived
stage so overlays track the phone during the story zoom.

The phone screen is a sequence of captured slices, not one stitched video.
`STORY_STEPS` and `PAIR_STEPS` in `timeline.ts` choose each slice's in-point,
rate, render duration, and hold. Typing windows are source times, so the key
sounds follow the recorded typing even when the shot is trimmed or retimed.
The long plan, build, and PR waits are compressed there too. The rendered cut
is silent on the phone screen itself: the capture has no microphone input.

The slices and `capture.json` are committed under `public/`, so the cut
renders offline from a fresh clone. Run the capture script only when you want
a fresh recording. Retiming the existing slices is a `timeline.ts` change.

`bun run render` produces the finished cut at `../harold.mp4`, which is
committed. It renders a high-quality master to
`../work/render/harold-master.mp4`, then runs `ffmpeg` to compress it to H.264
CRF 26 with 96 kbps AAC and faststart. The master, spot-check stills, and the
bundle go to `../work/render/` and stay out of git. `ffmpeg` must be on `PATH`;
`bun run compress` re-runs only the compression step.

```sh
bun install

# Only needed for a new recording:
bash ../capture/capture.sh

bun run dev        # studio, scrub the timeline
bun run render     # render the cut, then compress it
```

`bun run dev` opens the studio so you can scrub the timeline.
