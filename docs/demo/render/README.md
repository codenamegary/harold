# Demo render

Remotion cut for the site and the README. The terminal is drawn here; the phone
screen is assembled from the slices captured by `docs/demo/capture/capture.sh`.

The cut follows docs/demo/script-prompt.md: an intro slide, a terminal-only
opening scene (types `harold start` and prints the server status, zoomed in
close and fixed in place), then the pairing flow - the terminal zooms out to
sit fully in frame on the left, the phone slides in to the right of it, the
terminal types `harold pair` and prints the QR for the recorded pairing code,
the phone taps Pair and its camera scans that QR, names the first Harold
`Work`, and lands on `Device paired.`. The phone then pairs a second Harold
over the manual endpoint, names it `Couch`, and browses sessions across both
Harolds. It takes center stage for session history, new session with a
workspace and agent from each Harold, model/mode/effort, slash commands, a
drafted prompt with photo and file attachments, the text reply, and voice
input with its reply. It ends on an outro slide with the install command and
the site URL.

| File               | Role                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `Demo.tsx`         | Stage assembly: intro/outro slides, terminal stage, phone stage, captions                           |
| `timeline.ts`      | The edit: slice schedule, rates, holds, captions, keystrokes, layout, sounds                        |
| `terminal.tsx`     | Terminal window, type-on commands, QR drawn from the grid (no scrolling: the whole transcript fits) |
| `terminal-data.ts` | Terminal copy (status block, pairing block) from the recorded run                                   |
| `qr-rows.ts`       | The live pairing QR of the recorded run as half-block rows                                          |
| `qr-matrix.ts`     | Decodes those rows into a module grid so the QR renders as crisp squares                            |
| `phone.tsx`        | Phone frame, active slice playback, tap ripples                                                     |
| `theme.ts`         | Brand tokens                                                                                        |

Three routines run through the walkthrough, matching the script:

- **[KR] keystroke** — every typed character plays `public/sfx/key.wav`;
  Enter plays `public/sfx/enter.wav` (terminal commands, model search, prompt).
- **[TAP] tap** — every tap blooms a ring on the phone screen and plays
  `public/sfx/tap.wav`. Positions and in-slice times come from
  `capture.json`; `timeline.ts` maps them onto the shot.
- **[CAP] caption** — each caption fades in with a lift and plays
  `public/sfx/ping.wav`.

The phone screen is a sequence of captured slices, not one stitched video.
`WALK_STEPS` and `PAIR_STEPS` in `timeline.ts` choose each slice's in-point,
rate, render duration, and hold. Typing windows are source times, so the key
sounds follow the recorded typing even when the shot is trimmed or retimed.
The scanner opening, the identity typing, and the long session-creation,
reply-stream, and voice-reply waits are compressed there too. The rendered cut is silent on
the phone screen itself: `voice-input.wav` exists only as the emulator's
microphone feed during capture and is never played in the video.

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
