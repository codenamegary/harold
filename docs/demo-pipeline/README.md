# Demo pipeline

Scripts that record the README demo video: the terminal (`harold serve`, `harold status`, `harold pair`) and the Android emulator app scanning the QR, pairing, starting a session, and picking model, mode, and effort.

| File                 | Role                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `capture.sh`         | One-shot orchestrator: resets the app, starts both recordings, injects the pairing QR, drives the phone                |
| `terminal-pair.tape` | VHS tape for the terminal recording                                                                                    |
| `tmux-harold.conf`   | tmux look: no status bar, brand-colored borders. With one pane it is invisible, so the video reads as a plain terminal |
| `drive_phone.py`     | UIAutomator-driven walkthrough of the phone flow                                                                       |
| `compose.py`         | Cuts and joins both recordings into the final video with ffmpeg                                                        |

## How to run

Prerequisites: `vhs`, `ffmpeg`, `adb` with a booted AVD, the repo's `qrcode` dependency available, and a debug app install (`cd apps/android && ./gradlew :app:installDebug`). The orchestrator also expects a stopped daemon, the emulator console token at `~/.emulator_console_auth_token`, and a tmux server it can own.

```sh
bash docs/demo-pipeline/capture.sh          # artifacts land in /tmp/opencode/media
python3 docs/demo-pipeline/compose.py \
  --t-qr <s> --t-dp <s> --t-chat <s> \
  --term-cut-start <s> --term-cut-end <s> \
  --cut-start <s> --cut-end <s> \
  --phone-speed 1.3 --tail 0 --hold-end 1.5
```

The anchors are visual, so read them off the new recordings first (extract a frame, check it). `compose.py --help` lists every knob.

## How it works

- The emulator runs with `-camera-back virtualscene`. Once the terminal shows a pairing code, the controller renders that exact code to a PNG and swaps it in as a wall poster, then walks the virtual camera to it. The app's scanner decodes the poster for real.
- The terminal runs inside a single-pane tmux session with the status bar off. The recording looks like a plain terminal, but `capture-pane` lets the controller read the pairing code out of band.
- Dead time is removed in the edit: the daemon boot wait, the virtual camera warm-up, and a 1.3x playback of the phone UI.

The phone flow needs the Android changes on this branch: sessions are created when the New session dialog is confirmed, and the create response seeds the model, mode, and effort selectors before the first prompt.
