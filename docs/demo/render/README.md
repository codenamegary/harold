# Demo render

Remotion cut for the site and the README. The terminal is drawn here; the phone
screen is assembled from the slices captured by `docs/demo/capture/capture.sh`.

The cut opens on the SSH host: the terminal types `ssh gary@demo-host -p 2223`,
lists the repos, shows a clean `feat/cat-mode` worktree, and prints the fixed
host key fingerprint. The phone slides in beside it, adds the host, signs in
with the demo password, tests the connection, trusts the fingerprint, and lands
on the connected chat. A spotlight lands on `Your host, your agents` with a
confetti pop.

After that the cut is one continuous job from the couch. The phone opens the
seeded agent history, starts a new session on the `cat-screensaver` feature
worktree with OpenCode, switches to Plan mode, attaches the spec and a cat
photo, and sends the plan prompt. The agent asks one question; the sheet shows
`Settings toggle` and `Automatic`, and the answer `Settings toggle` is
submitted. Build mode implements the toggle, adds tests, and commits on
`feat/cat-mode`. The cut holds on the context and cost line, reviews the clean
uncommitted state and the branch diff against `main`, shows the worktree sheet
with `main` and `feat/cat-mode`, then asks for a draft PR and holds on the URL
in the reply. It ends on the `From plan to PR` spotlight and the outro slide.

| File               | Role                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `Demo.tsx`         | Stage assembly: intro/outro slides, terminal stage, phone stage, captions                           |
| `timeline.ts`      | The edit: slice schedule, rates, holds, captions, spotlights, keystrokes, layout, sounds            |
| `spotlight.tsx`    | Large side copy for spotlight beats                                                                 |
| `celebration.ts`   | Squash, shake, and settle for pop beats                                                             |
| `confetti.tsx`     | Full-stage celebration shower driven by the pop beat                                                |
| `terminal.tsx`     | Terminal window, type-on commands (no scrolling: the whole transcript fits)                         |
| `terminal-data.ts` | Terminal copy, the SSH endpoint, and the fixed host key fingerprint                                 |
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

The SSH connection is the reference spotlight. Set `spotlight` on a step in
`timeline.ts`:

```ts
spotlight: {
  at: 1.2,
  hold: 3.2,
  kicker: "Direct SSH",
  title: "Your host, your agents",
},
celebrate: { at: 1.7, hold: 1.2, confetti: true },
```

`at` and `hold` are seconds after the shot starts. The default side is `left`.
The connected beat docks a 2x close-up (760px wide) on the right. The final
spotlight is `From plan to PR` with the kicker `The whole loop`.

## Phone stage

The setup stage channels live in `SETUP_PHONE_WIDTH`,
`SETUP_PHONE_CENTER_X`, and `SETUP_PHONE_TOP`. The story windows are derived in
`buildTimeline` from the `new_session` and `start_session` shots and exposed as
`Timeline.phoneStage`:

- Enlarge when the new session form opens.
- Hold the large framing through workspace and agent selection.
- Pull back after Start Session.

`Demo.tsx`, the callouts, the phone cards, and the annotations read the derived
stage so overlays track the phone during the story zoom.

The phone screen is a sequence of captured slices, not one stitched video.
`STORY_STEPS` and `SETUP_STEPS` in `timeline.ts` choose each slice's in-point,
rate, render duration, and hold. Typing windows are source times, so the key
sounds follow the recorded typing even when the shot is trimmed or retimed.
The long host, plan, build, and PR waits are compressed there too. The rendered
cut is silent on the phone screen itself: the capture has no microphone input.

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
