---
name: compose-demo
description: Run and debug the Harold phone demo capture pipeline (staged clip → emulator camera feed → pairing on camera → phone.mp4 → Remotion). Use when capturing or re-capturing docs/demo/public/phone.mp4, composing the camera feed with a live pairing QR, verifying the emulator camera pipeline, or updating the Remotion demo after a capture.
---

# Compose the demo capture

The pipeline scripts are deterministic: they do the work, you supervise.
Do not reimplement their steps inline — run them, then verify each stage by
capturing frames. If a stage fails, fix the script, not the run.

## The deterministic pieces

All under `docs/demo-pipeline/` unless noted:

- `capture.sh` — the whole run: restarts the daemon, issues a pairing code,
  composes the feed, boots the emulator, warms the camera, resets the app,
  screen-records while `drive_phone.py` walks the pairing flow, pulls
  `docs/demo/public/phone.mp4`, and writes `docs/demo/public/capture.json`.
  Run it from the repo root: `bash docs/demo-pipeline/capture.sh`.
- `compose_camera.mjs <source.mp4> [qr.png] <out.mp4>` — builds the camera
  feed: optional live-QR paste over the staged panel (per-frame connected-
  component tracking), then a geometry pass (rotate 90° CCW, cover-crop to
  1280x960), then a 120s freeze tail. With a QR arg the source must be the
  1920x1080 staged clip; without one, any aspect works.
- `drive_phone.py` — the UI driver. Marks every step to `marks.log`
  (`driver_start`, `tap_pair`, `paired_chat_visible`, `tap_new_session`,
  `config_visible`, `mode_plan`, `effort_set`, `prompt_typed`,
  `reply_visible`, ...). `--warm` opens and closes the scanner once.
- `cut_dead_space.py` — measures frame-to-frame motion, cuts the frozen
  scan stretch out of `phone.mp4`, remaps the marks to the shorter
  timeline, and stashes the raw recording as `phone-raw.mp4`. Idempotent:
  without the stash it defers to the cuts already in `capture.json`.

## Hardware facts that must not drift

- Emulator: `~/android/emulator/emulator` (36.5+, has videofile camera),
  AVD `agent_server_api34`, flags `-no-audio -gpu swiftshader_indirect
-no-snapshot -feature VideoPlayback -camera-back videofile:/abs/path.mp4`.
  Bare absolute path; `file=` prefix fails. Feed must have no audio track.
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
   frames and read them (`ffmpeg -ss 10 -i camera-live.mp4 -frames:v 1
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
   contain "New session", and `~/.harold/harold.log` must show requests from
   the emulator. No error UI means the analyzer never decoded — go back to
   step 2 and measure.
4. **Full capture.** Run `capture.sh`. It exits non-zero if the driver
   fails; `docs/demo-pipeline/capture.log` and `driver.log` hold the marks.
   `capture.json` must contain the full event set — see step 5 — and the
   dead-space cut must have fired: `durationSec` shrinks by the removed
   stretch (a frozen scan cuts ~20s; `rawEvents` holds the unshifted marks
   and `cuts` the removed video ranges).
5. **Remotion is in sync.** `docs/demo` reads `public/capture.json` at build
   time (`calculateMetadata`) and `src/steps.ts` maps mark names to
   captions; `Demo.tsx` also zooms the phone over the dimmed terminal 8s
   after the pairing mark. Remotion needs no code change unless the
   driver's marks changed. Validate: every event in `steps.ts` exists in
   `capture.json`, `durationSec` is sane (~90s after the cut), and render a
   spot-check still: `bun x remotion still HaroldDemo out/check.png
--frame=<mid-walkthrough>` from `docs/demo`. Commit
   `public/phone.mp4` + `capture.json` only from a
   fully successful run — never a failed one.

## Troubleshooting map

- Scanner open but never pairs, no error UI → feed geometry or decode;
  re-run step 1's jsQR check at 640x480.
- Driver dies on `not found text='Pair'` → the warm pass paired; the QR
  time gate (40s) is missing from the compose.
- Scanner shows "Pairing code has already been claimed" → the warm scan
  reached the QR region; the gate must exceed the warm wall clock (25s).
- Scanner retries and the emulator wedges to a black screen → a failing
  claim loops decode→error→reopen; never let the warm scan hit a live or
  stale-but-valid-looking QR.
- Black viewfinder at scan time → first-open warmup; the warm pass handles
  it, don't record before `camera_warm`.
- Pair code expired (~10 min) → reissue and recompose; capture.sh does both
  in order, so prefer a fresh full run over hand-patching.
