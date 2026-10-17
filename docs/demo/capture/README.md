# Demo capture

`capture.sh` records the phone demo. It starts Harold, issues a pairing code, bakes the live QR into a staged clip, plays that clip through the emulator camera, and records the app pairing on camera in segments (recording pauses across the pure waits). Remotion plays that recording in a phone frame next to a simulated terminal that runs `harold start` and `harold pair`, QR included.

| File                 | Role                                                                             |
| -------------------- | -------------------------------------------------------------------------------- |
| `capture.sh`         | Start the daemon, pair, compose the feed, boot the emulator, pull segments, stitch |
| `compose_camera.mjs` | Overlay the live QR on the tracked panel after a 40s gate, crop to 1280x960      |
| `drive_phone.py`     | Walk the app pair → session history → new session → model/mode/effort → attachments → text and voice chat, recording scene by scene |
| `stitch_segments.py` | Concatenate the recorded segments into phone.mp4 and remap the marks onto the stitched timeline |
| `push_assets.sh`     | Install missing demo photos and `cat-diary.txt` on the emulator                  |
| `audio-env-shim.c`   | Restore the WAV audio driver variables that the emulator wrapper strips          |

`assets/virtual-qr-code-webcam.mp4` is the staged clip the camera feed is composed from. `assets/cats.zip` holds the demo photos that `capture.sh` installs in the camera roll, and `assets/cat-diary.txt` is the document it installs in Downloads for file attachments. `assets/voice-input.wav` is the speech the emulator's microphone hears during the voice scene.

## What is kept and what is not

- **Kept, committed:** everything in this directory plus the recordings the run produces: `docs/demo/render/public/phone.mp4` and `docs/demo/render/public/capture.json`.
- **Not kept:** everything else the run generates (composed feed, logs, raw recording, pairing code, screenshots) lands in `docs/demo/work/capture/` and is never committed. Delete that directory any time.

## How to run

Needs the 36.5+ emulator at `~/android/emulator` (set `EMULATOR` to override; older builds have no videofile camera), a C compiler for the audio shim, and the debug app installed. `capture.sh` boots and stops the emulator itself, so nothing has to be running first.

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

The staged clip (`assets/virtual-qr-code-webcam.mp4`) shows a laptop running `harold pair`. `compose_camera.mjs` tracks the QR panel on the laptop screen per frame and pastes the real pairing QR over it, then rotates the clip 90 degrees counter-clockwise and cover-crops it onto a 1280x960 canvas. That canvas is what the emulator's videofile camera streams at: it stretches any file onto its 4:3 streams (preview 1280x960, analysis 640x480), so anything else arrives squashed and unscannable. The emulator shows frames rotated 90 degrees clockwise (`hw.camera.back.orientation=90`), which the counter-clockwise authoring cancels. A 120 second freeze tail keeps the QR on screen after the 7 second clip ends. The emulator silently fails to open a videofile whose path is too long, so `capture.sh` copies the composed feed to a short `/tmp/opencode` path before boot.

`capture.sh` boots the emulator with `-feature VideoPlayback -camera-back videofile:docs/demo/work/capture/camera-live.mp4`. Once it has booted, `push_assets.sh` extracts `assets/cats.zip` to `work/capture/photos`, pushes every photo the emulator does not already have to `/sdcard/DCIM/Camera`, and pushes `assets/cat-diary.txt` to `/sdcard/Download`. It compares file name and size, so rerunning the capture does not stack up duplicate copies. A MediaStore rescan makes the photos visible to the Android photo picker and gallery, and the document visible to the file attachment picker. The first camera open after boot is black for 15-25 seconds, so the driver opens the scanner once (`--warm`) before recording. That warm scan must not pair: pairing codes are single-use, and a failing claim puts the app into a retry loop that wedges the emulator. The composed feed keeps the live QR out of the first 40 seconds. The warm pass scans inert footage and finds nothing; the recorded scan reaches the QR region and pairs on camera with a warm camera.

The emulator microphone is fed by its built-in WAV audio driver. `capture.sh` converts `assets/voice-input.wav` to the driver's 44.1 kHz stereo S16 format, adds a short lead-in and a long silence tail, and compiles `audio-env-shim.c`. The emulator wrapper strips `QEMU_*` variables, so the shim restores the WAV driver selection inside QEMU. The windowed emulator starts with the host microphone gated off even with `-allow-host-audio`, so before the voice scene `drive_phone.py` sends `avd hostmicon` and `avd rewindaudio` to the emulator console. Vosk then transcribes the speech exactly as it would a real microphone. The app preloads the Vosk model at process start, so the capture does not open a separate warm-up microphone stream.

The scanner then sits on the frozen feed until pairing lands. Nothing like that stays in the recording: the walk is captured in segments. `drive_phone.py` runs screenrecord only while something is happening on screen - `rec_start`/`rec_stop` bracket every scene, and the pure waits (the scanner decoding the QR, sessions loading, the agent streaming a reply, the session-creation spinner) happen with recording off. `stitch_segments.py` pairs up the `rec_start_NNN`/`rec_end_NNN` marks, concatenates the segments (anchoring each to its `rec_end`, since screenrecord finalizes within a fraction of a second of SIGINT), re-encodes to `phone.mp4`, and rewrites `capture.json` onto the stitched timeline. Marks fired in an unrecorded gap clamp to the start of the next segment, and the removed wall ranges are kept in `capture.json` under `cuts`.

`capture.json` stores the video size and the UI marks, mapped onto the stitched timeline. The simulated terminal follows those marks: it prints `Device paired.` when the phone lands on the paired chat, and the stage layout (terminal zoom, phone position) is driven by the same clock (`timeline.ts`). A short title card opens the cut and a four second install card closes it.

The QR in the terminal is the real pairing QR from the recorded run. `qr-rows.ts` holds the CLI's half-block output and `qr-matrix.ts` decodes it into a module grid, so the video draws squares instead of relying on font glyphs. The code has long expired, so scanning it does nothing.

`.opencode/skills/compose-demo/SKILL.md` is the runbook: what to verify after each stage and how to debug when a stage fails.
