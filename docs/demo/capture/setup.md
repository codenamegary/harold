# Demo capture setup

Detailed setup for `capture.sh`. The old camera and pairing flow is gone.

## Fake host

- The host is a normal OpenSSH server in `docs/demo/fake-host`.
- Compose project `harold-demo`, container `harold-demo-host`.
- Port mapping `127.0.0.1:2223 -> 2222` by default
  (`HAROLD_DEMO_SSH_PORT`).
- User `gary`, public key authentication only. The account has no password
  hash and `sshd_config` refuses password and keyboard-interactive logins, so
  there is no password to type and no password to document.
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

## Keys-only connect

- `capture.sh` runs `docker exec harold-demo-host reset-authorized-keys` once
  per run, before the driver starts. Every container start also begins with an
  empty key set.
- The app generates a fresh key on entry and the run begins with `pm clear`,
  so the key cannot be baked into the image. The MCP walk opens the form during
  the unrecorded `boot` beat, reads the key out of the `publicKey` fact, and
  checks that it starts with `ssh-`.
- The driver then injects that exact line with
  `docker exec -i harold-demo-host add-authorized-key`, before any recorded
  slice and long before `Test connection`.
- No public key in the facts aborts the run during `boot`. There is no password
  fallback and no `SSH_PASSWORD`. The walk never taps an auth segment, so the
  `Generate key` segment stays selected.

## Driver and artifacts

- Run `mcp/src/walk.ts` after the app is installed, the reverse is set, and the
  probe token is read from logcat. `capture.sh` does all three.
- The host setup must fill host, user, port and name, copy the generated public
  key, then test and trust the fingerprint.
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

## Telemetry

`marks.log` is append-only, uses `time.monotonic()` at 3 dp, and keeps the
grammar `build_capture.py:50` already parses:

```
tap <mono> <x> <y>    one per injected tap
key <mono>            one per injected character
sync_wake <mono>      sampled just before the WAKEUP keyevent of a slice
<name> <mono>         mark() rows, including keys_done
```

- Typing is per character. Each character writes its `key` mark, gets its own
  `input text` call, then waits `KEY_GAP_SEC` (0.03 s, floored at 0.02 s). The
  recorded `key` timestamps are the ground truth for cadence, and `driver.log`
  reports `typed <field> <n> chars <cps> cps` plus the measured median and p95
  key interval per field.
- Escaping lives in `input_text_tokens`: one token per character, `%s` for a
  space, single-quoted for the device shell. `drive_phone.py --self-test` runs
  the helper over spaces, apostrophes, shell metacharacters and uppercase and
  round-trips every token through `/bin/sh`.
- Every slice starts with a calibration blink: screen off, hold black, wake,
  `wm dismiss-keyguard`, then the slice's first action. The `sync_wake` mark is
  sampled before the sleep keyevent, so ffmpeg `blackdetect` can find the black
  run and the plan's offset math can cancel adb issue-to-delivery latency. This
  needs `locksettings set-disabled true`, `wm dismiss-keyguard` and
  `svc power stayon true`, which `capture.sh` sets once after `pm clear`.
- `bash docs/demo/capture/capture.sh --only connect_fill` re-records a single
  slice. The walk still drives the app to reach it, records nothing else, and
  exits when the requested slices are done. The file keeps its storyboard
  `NNN-name.mp4` name, so it drops into a later full run unchanged.

## Preflight

- Check `bun`, `docker` with Compose, `git`, `adb`, `node`, `ffmpeg`,
  `ffprobe`, `python3`, `unzip`, a JDK, the Android SDK, and the emulator.
- Check that the fake host compose file exists.
- Fail before changing anything if a check fails.
