# Demo capture setup

Detailed setup for `capture.sh`. The old camera and pairing flow is gone.

## Fake host

- The host is a normal OpenSSH server in `docs/demo/fake-host`.
- Compose project `harold-demo`, container `harold-demo-host`.
- Port mapping `127.0.0.1:2223 -> 2222` by default
  (`HAROLD_DEMO_SSH_PORT`).
- User `gary`, password `harold`.
- Fixed host key so the fingerprint and the video never drift:
  `SHA256:iKE0VpdoZwc0iRm1SFqsMzAm89GgjOX+tBGfqa4dJ8s`.
- Every container start rebuilds `/home/gary`: repositories, `~/.harold`
  state, agent session history, and the fake PR record.
- `capture.sh` runs `docker compose down` then `up -d --build` at the start.

The host has:

- `~/sites/cat-screensaver` on `main`, with a local bare `origin`.
- `~/sites/cat-screensaver-worktrees/cat-mode` on `feat/cat-mode`.
- `~/sites/moonlit-garden`, `~/sites/meow`, and
  `~/sites/fish-screensaver-for-cats`.
- `~/.harold/workspaces.json` with the four workspace bookmarks.
- `~/.harold/agents.json` with OpenCode, Claude Agent, and Codex enabled.

## Emulator and app

- Stop the capture AVD. Boot it with `-wipe-data`, `-gpu
  swiftshader_indirect`, `-no-snapshot`, and `-feature VideoPlayback`.
- Enable dark mode and hide system error dialogs before launching the app.
- Set the demo clock, battery, network, and notification state.
- Build and install `harold.android.debug` from this checkout.
- Clear app data once before the recorded run.
- Grant camera and notification permissions (camera is kept for the app's
  other flows; this cut does not use it).
- Push the cat photos, `cat-mode.md`, and `cat-diary.txt`. Rescan MediaStore
  so the pickers see them.
- Set `adb reverse tcp:2223 tcp:2223` after every boot and verify it.

## Driver and artifacts

- Run `drive_phone.py` after the app is installed and the reverse is set.
- The host setup must fill host, user, port, name, and password, then test and
  trust the fingerprint.
- The plan turn must ask exactly one question with `Settings toggle` and
  `Automatic`. The driver answers `Settings toggle`, submits, and fails the
  capture if there is no question card.
- The build turn must leave a clean worktree with at least one commit on
  `feat/cat-mode`. The driver verifies the branch, commit count, and clean
  status over `docker exec`.
- The usage line must be visible in the UI dump. The driver fails if it is
  missing.
- The PR turn must record the fake draft PR and show the URL in chat. The
  driver fails if either is missing.
- Pull the recorded slices, run `build_capture.py`, and write
  `docs/demo/render/public/capture.json`.
- Do not reuse slices or captures from a previous run.

## Preflight

- Check `bun`, `docker` with Compose, `git`, `adb`, `node`, `ffmpeg`,
  `ffprobe`, `python3`, `unzip`, a JDK, the Android SDK, and the emulator.
- Check that the fake host compose file exists.
- Fail before changing anything if a check fails.
