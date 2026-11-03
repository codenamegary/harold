# Compose the demo capture

The pipeline scripts are deterministic: they do the work, you supervise.
Do not reimplement their steps inline — run them, then verify each stage by
capturing frames. If a stage fails, fix the script, not the run.

## The deterministic pieces

All under `docs/demo/capture/` unless noted:

- `capture.sh` — the whole run. It stops the demo instance, recreates
  `~/.harold-demo-3847`, keeps the demo project folder root, prepares the
  private `codenamegary/cat-screensaver` repo and its `feat/cat-mode` worktree,
  enables `opencode`, seeds the five cat sessions in the worktree, resets the
  worktree, starts one source daemon with `bun run dev` on 127.0.0.1:3847,
  issues its QR, regenerates the Remotion pairing code and QR fixtures,
  composes the feed, boots the emulator through a transient systemd user unit
  with `-wipe-data`, pushes assets, builds and installs the app, records one
  named slice per action while `drive_phone.py` pairs, starts a new session on
  the cat-screensaver worktree, plans and builds the feature, reviews changes
  and worktrees, and opens a draft PR, pulls every manifest slice with ADB
  stdin isolated, and builds `docs/demo/render/public/capture.json`. It derives
  `apps/android/local.properties` from the SDK before the install. Run it from
  the repo root: `bash docs/demo/capture/capture.sh`.
- `seed_sessions.sh` — purges the OpenCode history in the demo worktree, then
  creates the five fixed sessions with `opencode run --title`. It declares the
  titles newest first, creates them oldest first, and pins their stored update
  times in display order. The main checkout history is untouched unless
  `SEED_PURGE=1` is explicit. The seed prompts run with `--auto`, so
  `capture.sh` resets the worktree after seeding.
- `compose_camera.mjs <source.mp4> [qr.png] <out.mp4>` — builds the camera
  feed: optional live-QR paste over the staged panel (per-frame connected-
  component tracking), then a geometry pass (rotate 90° CCW, cover-crop to
  1280x960), then a 120s freeze tail. With a QR arg the source must be the
  1920x1080 staged clip; without one, any aspect works.
- `write_pairing_fixtures.mjs <pair-json> <render-src>` — regenerates
  `qr-rows.ts` and the `CODE`/`EXPIRES` values in `terminal-data.ts` from the
  instance 1 pair JSON, so the drawn terminal QR matches the camera feed.
- `drive_phone.py` — the UI driver. It pairs the camera Harold and confirms
  `Work`, opens the session menu, starts a new session on the
  `cat-screensaver` worktree, pins the model to `deepseek/deepseek-flash`,
  plans with `cat-mode.md` and a cat photo, answers the agent's one question,
  builds and commits, holds on usage, reviews the branch diff and worktrees,
  and asks for a draft PR. It records one screenrecord slice per action,
  verifies the remote file exists before continuing, waits for screenrecord to
  finalize on stop, writes `slices.json`, and marks taps plus step names in
  `marks.log`. `--warm` is a manual camera warm-up; the capture does not use
  it.
- `build_capture.py` — reads the slice manifest and tap marks, re-encodes each
  slice into `docs/demo/render/public/slices/`, and writes `capture.json`
  with each slice's file, duration, size, `still` flag, and taps. A short
  static slice that finalizes as one frame is marked `still` and held for its
  recorded wall time.
- `push_assets.sh` — extracts `assets/cats.zip` into the capture work
  directory, pushes its 17 photos to `/sdcard/DCIM/Camera`, and pushes
  `cat-mode.md` and `cat-diary.txt` to `/sdcard/Download`, then rescans
  MediaStore so the photo picker, file picker, and gallery see the demo files.
  The emulator was wiped at boot, so there is no prior media to sweep.
- `fixtures/cat-screensaver/` — the seed project copied to the private demo
  repo. `assets/cat-mode.md` is the spec attached on camera.

`assets/voice-input.wav`, `audio-env-shim.c`, and `seed_work_session.sh` are
unused by this cut. Do not wire them back in.

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
replace a spotlight with a bottom `caption`. The final story spotlight is
`From plan to PR`.

## Hardware facts that must not drift

- Emulator: `~/android/emulator/emulator` (36.5+, has videofile camera),
  AVD `agent_server_api34`, flags `-wipe-data -gpu swiftshader_indirect
-no-snapshot -feature VideoPlayback -camera-back videofile:/abs/path.mp4`.
  `-wipe-data` is the asset cleanup: it resets installed apps, settings,
  permissions, and emulated storage.
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
- The demo daemon uses `~/.harold-demo-3847` with `bindHost=127.0.0.1` and
  port 3847. The real `~/.harold` daemon is never stopped. The `adb reverse`
  mapping for port 3847 must be set after every boot. The code is issued
  before composing. Pairing codes live 10 minutes.
- Launch the capture emulator through a transient systemd user unit
  (`harold-capture-agent_server_api34`) so QEMU survives the agent shell.
  Direct `nohup` dies when the command ends. Stop and `reset-failed` the unit
  before boot. `capture.sh` waits for `adb get-state` and retries setup ADB
  commands.
- Kill the emulator with bracketed patterns (`pkill -f '[q]emu-system'`).
- No audio. Do not boot with `-allow-host-audio`, do not compile the audio
  shim, and do not send `avd hostmicon`.

## The verification loop

Verify in this order; each step gates the next.

1. **Feed decodes offline, behind the gate.** After composing, extract frames
   and read them
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
   progress. `capture.log` must show `demo_repo_prepare`,
   `demo_worktree_create`, `worktree_reset`, `daemon_start_instance1`,
   `daemons_ready`, `sessions_seeded`, `pairing_fixtures_updated`,
   `android_installed`, `slices_pulled`, and `build_capture`.
   `android-build.log` must show `BUILD SUCCESSFUL`. `capture.json` must list
   43 slices: `pair_idle`, `pair_tap`, `scanner_open`, `scan_wait`,
   `first_name`, `first_confirm`, `paired`, `session_menu_open`,
   `new_session`, `workspace_open`, `workspace_pick`, `continue`,
   `session_create_wait`, `mode_plan`, `prompt_focus`, `prompt_type`,
   `photo_open`, `photo_pick`, `photo_add`, `file_open`, `file_pick`, `send`,
   `plan_wait`, `plan_reply`, `elicitation_open`, `elicitation_pick`,
   `elicitation_submit`, `mode_build`, `build_prompt`, `build_send`,
   `build_wait`, `build_reply`, `usage`, `changes_open`, `changes_branch`,
   `changes_file`, `changes_back`, `worktrees_open`, `worktrees_close`,
   `pr_prompt`, `pr_send`, `pr_wait`, and `pr_reply`. Every listed slice must
   have an mp4 in `docs/demo/render/public/slices/`. `/sdcard/DCIM/Camera`
   must hold the zip's 17 photos, `/sdcard/Download` must hold `cat-mode.md`
   and `cat-diary.txt`, and the assets step must report 19 pushed onto the
   wiped emulator.
5. **Question landed.** `driver.log` must print a question state after
   `plan_wait`, the sheet must show `Settings toggle` and `Automatic`, and the
   capture must have the `elicitation_pick` and `elicitation_submit` slices.
   The driver fails if the question card is missing or there is more than one
   question.
6. **Build landed.** `driver.log` must print
   `build committed 1 change(s) on feat/cat-mode` (the count can be larger)
   and the worktree must be clean. Read the last frame of `build_reply` and
   the `usage` slice: the usage line must read like
   `66.1k / 1M (6%) · $0.016`. The driver fails if the usage line is missing.
7. **Changes and worktrees landed.** Read the last frame of `changes_open`
   (`No uncommitted changes`), `changes_file` (the `settings.js` diff with
   `catMode`), and `worktrees_open` (`feat/cat-mode` and `main`). The driver
   fails if the branch scope or either worktree is missing.
8. **PR landed.** Read the last frame of `pr_reply`: the URL must be visible.
   `gh pr list --repo codenamegary/cat-screensaver --head feat/cat-mode
--state open` must show one draft. The driver fails if the URL is missing.
   The next capture closes this PR and deletes the branch.
9. **Remotion is in sync.** Update `PAIR_STEPS`/`STORY_STEPS` to the 43-slice
   set before rendering. Do not render until that edit is done.
   `docs/demo/render` reads `public/capture.json` at build time
   (`calculateMetadata`); `src/timeline.ts` holds the slice edit. After a
   fresh capture, check the slice names and durations, then render a
   spot-check still:
   `bun x remotion still HaroldDemo ../work/render/check.png
--frame=<mid-story>` from `docs/demo/render`. Commit
   `docs/demo/render/public/slices/` + `capture.json` only from a fully
   successful run — never a failed one. Then re-render the committed cut so
   it shows the new capture: run `bun run render` from `docs/demo/render`. It
   renders `../work/render/harold-master.mp4`, then compresses it to
   `../harold.mp4` (H.264 CRF 26, 96 kbps AAC, faststart) with `ffmpeg`, which
   must be on `PATH`.

## Troubleshooting map

- Session menu shows unrelated titles or duplicate demo titles → run
  `bash docs/demo/capture/seed_sessions.sh`; it purges the demo worktree
  before creating the five fixed sessions. The worktree is reset after
  seeding, so seeded agent edits cannot leak into the story.
- Composer shows `provider/model` or `mode` → the installed app and source
  server are different revisions, or the app is not reaching the demo daemon.
  Check `capture.log` for `android_installed` and `android-build.log` for
  `BUILD SUCCESSFUL`. Check `~/.harold-demo-3847/settings.yml`,
  `adb reverse --list` for port 3847, and that the demo daemon, not the real
  one, is running. Then rerun the capture.
- The new session opens with `openrouter/GLM 5.3 FlashX Legal` → the driver
  selects `deepseek/deepseek-flash` before the story. Check the driver log for
  `model selected: Model: deepseek/DeepSeek V4.1 Flash 1017`. If the model
  sheet is missing, the session create response did not render config options;
  check the app install.
- Send does nothing while the prompt stays in the composer → the app's send
  button is disabled. The driver retries the tap and verifies the composer
  clears. If it stays disabled, select a seeded session from the menu, then
  create the new session again after the emulator is stable. The title may
  remain provisional until the agent generates one; the final PR shot shows
  the generated title.
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
- The agent does not ask the question → reread the plan prompt and
  `assets/cat-mode.md`. The spec requires one question with exactly
  `Settings toggle` and `Automatic`. The driver nudges once if the plan idles,
  then fails if the question card never appears.
- The agent asks more than one question → the sheet shows `Question 1 of N`.
  The driver fails the capture. Tighten the plan prompt and the spec; do not
  answer a multi-question form in the video.
- The build leaves uncommitted files → the driver verifies
  `git status --porcelain` is empty and fails. Check that the plan prompt says
  `Plan only; do not edit files`, that the build prompt says `commit every
change`, and that the seed worktree was reset. The plan turn's edits are
  reset before Build.
- The agent does not commit on `feat/cat-mode` → the driver checks the branch
  and `origin/main..HEAD`. Reread the build prompt. The worktree must be on
  `feat/cat-mode` before recording.
- Changes shows `No uncommitted changes` but no branch scope → tap
  `Against main`; the footer must show `feat/cat-mode`. Check the session's
  worktree path in the app (it tracks agent edits).
- The worktree sheet does not show `main` → the main clone and worktree are
  not sharing a repository. Re-run `capture.sh`; `prepare_cat_screensaver`
  recreates both.
- The PR URL is not visible → the chat may be scrolled up. The driver scrolls
  the transcript and then reads the URL. If the agent replied without a URL,
  check the PR prompt and `gh pr list`.
- `build_capture.py` reports a missing slice or the render throws
  `capture.json is missing slice ...` → the driver did not record that action.
  Check `driver.log` and the manifest, then re-run the capture.
- Pair code expired (~10 min) → instance 1's code is issued before composing.
  Rerun the full capture instead of hand-patching.

Base directory for this skill: /home/codenamegary/sites/harold/.opencode/skills/compose-demo
Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.
Note: file list is sampled.
