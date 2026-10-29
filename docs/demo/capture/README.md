# Demo capture

`capture.sh` records the phone walk with two Harold instances. Instance 1 uses
Cursor and pi ACP. Instance 2 uses OpenCode. The phone pairs with instance 1 by
camera, then pairs with instance 2 by typing its endpoint and code. The
detailed setup spec is in [setup.md](./setup.md).

| File                         | Role                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `capture.sh`                 | The whole run: two daemons, app install, pair, feed, boot, slices, build                                                     |
| `seed_sessions.sh`           | Purge and seed the five OpenCode sessions on the Couch workspace                                                             |
| `seed_work_session.sh`       | Seed one pi ACP session on the Work workspace                                                                                |
| `compose_camera.mjs`         | Overlay the live QR on the tracked panel after a 40s gate, crop to 1280x960                                                  |
| `write_pairing_fixtures.mjs` | Regenerate the Remotion pairing code and QR rows from the live pair JSON                                                     |
| `drive_phone.py`             | Walk the app pair -> sessions -> workspaces -> new session -> model/mode/effort -> text and voice chat, one slice per action |
| `build_capture.py`           | Re-encode the slices, attach the taps, and write `capture.json`                                                              |
| `push_assets.sh`             | Push the demo photos and `cat-diary.txt` onto the factory-reset emulator                                                     |
| `audio-env-shim.c`           | Restore the WAV audio driver variables that the emulator wrapper strips                                                      |

`assets/virtual-qr-code-webcam.mp4` is the staged clip the camera feed is
composed from. `assets/cats.zip` holds the demo photos. `assets/cat-diary.txt`
is the document for file attachments. `assets/voice-input.wav` is the speech the
emulator microphone hears during the voice scene.

## What is kept and what is not

- **Kept, committed:** everything in this directory plus
  `docs/demo/render/public/slices/` and `docs/demo/render/public/capture.json`.
- **Not kept:** `docs/demo/work/capture/` (composed feed, logs, raw slices,
  pairing codes, screenshots), the demo data dirs, and the demo project folder roots.

## How to run

Needs `bun`, `opencode`, `pi`, the Cursor `agent`, `sqlite3`, `adb`, `node`,
`ffmpeg`, `ffprobe`, `python3`, `cc`, a JDK, the Android SDK, and the 36.5+
emulator at `~/android/emulator` (set `EMULATOR` to override). The emulator needs
the videofile camera and the WAV audio driver.

```sh
bash docs/demo/capture/capture.sh
```

The script uses these fixed demo resources:

- Instance 1: `127.0.0.1:3847`, `~/.harold-demo-3847`,
  `~/harold-demo-workspaces/3847`
- Instance 2: `127.0.0.1:3848`, `~/.harold-demo-3848`,
  `~/harold-demo-workspaces/3848`

It stops only the two demo instances. The real `~/.harold` daemon is left alone.
Each run recreates the demo data dirs and DBs, keeps the workspace directories,
re-registers the workspaces, and enables the agents again. The workspace clones
are pulled with `--ff-only`. Local repos are initialized with an initial commit.
The demo workspace OpenCode history is purged before the five fixed sessions are
seeded. The Work pi session is replaced each run.

Instance 1's live QR is baked into the camera clip. Instance 2's pairing code is
issued by `drive_phone.py` immediately before the manual pairing beat. The
emulator boots through a transient systemd user unit so QEMU survives the shell.
The script sets both `adb reverse` mappings after boot.

`capture.sh` writes `docs/demo/render/public/slices/` and
`docs/demo/render/public/capture.json`. Preview or render from
`docs/demo/render`:

```sh
bun install
bun run dev
bun run render
```

## How it works

The phone walk records these acts:

1. First pair by camera. The scanner is replaced by the Harold identity screen.
   The user names it `Work`, keeps Violet and the Harold mark, and taps Pair.
2. Pair another Harold from the chat overflow menu. No terminal is visible. The
   user enters `http://127.0.0.1:3848` and the instance 2 code, then names it
   `Couch` with Tide and Bolt.
3. Open the session dropdown, tap `See all sessions…`, and show the full
   Sessions screen with the All, Work, and Couch filters. Select the newest
   OpenCode session from Couch.
4. Open Workspaces from the chat overflow menu. Show the bookmark list from
   both Harolds, then open Add workspace and browse to the demo project folder
   root. Leave without submitting.
5. Start a new session. Select `harold` under Work to show Cursor and pi ACP.
   Switch to `yuekbox` under Couch and select OpenCode.
6. Change the model to `deepseek/DeepSeek V4.1 Flash 1017`, cycle the mode
   through Plan and Build, set thinking to High, and show the slash commands.
7. Draft the text prompt, attach a cat photo and `cat-diary.txt`, send, and wait
   for the reply.
8. Open voice input, expand it, play `voice-input.wav`, send, and wait for the
   reply.

The walk is recorded as named slices. `drive_phone.py` starts one screenrecord
file per action in `/data/local/tmp`, writes the slice manifest, and marks each
tap. `build_capture.py` re-encodes the slices into `public/slices/`, attaches the
taps that landed inside each slice, and writes `capture.json`. There is no
stitched video.
