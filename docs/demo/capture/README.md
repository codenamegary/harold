# Demo capture

`capture.sh` records the phone demo. It starts Harold, issues a pairing code, bakes the live QR into a staged clip, plays that clip through the emulator camera, and records the app pairing on camera one slice per action. Remotion composes those slices in a phone frame next to a simulated terminal that runs `harold start` and `harold pair`, QR included.

| File                 | Role                                                                             |
| -------------------- | -------------------------------------------------------------------------------- |
| `capture.sh`         | The whole run: source daemon, app install, pair, feed, boot, slices, build       |
| `seed_sessions.sh`   | Seed the five recent OpenCode sessions the phone's session menu shows             |
| `compose_camera.mjs` | Overlay the live QR on the tracked panel after a 40s gate, crop to 1280x960      |
| `drive_phone.py`     | Walk the app pair → session history → new session → model/mode/effort → attachments → text and voice chat, one slice per action |
| `build_capture.py`   | Re-encode the slices, attach the taps, and write `capture.json`                  |
| `push_assets.sh`     | Push the demo photos and `cat-diary.txt` onto the factory-reset emulator         |
| `audio-env-shim.c`   | Restore the WAV audio driver variables that the emulator wrapper strips          |

`assets/virtual-qr-code-webcam.mp4` is the staged clip the camera feed is composed from. `assets/cats.zip` holds the demo photos that `capture.sh` installs in the camera roll, and `assets/cat-diary.txt` is the document it installs in Downloads for file attachments. `assets/voice-input.wav` is the speech the emulator's microphone hears during the voice scene.

Before pairing, `seed_sessions.sh` creates five OpenCode sessions with fixed titles via `opencode run --title`. The phone's session menu lists the five most recent sessions newest first, so it shows exactly those titles, in this order: "Cat Therapist near me", "Does KGB use cats?", "Why does my cat hate me?", "Cat treat safe for humans?", and "Russian for dummies". The script pins their stored update times in display order, because OpenCode's run timestamps can land a few milliseconds out of order. Existing history is reused when those five are already the newest sessions, so repeated captures do not add duplicate rows. The sessions live in the main checkout rather than the worktree running the capture, so they still load after that worktree is removed.

## What is kept and what is not

- **Kept, committed:** everything in this directory plus the recordings the run produces: `docs/demo/render/public/slices/` and `docs/demo/render/public/capture.json`.
- **Not kept:** everything else the run generates (composed feed, logs, raw recording, pairing code, screenshots) lands in `docs/demo/work/capture/` and is never committed. Delete that directory any time. The demo daemon runtime lives in `~/.harold-demo` and is recreated each run; the real `~/.harold` is only read for the agent/workspace config.

## How to run

Needs `bun`, `sqlite3`, a JDK and Android SDK, the 36.5+ emulator at `~/android/emulator` (set `EMULATOR` to override; older builds have no videofile camera), a C compiler for the audio shim, and a configured real `~/.harold` with the agents and workspaces the demo uses. The capture runs the Harold CLI from this checkout with `bun run dev` and builds and installs `harold.android.debug` from the same checkout, so the source server and app match instead of using a globally installed `harold` or a stale app. It writes `apps/android/local.properties` when missing. `capture.sh` boots and stops the emulator itself, so nothing has to be running first.

```sh
bash docs/demo/capture/capture.sh
```

The capture stops any running Harold, recreates `~/.harold-demo` (override `HAROLD_DEMO_DATA_DIR`), copies the agents/workspaces from `~/.harold`, clears the demo device/pairing rows, and starts the source daemon on `127.0.0.1:3847`. It sets `adb reverse tcp:3847 tcp:3847` before the recorded app launch, so the emulator reaches the daemon through loopback. Your real `~/.harold` is left stopped. Seeded sessions use `SEED_MODEL` (default `deepseek/deepseek-flash`) so the composer shows the deepseek provider and flash model; set `SEED_MODEL` to override it.

`capture.sh` writes `docs/demo/render/public/slices/` and `docs/demo/render/public/capture.json`. Both are committed, so the cut renders from a fresh clone without re-capturing. The capture pins the pairing QR to loopback and uses `adb reverse`, so the emulator reaches the host without depending on the LAN address.

Preview or render from `docs/demo/render` (the render lands at `docs/demo/harold.mp4`, which is committed):

```sh
bun install
bun run dev
bunx remotion render src/index.ts HaroldDemo ../harold.mp4
```

## How it works

The staged clip (`assets/virtual-qr-code-webcam.mp4`) shows a laptop running `harold pair`. `compose_camera.mjs` tracks the QR panel on the laptop screen per frame and pastes the real pairing QR over it, then rotates the clip 90 degrees counter-clockwise and cover-crops it onto a 1280x960 canvas. That canvas is what the emulator's videofile camera streams at: it stretches any file onto its 4:3 streams (preview 1280x960, analysis 640x480), so anything else arrives squashed and unscannable. The emulator shows frames rotated 90 degrees clockwise (`hw.camera.back.orientation=90`), which the counter-clockwise authoring cancels. A 120 second freeze tail keeps the QR on screen after the 7 second clip ends. The emulator silently fails to open a videofile whose path is too long, so `capture.sh` copies the composed feed to a short `/tmp/opencode` path before boot.

The capture owns the daemon runtime. It stops any Harold from the real or demo data dir, then recreates `~/.harold-demo` from the real `~/.harold/harold.db` (agents and workspaces kept, devices and pairing codes cleared). `settings.yml` pins `bindHost: 127.0.0.1`, `bindPort: 3847`, and `advertisedUrl: http://127.0.0.1:3847`. The emulator's `adb reverse tcp:3847 tcp:3847` makes that loopback endpoint reachable. This keeps a LAN advertised URL or a daemon on another port out of the demo.

`capture.sh` boots the emulator with `-wipe-data -feature VideoPlayback -camera-back videofile:docs/demo/work/capture/camera-live.mp4`. The wipe restores the initial userdata image, so every run starts factory-clean: no prior photos, screenshots, downloads, recordings, installed app, or permission grants. Because the wipe also resets display mode and can make the first launcher start slow, the capture enables dark mode (`cmd uimode night yes`) and hides system crash/ANR dialogs before launching the app. It builds and installs the debug app from this checkout, then `push_assets.sh` extracts `assets/cats.zip` to `work/capture/photos`, pushes its 17 photos to `/sdcard/DCIM/Camera`, and pushes `assets/cat-diary.txt` to `/sdcard/Download`. A MediaStore rescan makes the photos visible to the Android photo picker and gallery, and the document visible to the file attachment picker. The media cleanup is the wipe; the asset step only deploys the demo files. The first camera open after boot is black for 15-25 seconds. The recorded scanner opens once and `scanner_open` captures that startup; Remotion trims it. Pairing codes are single-use, so there is no separate warm scan. The composed feed keeps the live QR out of the first 40 seconds, so the scanner may show the staged clip before the QR appears; `scan_wait` waits for the pairing.

The emulator microphone is fed by its built-in WAV audio driver. `capture.sh` converts `assets/voice-input.wav` to the driver's 44.1 kHz stereo S16 format, adds a short lead-in and a long silence tail, and compiles `audio-env-shim.c`. The emulator wrapper strips `QEMU_*` variables, so the shim restores the WAV driver selection inside QEMU. The windowed emulator starts with the host microphone gated off even with `-allow-host-audio`, so before the voice scene `drive_phone.py` sends `avd hostmicon` and `avd rewindaudio` to the emulator console. Vosk then transcribes the speech exactly as it would a real microphone. The app preloads the Vosk model at process start, so the capture does not open a separate warm-up microphone stream.

The scanner then sits on the frozen feed until pairing lands. The walk is recorded as named slices: `drive_phone.py` starts one screenrecord file per action in `/data/local/tmp` (outside the media roots the app's pickers index), from the tap through the wait for the UI to settle. Idle screens, scanner waits, session loads, spinners, and reply streams are all their own slices too. `build_capture.py` re-encodes each slice into `public/slices/`, attaches the taps that landed inside it, and writes `capture.json`. There is no stitched video, so changing the pace is a Remotion edit, not a re-capture. A short static scene that finalizes as one frame is marked `still` and held for the wall time it was recorded.

`capture.json` lists the slices with their file, duration, size, still flag, and taps. `docs/demo/render/src/timeline.ts` is the edit: it maps slice names to render starts, rates, holds, captions, and typing sounds. The simulated terminal follows the same edit, printing `Device paired.` when the paired slice starts. A short title card opens the cut and a four second install card closes it.

The QR in the terminal is the real pairing QR from the recorded run. `qr-rows.ts` holds the CLI's half-block output and `qr-matrix.ts` decodes it into a module grid, so the video draws squares instead of relying on font glyphs. The code has long expired, so scanning it does nothing.

`.opencode/skills/compose-demo/SKILL.md` is the runbook: what to verify after each stage and how to debug when a stage fails.
