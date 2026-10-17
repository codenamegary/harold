# Demo render

Remotion cut for the site and the README. The terminal is drawn here; the phone
screen is the recording from `docs/demo/capture/capture.sh`.

The cut follows docs/demo/script-prompt.md: an intro slide, a terminal-only
opening scene (types `harold start` and prints the server status, zoomed in
close and fixed in place), then the pairing flow - the terminal zooms out to
sit fully in frame on the left, the phone slides in to the right of it, the
terminal types `harold pair` and prints the QR for the recorded pairing code,
the phone taps Pair and its camera scans that QR, landing on `Device paired.`.
Only then does the terminal slide out and the phone take center stage for
session history, new session, model/mode/effort, a drafted prompt with photo
and file attachments, the text reply, and voice input with its reply. It ends
on an outro slide with the install command and the site URL.

| File               | Role                                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| `Demo.tsx`         | Stage assembly: intro/outro slides, terminal stage, phone stage, captions |
| `timeline.ts`      | The master clock: phone time-remap, layout keyframes, taps, keystrokes, captions, sounds |
| `terminal.tsx`     | Terminal window, type-on commands, QR drawn from the grid (no scrolling: the whole transcript fits) |
| `terminal-data.ts` | Terminal copy (status block, pairing block) from the recorded run         |
| `qr-rows.ts`       | The live pairing QR of the recorded run as half-block rows                |
| `qr-matrix.ts`     | Decodes those rows into a module grid so the QR renders as crisp squares  |
| `phone.tsx`        | Phone frame, time-remapped screen playback, tap ripples                   |
| `theme.ts`         | Brand tokens                                                              |

Three routines run through the walkthrough, matching the script:

- **[KR] keystroke** — every typed character plays `public/sfx/key.wav`;
  Enter plays `public/sfx/enter.wav` (terminal commands, model search, prompt).
- **[TAP] tap** — every tap blooms a ring on the phone screen and plays
  `public/sfx/tap.wav`. Positions and times come from `drive_phone.py`'s tap
  log and the recorded frames; they live in the `tapSpecs` table in
  `timeline.ts`.
- **[CAP] caption** — each caption fades in with a lift and plays
  `public/sfx/ping.wav`.

The phone video is remapped, never re-timed by hand: two short holds give the
captions room (before the Pair tap and before the session dropdown) and one 3x
sprint skips the scanner warm-up. Everything else plays 1:1, so capture marks
map linearly (render = capture + 12.1s). The rendered cut is silent on the
phone screen itself: `voice-input.wav` exists only as the emulator's
microphone feed during capture and is never played in the video.

The phone capture and marks are committed under `public/`, so the cut renders
offline from a fresh clone. Run the capture script only when you want a fresh
recording — and expect to re-check the `tapSpecs` table against the new marks
and frames when you do.

The finished cut renders to `../harold.mp4`, which is committed. Spot-check
stills and the bundle go to `../work/render/` and stay out of git.

```sh
bun install

# Only needed for a new recording:
bash ../capture/capture.sh

bun run dev
bunx remotion render src/index.ts HaroldDemo ../harold.mp4
```

`bun run dev` opens the studio so you can scrub the timeline.
