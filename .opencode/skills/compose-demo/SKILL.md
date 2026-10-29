---
name: compose-demo
description: Run and debug the Harold phone demo capture pipeline (staged clip → emulator camera feed → pairing on camera → slices → Remotion). Use when capturing or re-capturing docs/demo/render/public/slices/, composing the camera feed with a live pairing QR, verifying the emulator camera pipeline, or updating the Remotion demo after a capture.
---

# Compose the demo capture

The pipeline scripts are deterministic: they do the work, you supervise.
Do not reimplement their steps inline — run them, then verify each stage by
capturing frames. If a stage fails, fix the script, not the run.

## The deterministic pieces

All under `docs/demo/capture/` unless noted:

- `capture.sh` — the whole run. It stops only the two demo instances, recreates
  `~/.harold-demo-3847` and `~/.harold-demo-3848`, keeps the demo project folder
  roots, re-registers the workspaces, enables `cursor` + `pi-acp` on instance 1
  and `opencode` on instance 2, seeds the OpenCode and pi sessions, starts both
  source daemons with `bun run dev` on 127.0.0.1:3847 and :3848, issues
  instance 1's QR, regenerates the Remotion pairing code and QR fixtures,
  composes the feed, converts `assets/voice-input.wav` for the WAV audio
  driver, compiles `audio-env-shim.c`, boots the emulator through a transient
  systemd user unit with `-wipe-data`, pushes assets, builds and installs the
  app, records one named slice per action while `drive_phone.py` walks both
  pairings, session history, workspaces, new session, model/mode/effort,
  prompt/attachments, text chat, and voice chat, pulls every manifest slice
  with ADB stdin isolated, and builds `docs/demo/render/public/capture.json`.
  It derives `apps/android/local.properties` from the SDK before the install.
  Run it from the repo root: `bash docs/demo/capture/capture.sh`.
- `seed_sessions.sh` — purges the OpenCode history in the demo yuekbox
  workspace, then creates the five fixed sessions with
  `opencode run --title`. It declares the titles newest first, creates them
  oldest first, and pins their stored update times in display order. The main
  checkout history is untouched unless `SEED_PURGE=1` is explicit.
- `seed_work_session.sh` — removes old pi sessions for the Work workspace and
  the capture scratch, then creates one pi ACP session titled
  `Cat food budget`.
- `compose_camera.mjs <source.mp4> [qr.png] <out.mp4>` — builds the camera
  feed: optional live-QR paste over the staged panel (per-frame connected-
  component tracking), then a geometry pass (rotate 90° CCW, cover-crop to
  1280x960), then a 120s freeze tail. With a QR arg the source must be the
  1920x1080 staged clip; without one, any aspect works.
- `write_pairing_fixtures.mjs <pair-json> <render-src>` — regenerates
  `qr-rows.ts` and the `CODE`/`EXPIRES` values in `terminal-data.ts` from the
  instance 1 pair JSON, so the drawn terminal QR matches the camera feed.
- `drive_phone.py` — the UI driver. It pairs the camera Harold and confirms
  `Work`, pairs the second Harold manually as `Couch`, opens the full Sessions
  screen, opens Workspaces and the Add workspace browser, starts a session on
  Work/Cursor then Couch/OpenCode, changes the model, mode, and effort, shows
  slash commands, sends a prompt with photo and file attachments, then runs
  voice chat. It records one screenrecord slice per
  action, verifies the remote file exists before continuing, waits for
  screenrecord to finalize on stop, writes `slices.json`, and marks taps plus
  step names in `marks.log`. `--warm` is a manual camera warm-up; the capture
  does not use it.
- `audio-env-shim.c` — sets `QEMU_AUDIO_DRV=wav` and the WAV input/output
  paths inside QEMU, because the emulator wrapper strips `QEMU_*` variables.
  `capture.sh` compiles it to `/tmp/opencode/harold-audio-env-shim.so`.
- `build_capture.py` — reads the slice manifest and tap marks, re-encodes each
  slice into `docs/demo/render/public/slices/`, and writes `capture.json`
  with each slice's file, duration, size, `still` flag, and taps. A short
  static slice that finalizes as one frame is marked `still` and held for its
  recorded wall time.
- `push_assets.sh` — extracts `assets/cats.zip` into the capture work
  directory, pushes its 17 photos to `/sdcard/DCIM/Camera`, and pushes
  `cat-diary.txt` to `/sdcard/Download`, then rescans MediaStore so the photo
  picker, file picker, and gallery see the demo files. The emulator was wiped
  at boot, so there is no prior media to sweep.

## Spotlight beats

`docs/demo/render/src/timeline.ts` supports a `spotlight` on a step. The phone
stays on one side at a 2x close-up, the terminal exits, and `SpotlightView`
lands centered display copy on the other side. Add `celebrate` to the same
step for the [POP] squash and shake. Add `confetti: true` for the full-stage
shower. The first pairing achievement is the reference. The first pairing also
holds a 2x top-two-thirds crop from the Pair
tap through the scanner and name entry, then pans up after the confirm so the
landing screen is visible. Keep `phoneCenterX` on the right through the
spotlight hold, then move it back to center before the next walk step. Do not
replace a spotlight with a bottom `caption`.

## Hardware facts that must not drift

- Emulator: `~/android/emulator/emulator` (36.5+, has videofile camera),
  AVD `agent_server_api34`, flags `-wipe-data -allow-host-audio
-gpu swiftshader_indirect -no-snapshot -feature VideoPlayback
-camera-back videofile:/abs/path.mp4`. `-wipe-data` is the asset cleanup:
  it resets installed apps, settings, permissions, and emulated storage.
- The wipe also resets the emulator to light mode. `capture.sh` runs
  `cmd uimode night yes` after boot and verifies `Night mode: yes` before the
  app launch; the demo must stay dark. It also sets
  `hide_error_dialogs=1` because the slow first boot can ANR Pixel Launcher
  and leave a system dialog over the pair screen.
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
- First camera open after boot is black ~15-25s; later opens ~2s. The capture
  records that startup in `scanner_open` and Remotion trims it. Pairing codes
  are single-use (`pairing_code_claimed` on re-claim), so do not run a warm
  scan against the live QR. The composed feed keeps the live QR out of the
  first 40 seconds; the recorded scanner may reach it, and that is the scan.
- The demo daemons use `~/.harold-demo-3847` and `~/.harold-demo-3848`, both
  with `bindHost=127.0.0.1` and ports 3847/3848. The real `~/.harold` daemon is
  never stopped. Both `adb reverse` mappings must be set after every boot.
  Instance 1's code is issued before composing. Instance 2's code is issued by
  the driver immediately before manual pairing. Pairing codes live 10 minutes.
- Launch the capture emulator through a transient systemd user unit
  (`harold-capture-agent_server_api34`) so QEMU survives the agent shell.
  Direct `nohup` dies when the command ends. Stop and `reset-failed` the unit
  before boot. `capture.sh` waits for `adb get-state` and retries setup ADB
  commands.
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
3. **Pairing lands.** After tapping Pair and up to ~90s, the identity screen
   must show the `Violet` color option and the Name field. Enter `Work`,
   dismiss the keyboard, tap Pair, then `uiautomator dump` must contain a
   `Select session:` content description. `~/.harold-demo-3847/harold.log` must
   show the claim. No error UI means the analyzer never decoded. Go back to
   step 2 and measure.
4. **Full capture.** Run `capture.sh`. It exits non-zero if the driver
   fails. `docs/demo/work/capture/capture.log` and `driver.log` hold the
   progress. `capture.log` must show `daemon_start_instance1`,
   `daemon_start_instance2`, `daemons_ready`, `sessions_seeded`,
   `pairing_fixtures_updated`, `android_installed`, `slices_pulled`, and
   `build_capture`. `android-build.log` must show `BUILD SUCCESSFUL`. The seed
   log must show
   `seeded sessions use {"id":"deepseek-flash","providerID":"deepseek"}`.
   `capture.json` must list 58 slices:
   `pair_idle`, `pair_tap`, `scanner_open`, `scan_wait`, `first_name`,
   `first_confirm`, `paired`, `pair_another_open`, `pair_another_manual`,
   `pair_another_details`, `pair_another_claim`, `pair_another_name`,
   `pair_another_confirm`, `pair_another_done`, `session_menu_open`,
   `session_see_all`, `session_pick`, `session_chat`, `workspaces_open`,
   `add_workspace_open`, `session_menu_reopen`,
   `new_session`, `workspace_open_work`, `workspace_pick_work`,
   `agent_open_work`, `agent_pick_work`, `workspace_open_couch`,
   `workspace_pick_couch`, `agent_open_couch`, `agent_pick_couch`, `continue`,
   `session_create_wait`, `model_open`, `model_search`, `model_pick`,
   `mode_plan`, `mode_build`, `effort_1..3`, `slash_open`, `slash_close`,
   `prompt_focus`, `prompt_type`, `photo_open`, `photo_pick`, `photo_add`,
   `file_open`, `file_pick`, `send`, `reply_wait`, `reply`, `voice_open`,
   `voice_expand`, `voice_transcript`, `voice_send`, `voice_reply_wait`, and
   `voice_reply`. Every listed slice must have an mp4 in
   `docs/demo/render/public/slices/`. The full Sessions screen must show the
   five OpenCode titles ("Cat Therapist near me", "Does KGB use cats?", "Why
   does my cat hate me?", "Cat treat safe for humans?", and "Russian for
   dummies") plus the Work pi session "Cat food budget". The first row is
   "Cat Therapist near me" under Couch. `/sdcard/DCIM/Camera` must hold the
   zip's 17 photos, `/sdcard/Download` must hold `cat-diary.txt`, and the
   assets step must report 18 pushed onto the wiped emulator.
5. **Voice landed.** `driver.log` must print a non-empty
   `voice transcript:` line, and the last frame of the `voice_reply` slice
   must show the completed reply (no "Replying" label and no stop button).
   The inline rail must show `Mute voice input`. Do not wait for
   `Start speaking…`; the transcript can replace it before the first poll.
   The driver waits for the transcript to stay stable for one second.
   If the transcript is empty, confirm `avd hostmicon` and `avd rewindaudio`
   were sent, the QEMU process has `QEMU_AUDIO_DRV=wav` and holds
   `/tmp/opencode/harold-qemu-in.wav` open, and no voice warm-up fixture ran.
6. **Remotion is in sync.** Update `PAIR_STEPS`/`WALK_STEPS` to the 58-slice
   set before rendering. Do not render until that edit is done.
   `docs/demo/render` reads `public/capture.json` at build time
   (`calculateMetadata`); `src/timeline.ts` holds the slice edit in
   `PAIR_STEPS`/`WALK_STEPS`. After a fresh capture, check the slice names and
   durations, then render a spot-check still:
   `bun x remotion still HaroldDemo ../work/render/check.png
--frame=<mid-walkthrough>` from `docs/demo/render`. Commit
   `docs/demo/render/public/slices/` + `capture.json` only from a fully
   successful run — never a failed one. Then re-render the committed cut so
   it shows the new capture: run `bun run render` from `docs/demo/render`. It
   renders `../work/render/harold-master.mp4`, then compresses it to
   `../harold.mp4` (H.264 CRF 26, 96 kbps AAC, faststart) with `ffmpeg`, which
   must be on `PATH`.

## Troubleshooting map

- Session menu shows unrelated titles or duplicate demo titles → run
  `bash docs/demo/capture/seed_sessions.sh`; it purges the demo yuekbox
  workspace before creating the five fixed sessions. The full Sessions screen
  can still show sessions from other workspaces because the agents keep global
  history. The first row must be "Cat Therapist near me" under Couch.
- Composer shows "Agent is not enabled", the model pick rolls back, or the
  thinking chip is missing → a session-scoped call used the active paired
  Harold instead of the selected session's `serverOrigin`. Config PUTs must go
  to the session's Harold, for example 3848 for Couch/OpenCode. Check
  `ChatViewModel` uses `selectedOrPairedOrigin()` for config, attachments,
  auth, and title pulls.
- Emulator dies when the agent command ends → launch it through the transient
  systemd user unit. Direct `nohup` does not survive the shell.
- `adb pull` stops after one slice → ADB consumed the manifest stdin. Redirect
  ADB stdin with `</dev/null` inside the pull loop.
- `pair_tap` is missing or much longer than its action window → screenrecord
  failed to start or failed to stop. The driver verifies the remote file and
  waits for `pidof screenrecord`; rerun. A long stale file can be trimmed to its
  action window before `build_capture.py`.
- Scanner open but never pairs, no error UI → feed geometry or decode;
  re-run step 1's jsQR check at 640x480.
- Driver dies on `not found text='Pair'` → the app was not on the home
  screen. Check `android_installed` and the app launch; the capture launches
  the app once and gives it four seconds.
- Scanner shows "Pairing code has already been claimed" → a previous scan
  or manual warm scan already claimed the code. Issue a fresh code and
  rerun; do not run a warm scan against the live QR.
- Scanner retries and the emulator wedges to a black screen → a failing
  claim loops decode→error→reopen. Use a fresh code and confirm `adb reverse`
  is set for the recorded run.
- Black viewfinder at scan time → first-open warmup or the camera feed was
  never opened. `scanner_open` records the warmup; check
  `lsof -p <qemu> | grep harold-camera`; if QEMU does not hold the file, the
  `videofile:` path is too long. Use the short
  `/tmp/opencode/harold-camera-live.mp4` copy. The capture no longer warms
  separately, so there is no `camera_warm` log.
- Voice scene opens, mic shows listening, but no transcript → check
  `avd hostmicon` and `avd rewindaudio` were sent, the QEMU process has
  `QEMU_AUDIO_DRV=wav` and holds `/tmp/opencode/harold-qemu-in.wav` open,
  and no voice warm-up fixture ran. The windowed emulator keeps the host
  mic gated off until `hostmicon`.
- App sits in reconnect retries, or the composer chips say `provider/model`
  and `mode` → the installed app and source server are different revisions,
  or the app is not reaching the demo daemon. Check `capture.log` for
  `android_installed` and `android-build.log` for `BUILD SUCCESSFUL`. Check
  `~/.harold-demo-3847/settings.yml` and `~/.harold-demo-3848/settings.yml`,
  `adb reverse --list` for both ports, and that the demo daemons, not the real
  one, are running. Then rerun the capture. The script builds and installs the
  debug app from this checkout before pairing.
- Voice reply still streaming at the end of the `voice_reply` slice → the
  driver's completion check needs three quiet polls; if it returns early,
  inspect `wait_for_agent_turn` and the app's "Replying"/`Cancel run` signals.
- `build_capture.py` reports a missing slice or the render throws
  `capture.json is missing slice ...` → the driver did not record that action.
  Check `driver.log` and the manifest, then re-run the capture.
- Pair code expired (~10 min) → instance 1's code is issued before composing,
  instance 2's by the driver just before manual pairing. Rerun the full capture
  instead of hand-patching.
