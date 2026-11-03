# Demo capture setup

Detailed setup for `capture.sh`. The edit script lives in
`docs/demo/script-prompt.md`.

`capture.sh` owns the full capture environment. The setup must live in the
script. Do not depend on instructions in a skill.

## Instance

- Run one instance from this checkout with `bun run dev` so every command uses
  `apps/cli/src/main.ts`, not a globally installed `harold`.
- Instance 1: `HAROLD_PORT=3847`, `HAROLD_DATA_DIR=~/.harold-demo-3847`.
- The demo project folder root is `~/harold-demo-workspaces/3847` and stays
  outside the data dir.
- Write `settings.yml` with `bindPort: 3847`. Issue pairing codes with
  `--url http://127.0.0.1:3847` because the emulator reaches the host through
  `adb reverse`.
- Stop any previous instance 1 by its data dir or daemon state. Do not stop the
  user's real `~/.harold` daemon.
- Remove the previous demo data dir, create a fresh DB, and register the agent
  and workspaces again.
- Fail if another process owns port 3847.

## Agent

- Enable `opencode` on instance 1. Use the exact agent ID.
- Verify `opencode auth list` succeeds. The capture uses
  `deepseek/deepseek-flash`; the driver pins the new session to that model
  before the story starts.
- No Cursor or pi checks. This capture does not use them.

## Private demo repo and worktree

The demo ships a small `cat-screensaver` project. Its source of truth is
`docs/demo/capture/fixtures/cat-screensaver/`.

- Private repo: `codenamegary/cat-screensaver`.
- Main clone: `~/harold-demo-workspaces/3847/cat-screensaver`.
- Feature worktree: `~/cat-screensaver-worktrees/cat-mode`, branch
  `feat/cat-mode`, created from `origin/main`.
- Workspace registration path: the worktree, named `cat-screensaver`. The path
  the phone shows ends in `cat-mode`.

`capture.sh` performs these steps on every run:

1. Verify `gh auth status`.
2. Verify the private demo repo exists, and create it if missing.
3. Clone or initialize the local fixture.
4. Copy the fixture into `main`, commit and push `main`.
5. Close old open PRs for `feat/cat-mode`.
6. Delete the old remote branch.
7. Remove the old worktree and local branch.
8. Reset `main` to `origin/main`.
9. Recreate the worktree.
10. Register the worktree as the `cat-screensaver` workspace.

The fixture includes a `.gitignore` for `.harold/`, so the app's attachment
directory does not dirty the worktree.

## Workspaces

A workspace is a bookmark to a project folder. The demo keeps the project
folders outside the data dir and registers each one on a fresh DB.

- `harold`: clone of `git@github.com:codenamegary/harold.git`.
- `cat-screensaver`: the `feat/cat-mode` worktree.
- `fish-screensaver-for-cats`: a local repo.
- `meow`: a local repo.

Re-register every workspace path on each fresh DB with `harold workspace add`.
The DB reset loses the rows. The directories stay.

## Session history

- Purge the OpenCode history in the feature worktree, then seed the five fixed
  cat sessions, newest first. This is the history the session menu shows.
- Reset the worktree after seeding. The seed prompts run with `--auto` and can
  touch files; the recorded story must start clean.
- Do not copy sessions from `~/.harold` or a previous demo DB.

## Pairing codes and ports

- Generate the instance 1 pairing code with the loopback endpoint immediately
  before composing the camera feed. Pairing codes live 10 minutes.
- Set `adb reverse tcp:3847 tcp:3847` after every emulator boot. Verify the
  mapping.

## Camera

- Compose the live QR into the staged camera clip.
- Copy the composed feed to a short `/tmp/opencode/harold-camera-live.mp4`
  path before boot. The emulator's videofile camera fails on long paths.
- Boot the emulator with the videofile back camera and an emulated front
  camera. No audio.

## Emulator and app

- Stop the capture AVD. Boot it with `-wipe-data`, `-gpu
  swiftshader_indirect`, `-no-snapshot`, and `-feature VideoPlayback`.
- Enable dark mode and hide system error dialogs before launching the app.
- Set the demo clock, battery, network, and notification state.
- Build and install `harold.android.debug` from this checkout.
- Clear app data once before the recorded run.
- Grant camera and notification permissions.
- Push the cat photos, `cat-mode.md`, and `cat-diary.txt`. Rescan MediaStore
  so the pickers see them.

## Driver and artifacts

- Run `drive_phone.py` after the app is installed and the reverse is set.
- The plan turn must ask exactly one question with `Settings toggle` and
  `Automatic`. The driver answers `Settings toggle`, submits, and fails the
  capture if there is no question card.
- The build turn must leave a clean worktree with at least one commit on
  `feat/cat-mode`. The driver verifies the branch, commit count, and clean
  status.
- The usage line must be visible in the UI dump. The driver fails if it is
  missing.
- The PR turn must end with the URL in chat. The driver finds
  `https://github.com/` and `/pull/`, then verifies the draft PR with
  `gh pr list`.
- Regenerate `docs/demo/render/src/qr-rows.ts` and the `CODE`/`EXPIRES` values
  in `docs/demo/render/src/terminal-data.ts` from the new instance 1 pair JSON.
  `write_pairing_fixtures.mjs` does this as part of `capture.sh`.
- Pull the recorded slices, run `build_capture.py`, and write
  `docs/demo/render/public/capture.json`.
- Do not reuse slices or captures from a previous run.

## Preflight

- Check `bun`, `opencode`, `gh`, `git`, `adb`, `node`, `ffmpeg`, `ffprobe`,
  `python3`, `sqlite3`, `unzip`, a JDK, the Android SDK, and the emulator.
- Check that port 3847 is free before starting.
- Check `gh auth status` and access to the private demo repo.
- Check SSH access to the Harold clone remote.
- Fail before changing anything if a check fails.
