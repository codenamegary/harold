# Demo capture

`capture.sh` records the phone demo. It starts Harold, issues a pairing code, bakes the live QR into a staged clip, plays that clip through the emulator camera, and screenrecords the app pairing on camera. Remotion plays that recording in a phone frame next to a simulated terminal that runs `harold start` and `harold pair`, QR included.

| File                 | Role                                                                             |
| -------------------- | -------------------------------------------------------------------------------- |
| `capture.sh`         | Start the daemon, pair, compose the feed, boot the emulator, record, write marks |
| `compose_camera.mjs` | Overlay the live QR on the tracked panel after a 40s gate, crop to 1280x960      |
| `drive_phone.py`     | Walk the app: pair, new session, model, mode, effort, send a prompt              |
| `cut_dead_space.py`  | Detect the frozen scan stretch, cut it out of phone.mp4, remap the marks         |

`assets/virtual-qr-code-webcam.mp4` is the staged clip the camera feed is composed from.

## What is kept and what is not

- **Kept, committed:** everything in this directory plus the recordings the run produces: `docs/demo/render/public/phone.mp4` and `docs/demo/render/public/capture.json`.
- **Not kept:** everything else the run generates (composed feed, logs, raw recording, pairing code, screenshots) lands in `docs/demo/work/capture/` and is never committed. Delete that directory any time.

## How to run

Needs the 36.5+ emulator at `~/android/emulator` (set `EMULATOR` to override; older builds have no videofile camera) and the debug app installed. `capture.sh` boots and stops the emulator itself, so nothing has to be running first.

```sh
cd apps/android && ./gradlew :app:installDebug
bash docs/demo/capture/capture.sh
```

`capture.sh` writes `docs/demo/render/public/phone.mp4` and `docs/demo/render/public/capture.json`. Both are committed, so the cut renders from a fresh clone without re-capturing.

Preview or render from `docs/demo/render` (the render lands at `docs/demo/harold.mp4`, which is committed):

```sh
bun install
bun run dev
bunx remotion render src/index.ts HaroldDemo ../harold.mp4
```

## How it works

The staged clip (`assets/virtual-qr-code-webcam.mp4`) shows a laptop running `harold pair`. `compose_camera.mjs` tracks the QR panel on the laptop screen per frame and pastes the real pairing QR over it, then rotates the clip 90 degrees counter-clockwise and cover-crops it onto a 1280x960 canvas. That canvas is what the emulator's videofile camera streams at: it stretches any file onto its 4:3 streams (preview 1280x960, analysis 640x480), so anything else arrives squashed and unscannable. The emulator shows frames rotated 90 degrees clockwise (`hw.camera.back.orientation=90`), which the counter-clockwise authoring cancels. A 120 second freeze tail keeps the QR on screen after the 7 second clip ends.

`capture.sh` boots the emulator with `-feature VideoPlayback -camera-back videofile:docs/demo/work/capture/camera-live.mp4`. The first camera open after boot is black for 15-25 seconds, so the driver opens the scanner once (`--warm`) before recording. That warm scan must not pair: pairing codes are single-use, and a failing claim puts the app into a retry loop that wedges the emulator. The composed feed keeps the live QR out of the first 40 seconds. The warm pass scans inert footage and finds nothing; the recorded scan reaches the QR region and pairs on camera with a warm camera.

The scanner then sits on the frozen feed until pairing lands, and that dead stretch is cut: `cut_dead_space.py` measures frame-to-frame motion, finds the frozen run inside the scan window, trims it out of `phone.mp4` (keeping the QR on screen for a moment and a beat before pairing), and remaps the marks in `capture.json` to the shorter timeline. The raw recording is stashed as `work/capture/phone-raw.mp4` so the cut can be re-run; without it the script is a no-op. In the cut, once the terminal has printed the device list it dims and slides left while the phone zooms to center stage (`Demo.tsx` keys that off the pairing mark).

`capture.json` stores the video size and the UI marks, counted from the start of the screen recording. The simulated terminal follows those marks: it prints `Device paired.` when the phone lands on the paired chat. The caption under the phone changes on the same marks (`steps.ts`). A short title card opens the cut and a four second install card closes it.

The QR in the terminal is the real pairing QR from the recorded run. `qr-rows.ts` holds the CLI's half-block output and `qr-matrix.ts` decodes it into a module grid, so the video draws squares instead of relying on font glyphs. The code has long expired, so scanning it does nothing.

`.opencode/skills/compose-demo/SKILL.md` is the runbook: what to verify after each stage and how to debug when a stage fails.
