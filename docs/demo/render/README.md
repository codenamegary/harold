# Demo render

Remotion cut for the site and the README. The terminal is drawn here; the phone
screen is the recording from `docs/demo/capture/capture.sh`.

The cut follows docs/demo/script-prompt.md: an intro slide, a terminal-only
opening scene (types `harold start` and `harold pair`, prints the pairing QR),
a split-screen pairing scene (terminal zoomed on "waiting for device…" on the
left, the phone's camera scanning that QR on the right), then the phone alone
for session history, new session, model/mode/effort, a drafted prompt with
photo and file attachments, the text reply, and voice input with its reply.
It ends on an outro slide with the install command and the site URL.

| File               | Role                                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| `Demo.tsx`         | Stage assembly: intro/outro slides, terminal stage, phone stage, captions |
| `timeline.ts`      | The master clock: phone time-remap, layout keyframes, taps, keystrokes, captions, sounds |
| `terminal.tsx`     | Terminal window, type-on commands, scrolling, QR drawn from the grid      |
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
map linearly (render = capture + 19.5s). `voice-input.wav` plays over the voice
scene, the same audio the emulator heard as microphone input.

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
