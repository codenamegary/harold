# Demo pipeline

`capture.sh` records the phone demo. It starts Harold, issues a pairing code, bakes the live QR into a staged clip, plays that clip through the emulator camera, and screenrecords the app pairing on camera. Remotion plays that recording in a phone frame next to a simulated terminal that runs `harold start` and `harold pair`, QR included.

| File                 | Role                                                                             |
| -------------------- | -------------------------------------------------------------------------------- |
| `capture.sh`         | Start the daemon, pair, compose the feed, boot the emulator, record, write marks |
| `compose_camera.mjs` | Paste the live QR over the staged panel, rotate and crop the clip to 1280x960    |
| `drive_phone.py`     | Walk the app: pair, new session, model, mode, effort, send a prompt              |

## How to run

Needs the 36.5+ emulator at `~/android/emulator` (set `EMULATOR` to override; older builds have no videofile camera) and the debug app installed. `capture.sh` boots and stops the emulator itself, so nothing has to be running first.

```sh
cd apps/android && ./gradlew :app:installDebug
bash docs/demo-pipeline/capture.sh
```

`capture.sh` writes `docs/demo/public/phone.mp4` and `docs/demo/public/capture.json`. Both are committed, so the cut renders from a fresh clone without re-capturing.

Preview or render from `docs/demo`:

```sh
bun install
bun run dev
bunx remotion render src/index.ts HaroldDemo out/harold.mp4
```

## How it works

The staged clip (`virtual-qr-code-webcam.mp4`) shows a laptop running `harold pair`. `compose_camera.mjs` tracks the QR panel on the laptop screen per frame and pastes the real pairing QR over it, then rotates the clip 90 degrees counter-clockwise and cover-crops it onto a 1280x960 canvas. That canvas is what the emulator's videofile camera streams at: it stretches any file onto its 4:3 streams (preview 1280x960, analysis 640x480), so anything else arrives squashed and unscannable. The emulator shows frames rotated 90 degrees clockwise (`hw.camera.back.orientation=90`), which the counter-clockwise authoring cancels. A 120 second freeze tail keeps the QR on screen after the 7 second clip ends.

`capture.sh` boots the emulator with `-feature VideoPlayback -camera-back videofile:camera-live.mp4`. The first camera open after boot is black for 15-25 seconds, so the driver opens the scanner once (`--warm`) before recording. That warm scan must not pair - pairing codes are single-use, and a failing claim puts the app into a retry loop that wedges the emulator - so the composed feed keeps the live QR out of the first 40 seconds. The warm pass scans inert footage and finds nothing; the recorded scan reaches the QR region and pairs on camera with a warm camera.

`capture.json` stores the video size and the UI marks, counted from the start of the screen recording. The simulated terminal follows those marks: it prints `Device paired.` when the phone lands on the paired chat. The caption under the phone changes on the same marks (`steps.ts`). A short title card opens the cut and a four second install card closes it.

The QR in the terminal is the real pairing QR from the recorded run. `qr-rows.ts` holds the CLI's half-block output and `qr-matrix.ts` decodes it into a module grid, so the video draws squares instead of relying on font glyphs. The code has long expired, so scanning it does nothing.

`.opencode/skills/compose-demo/SKILL.md` is the runbook: what to verify after each stage and how to debug when a stage fails.
