# Demo capture setup

Detailed setup for `capture.sh`. The edit script lives in
`docs/demo/script-prompt.md`.

`capture.sh` owns the full capture environment. The setup must live in the
script. Do not depend on instructions in a skill.

## Instances

- Run both instances from this checkout with `bun run dev` so every command uses `apps/cli/src/main.ts`, not a globally installed `harold`.
- Instance 1: `HAROLD_HOST=127.0.0.1`, `HAROLD_PORT=3847`, `HAROLD_DATA_DIR=~/.harold-demo-3847`.
- Instance 2: `HAROLD_HOST=127.0.0.1`, `HAROLD_PORT=3848`, `HAROLD_DATA_DIR=~/.harold-demo-3848`.
- Write a separate `settings.yml` for each instance. Set `advertisedUrl` to `http://127.0.0.1:<port>`, `bindHost` to `127.0.0.1`, and `bindPort` to the instance port.
- Stop any previous instance 1 or instance 2 by its data dir or daemon state. Do not stop the user's real `~/.harold` daemon.
- Remove the previous demo data dirs, create fresh DBs, and register the agents and workspaces again. Do not copy `~/.harold/harold.db` or any previous demo DB.
- Start both instances from the fresh data dirs. Fail if another process owns port 3847 or 3848.
- The demo project folder roots are outside the data dirs. Removing a data dir must not remove a workspace.

## Agents

- Instance 1: enable `cursor` and `pi-acp`.
- Instance 2: enable `opencode`.
- Use the exact agent IDs. The pi agent is `pi-acp`, not `pi`.
- Verify each enabled agent is present and available. Check auth for any agent that needs it. Enabling alone is not enough.

## Workspaces

A workspace is a bookmark to a project folder. The demo keeps the project
folders outside the data dirs and registers each one on a fresh DB.

- Instance 1 demo project folder root: `~/harold-demo-workspaces/3847`.
- Instance 2 demo project folder root: `~/harold-demo-workspaces/3848`.
- Instance 1 bookmarked folders:
  - Clone `git@personal:codenamegary/harold.git` into `harold`.
  - Create local repos `cat-screensaver`, `fish-screensaver-for-cats`, and `meow`.
- Instance 2 bookmarked folders:
  - Clone `git@personal:codenamegary/yuekbox.git` into `yuekbox`.
  - Create local repos `pet-me-human`, `thesis-research`, `qbert-nextgen`, and `elt-meeting-agenda`.
- Keep existing workspace directories. Do not delete them.
- If a clone is missing, clone it. If it exists, run `git pull --ff-only`. Fail with a clear message if the pull fails.
- If a local repo is missing or empty, run `git init` and make an initial commit. Leave existing content alone.
- Re-register every workspace path on each fresh DB with `harold workspace add`. The DB reset loses the rows. The directories stay.

## Demo values

- Instance 1 identity: name `Work`, color Violet, icon Harold mark.
- Instance 2 identity: name `Couch`, color Tide, icon Bolt.
- Instance 2 manual pairing endpoint: `http://127.0.0.1:3848`.
- Main chat target: instance 2 workspace `yuekbox` with agent `opencode`.

## Session history

- Purge the demo workspace OpenCode history on instance 2, then seed the five fixed OpenCode demo sessions, newest first, so repeated captures cannot stack duplicate rows.
- Seed one fixed pi session on instance 1 so the session list can show both Harold badges.
- Do not copy sessions from `~/.harold` or a previous demo DB.

## Pairing codes and ports

- Generate the instance 1 pairing code with the loopback endpoint immediately before composing the camera feed.
- Generate the instance 2 pairing code with the loopback endpoint immediately before the manual pairing scene. Pairing codes live 10 minutes. Do not generate it at setup start.
- Set `adb reverse tcp:3847 tcp:3847` and `adb reverse tcp:3848 tcp:3848` after every emulator boot. Verify both mappings.

## Camera and audio

- Compose the instance 1 live QR into the staged camera clip.
- Copy the composed feed to a short `/tmp/opencode/harold-camera-live.mp4` path before boot. The emulator's videofile camera fails on long paths.
- Boot the emulator with the videofile back camera and an emulated front camera.
- Prepare the WAV microphone input and compile the audio environment shim.

## Emulator and app

- Stop the capture AVD. Boot it with `-wipe-data`, `-allow-host-audio`, `-gpu swiftshader_indirect`, `-no-snapshot`, and `-feature VideoPlayback`.
- Enable dark mode and hide system error dialogs before launching the app.
- Set the demo clock, battery, network, and notification state.
- Build and install `harold.android.debug` from this checkout.
- Clear app data once before the recorded run.
- Grant camera, notifications, and record audio permissions.
- Push the cat photos and `cat-diary.txt`. Rescan MediaStore so the pickers see them.

## Driver and artifacts

- Run `drive_phone.py` after the app is installed and the reverses are set.
- The Workspaces shot opens Add workspace, filters to the demo project folder
  root, and drills into the instance 1 folder. It must not submit the form.
- Regenerate `docs/demo/render/src/qr-rows.ts` and the `CODE`/`EXPIRES` values
  in `docs/demo/render/src/terminal-data.ts` from the new instance 1 pair JSON.
  `write_pairing_fixtures.mjs` does this as part of `capture.sh`.
- Pull the recorded slices, run `build_capture.py`, and write `docs/demo/render/public/capture.json`.
- Do not reuse slices or captures from a previous run.

## Preflight

- Check `bun`, `adb`, `node`, `ffmpeg`, `ffprobe`, `python3`, `cc`, `sqlite3`, a JDK, the Android SDK, and the emulator.
- Check that ports 3847 and 3848 are free before starting.
- Check SSH access to the two clone remotes.
- Fail before changing anything if a check fails.
