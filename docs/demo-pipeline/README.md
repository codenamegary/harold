# Demo pipeline

`capture.sh` records the phone demo. It starts Harold, issues a pairing code, puts the QR on the emulator wall, and screenrecords the app. Remotion plays that recording in a phone frame next to a simulated terminal that runs `harold start` and `harold pair`, QR included.

| File             | Role                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| `capture.sh`     | Start the daemon, pair, inject the QR, record the phone, write marks |
| `drive_phone.py` | Walk the app: pair, new session, model, mode, effort, send a prompt  |

## How to run

The emulator has to be booted with a virtual-scene back camera, and the debug app has to be installed.

```sh
emulator -avd agent_server_api34 -no-audio -gpu swiftshader_indirect -no-snapshot -camera-back virtualscene
```

```sh
cd apps/android && ./gradlew :app:installDebug
bash docs/demo-pipeline/capture.sh
```

`capture.sh` writes `docs/demo/public/phone.mp4` and `docs/demo/public/capture.json`. Both are committed, so the cut renders from a fresh clone without re-capturing.

Preview or render from `docs/demo`:

```sh
bun install
bun run dev
bunx remotion render src/index.ts HaroldDemo out/harold.mp4
```

## How it works

The script exits if the running emulator was not started with `-camera-back virtualscene`. It plays `Reset_position`, then `harold start`, then `harold pair --no-wait --json`. The pairing URI is rendered to a PNG and set as the wall poster. After the phone opens the scanner, `drive_phone.py` plays `Walk_to_image_room` (about 12 seconds). That walk ends facing the wall poster.

`capture.json` stores the video size and the UI marks, counted from the start of the screen recording. The simulated terminal follows those marks: it prints `Device paired.` when the phone lands on the paired chat. The caption under the phone changes on the same marks (`steps.ts`). A short title card opens the cut and a four second install card closes it.

The QR in the terminal is the real pairing QR from the recorded run. `qr-rows.ts` holds the CLI's half-block output and `qr-matrix.ts` decodes it into a module grid, so the video draws squares instead of relying on font glyphs. The code has long expired, so scanning it does nothing.
