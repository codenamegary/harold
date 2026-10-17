---
name: compose-demo
description: Run and debug the Harold phone demo capture pipeline (staged clip → emulator camera feed → pairing on camera → phone.mp4 → Remotion). Use when capturing or re-capturing docs/demo/render/public/phone.mp4, composing the camera feed with a live pairing QR, verifying the emulator camera pipeline, or updating the Remotion demo after a capture.
---

# Compose the demo capture

The pipeline scripts are deterministic: they do the work, you supervise.
Do not reimplement their steps inline — run them, then verify each stage by
capturing frames. If a stage fails, fix the script, not the run.

## The deterministic pieces

All under `docs/demo/capture/` unless noted:

- `capture.sh` — the whole run: restarts the daemon, seeds OpenCode session
  history, issues a pairing code, composes the feed, converts
  `assets/voice-input.wav` for the emulator's WAV audio driver, compiles
  `audio-env-shim.c`, boots the emulator, seeds its gallery and Downloads from
  `assets/`, warms the camera, resets the app, screen-records while
  `drive_phone.py` walks pairing → session history → new session →
  model/mode/effort → prompt/attachments → text chat → voice chat, pulls
  `docs/demo/render/public/phone.mp4`, and writes
  `docs/demo/render/public/capture.json`. Run it from the repo root:
  `bash docs/demo/capture/capture.sh`.
- `seed_sessions.sh` — creates the five OpenCode sessions the phone's session
  menu shows, with `opencode run --title`. It declares the titles newest
  first, creates them oldest first, and skips the work when the five newest
  sessions already match. Sessions are created in the main checkout so they
  survive worktree removal.
- `compose_camera.mjs <source.mp4> [qr.png] <out.mp4>` — builds the camera
  feed: optional live-QR paste over the staged panel (per-frame connected-
  component tracking), then a geometry pass (rotate 90° CCW, cover-crop to
  1280x960), then a 120s freeze tail. With a QR arg the source must be the
  1920x1080 staged clip; without one, any aspect works.
- `drive_phone.py` — the UI driver. Marks every step to
  `docs/demo/work/capture/marks.log`
  (`driver_start`, `tap_pair`, `paired_chat_visible`, `session_menu_open`,
  `session_history_selected`, `tap_new_session`, `config_visible`,
  `mode_plan`, `effort_set`, `prompt_typed`, `photo_attached`,
  `file_attached`, `reply_visible`, `voice_play_start`, `voice_transcript`,
  `tap_voice_send`, `voice_reply_visible`, plus a `rec_start_NNN`/`rec_end_NNN`
  pair per recorded segment). `--warm` opens and closes
  the scanner once.
- `audio-env-shim.c` — sets `QEMU_AUDIO_DRV=wav` and the WAV input/output
  paths inside QEMU, because the emulator wrapper strips `QEMU_*` variables.
  `capture.sh` compiles it to `/tmp/opencode/harold-audio-env-shim.so`.
- `stitch_segments.py` — pairs up the `rec_start_NNN`/`rec_end_NNN` marks,
  concatenates the per-segment recordings (each anchored to its `rec_end`),
  re-encodes `docs/demo/render/public/phone.mp4`, and rewrites
  `capture.json` onto the stitched timeline. Marks fired while recording was
  off clamp to the start of the next segment; the removed wall ranges are
  kept under `cuts`.
- `push_assets.sh` — extracts `assets/cats.zip` into the capture work
  directory and pushes only photos missing from `/sdcard/DCIM/Camera`
  (same name and size are skipped). It also pushes `assets/cat-diary.txt`
  to `/sdcard/Download` the same way, then rescans MediaStore so the photo
  and file pickers see everything. Safe to rerun; it does not make
  duplicate copies.

## Hardware facts that must not drift

- Emulator: `~/android/emulator/emulator` (36.5+, has videofile camera),
  AVD `agent_server_api34`, flags `-allow-host-audio -gpu swiftshader_indirect
-no-snapshot -feature VideoPlayback -camera-back videofile:/abs/path.mp4`.
  Bare absolute path; `file=` prefix fails. Feed must have no audio track.
- The videofile camera silently fails to open when its path is too long. A
  path under this worktree (~107 chars) is long enough to fail; copy the
  composed feed to `/tmp/opencode/harold-camera-live.mp4` before boot. The
  QEMU process must hold that file open (`lsof -p <qemu> | grep
  harold-camera`), otherwise the preview is black.
- The microphone is the emulator's built-in WAV driver. `capture.sh` writes
  `/tmp/opencode/harold-qemu-in.wav` at 44.1 kHz stereo S16 with a 1.5s
  lead-in and a 30s silence tail, then boots with
  `LD_PRELOAD=/tmp/opencode/harold-audio-env-shim.so
  HAROLD_WAV_IN=... HAROLD_WAV_OUT=... -allow-host-audio`. The wrapper
  strips `QEMU_*`, so the shim sets `QEMU_AUDIO_DRV=wav`,
  `QEMU_WAV_IN_PATH`, and `QEMU_WAV_PATH` inside QEMU.
- The windowed emulator starts with the host microphone gated off even with
  `-allow-host-audio`. Before the voice scene, send `avd hostmicon` and then
  `avd rewindaudio` on the emulator console (`auth` with
  `~/.emulator_console_auth_token` first). Without `hostmicon`, Vosk sees
  silence and the transcript times out.
- Do not use a throwaway microphone warm-up (the debug voice fixture).
  Force-stopping it can leave the WAV input unable to feed the next stream.
  The app preloads the Vosk model when its process starts, so no warm-up is
  needed.
- Camera streams are 4:3 (preview 1280x960, analysis 640x480). The videofile
  is stretched onto whatever stream size is requested, so any non-4:3 file
  is squashed (a 9:16 file renders ~2.4x anisotropic — QRs stop decoding).
- `hw.camera.back.orientation=90`: the app rotates preview 90° clockwise, so
  the file is authored rotated 90° counter-clockwise (compose does this).
- First camera open after boot is black ~15-25s; later opens ~2s. The warm
  pass absorbs this. Its scan must not pair: pairing codes are single-use
  (`pairing_code_claimed` on re-claim), and a failing claim puts the app
  into a retry loop that hammers the camera until the emulator wedges. The
  feed solves both: compose gates the live QR to after 40s of feed time, so
  the 25s warm pass scans inert footage (the staged clip's decorative QR
  never decodes), and the recorded scan reaches the QR region and pairs on
  camera.
- Pairing codes live 10 minutes; capture.sh issues one right before
  composing. `adb reverse tcp:3847 tcp:3847` must be set after every boot.
- Kill the emulator with bracketed patterns (`pkill -f '[q]emu-system'`).

## The verification loop

Verify in this order; each step gates the next.

1. **Feed decodes offline, behind the gate.** After composing, extract
   frames and read them
   (`ffmpeg -ss 10 -i docs/demo/work/capture/camera-live.mp4 -frames:v 1
f.png`): before the 40s gate the clip is inert — jsQR must find nothing.
   After it (`-ss 50`, and the tail at `-ss 100`), the live QR is pasted
   over the panel, upright-in-file (the scene lies on its side), and jsQR
   at 640x480 must return the exact `qrUri` from
   `harold pair --no-wait --json`. Frame 0 of the clip is a blurry close-up;
   that is expected.
2. **Camera shows the feed.** Boot, launch the app, tap Pair, wait out the
   warmup, `adb exec-out screencap -p`. The viewfinder must show the scene
   upright, filling the frame, undistorted. Measure if unsure: flood-fill
   the QR's white quiet zone from a seed and compare the panel's aspect to
   the file frame's (0.999 = perfect; 0.44 = the old squash).
3. **Pairing lands.** After tapping Pair and ~45s: `uiautomator dump` must
   contain a `Select session:` content description, and
   `~/.harold/harold.log` must show requests from the emulator. No error UI
   means the analyzer never decoded — go back to step 2 and measure.
4. **Full capture.** Run `capture.sh`. It exits non-zero if the driver
   fails; `docs/demo/work/capture/capture.log` and `driver.log` hold the marks.
   `capture.json` must contain the full event set — session history,
   attachments, text reply, `voice_play_start`, `voice_transcript`,
   `tap_voice_send`, `voice_reply_visible` — and the stitch must have fired:
   `durationSec` is far shorter than wall time (~100-120s of video from
   ~180s of wall clock; `rawEvents` holds the wall-clock marks, `cuts` the
   unrecorded ranges, and every paired `rec_start_NNN`/`rec_end_NNN` has a
   pulled `harold-demo-NNN.mp4` in `work/capture/segments/`).
   `capture.log` must show `sessions_seeded` and `assets_ready`, and the
   session menu must show exactly "Cat Therapist near me", "Does KGB use
   cats?", "Why does my cat hate me?", "Cat treat safe for humans?", and
   "Russian for dummies", newest first. `/sdcard/DCIM/Camera` must hold the
   zip's 17 photos, `/sdcard/Download` must hold `cat-diary.txt`, and a second
   `push_assets.sh` run reports 0 pushed.
5. **Voice landed.** `driver.log` must print a non-empty
   `voice transcript:` line, and the last frame of `phone.mp4` must show the
   completed reply (no "Replying" label and no stop button). If the
   transcript is empty, confirm `avd hostmicon` and `avd rewindaudio` were
   sent, the QEMU process has `QEMU_AUDIO_DRV=wav` and holds
   `/tmp/opencode/harold-qemu-in.wav` open, and no voice warm-up fixture ran.
6. **Remotion is in sync.** `docs/demo/render` reads `public/capture.json` at build
   time (`calculateMetadata`); `src/timeline.ts` holds the stage choreography
   and the per-tap positions, which are tuned to a specific capture. After a
   fresh capture, re-check the `tapSpecs` and caption times against the new
   marks and frames. Validate: `durationSec` is sane, and render a
   spot-check still: `bun x remotion still HaroldDemo ../work/render/check.png
--frame=<mid-walkthrough>` from `docs/demo/render`. Commit
   `docs/demo/render/public/phone.mp4` + `capture.json` only from a
   fully successful run — never a failed one. Then re-render the committed
   cut so it shows the new capture:
   `bun x remotion render src/index.ts HaroldDemo ../harold.mp4` from
   `docs/demo/render`.

## Troubleshooting map

- Session menu shows unrelated titles or duplicate demo titles → run
  `bash docs/demo/capture/seed_sessions.sh` and read its stderr; it checks the
  global OpenCode session list, reseeds when the five newest do not match, and
  leaves the per-run prompt output in `work/capture/session-seed.log`.
- Scanner open but never pairs, no error UI → feed geometry or decode;
  re-run step 1's jsQR check at 640x480.
- Driver dies on `not found text='Pair'` → the warm pass paired; the QR
  time gate (40s) is missing from the compose.
- Scanner shows "Pairing code has already been claimed" → the warm scan
  reached the QR region; the gate must exceed the warm wall clock (25s).
- Scanner retries and the emulator wedges to a black screen → a failing
  claim loops decode→error→reopen; never let the warm scan hit a live or
  stale-but-valid-looking QR.
- Black viewfinder at scan time → first-open warmup or the camera feed was
  never opened. Check `lsof -p <qemu> | grep harold-camera`; if QEMU does
  not hold the file, the `videofile:` path is too long. Use the short
  `/tmp/opencode/harold-camera-live.mp4` copy. The warm pass handles the
  first-open warmup, don't record before `camera_warm`.
- Voice scene opens, mic shows listening, but no transcript → check
  `avd hostmicon` and `avd rewindaudio` were sent, the QEMU process has
  `QEMU_AUDIO_DRV=wav` and holds `/tmp/opencode/harold-qemu-in.wav` open,
  and no voice warm-up fixture ran. The windowed emulator keeps the host
  mic gated off until `hostmicon`.
- Voice reply still streaming at the end of `phone.mp4` → the driver's
  completion check needs three quiet polls; if it returns early, inspect
  `wait_for_agent_turn` and the app's "Replying"/`Cancel run` signals.
- Pair code expired (~10 min) → reissue and recompose; capture.sh does both
  in order, so prefer a fresh full run over hand-patching.
