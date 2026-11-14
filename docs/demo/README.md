# Demo

The SSH-only demo video pipeline, in three stages:

| Stage       | Directory   | Role                                                                                                    |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| `fake-host` | `fake-host/` | Docker SSH host with fixed repos, host key, workspaces, and scripted ACP agents                         |
| `capture`   | `capture/`  | Records the phone: emulator, MCP driver, dead-space cut                                                 |
| `render`    | `render/`   | The Remotion cut: phone, crops, copy, brackets, sound; renders from fixtures tracked in `public/`        |

The script is [`script.md`](./script.md). It is the single source of truth for
scene order, on-screen copy, the stage, and the probe contract. Do not keep a
second storyboard anywhere else.

The original was `docs/demo/script-prompt.md`. It was deleted from `main` by
`0ccf10d feat!: direct SSH only - drop the Harold hub` along with the rest of
the hub demo, and survived only in git history. It was recovered from `0ccf10d^`
and now lives at `script.md`. The lesson is worth keeping: `docs/demo/work/` is
gitignored, so anything that matters has to live in the tracked tree or it will
be lost the same way.

What is kept and what is not:

- **Kept, committed:** everything in `capture/`, `fake-host/`, and `render/`, the fixtures in `render/public/` (`slices/`, `capture.json`, `music.mp3`, `sfx/`) so a fresh clone renders offline, and the finished cut at `harold.mp4`.
- **Not kept:** `work/`. Capture scratch, logs, preview renders, and QA stills all land there and are safe to delete at any time.

## The capture loop

The phone is driven over MCP. The debug app runs a probe server, and the driver
asks that server where a control is. Every tap is a real adb tap. Every
on-camera character is one `adb shell input text` into the focused field. The
driver records **11 on-camera slices** plus the pre-roll beats that stage the
app between them.

The loop, end to end:

1. `capture.sh` starts the fake host and the emulator, installs the debug app,
   forwards `tcp:7391`, and reads the probe token out of logcat.
2. [`mcp/src/slices.ts`](./capture/mcp/src/slices.ts) is the only list of slice
   names. The driver, `capture.sh`, and the render timeline all read it, so there
   is no second copy to drift. Pre-roll beats (`boot`, `plan_stage`,
   `question_stage`, `build_stage`, `pr_stage`) drive the app but are never
   recorded.
3. [`mcp/src/walk.ts`](./capture/mcp/src/walk.ts) runs one beat per slice. For
   each recorded slice it starts `screenrecord` and runs a calibration blink.
   The blink is sleep, hold black, wake, then dismiss the keyguard. Then it
   runs the beat. It waits on probe facts. After the beat it runs the tail blink.
4. The blink is the sync contract. `build_capture.py` finds the black run, trims
   the head, and expresses every tap, keystroke, and mark as a time in the
   published file.
5. Each typed character is one `adb shell input text`. The driver stamps `key`
   on the host clock before the character goes out. That is the same clock as
   `sync_wake`. It stamps `keys_done` when the field is done. `build_capture.py`
   maps those host stamps onto the video with the blinks.
6. `capture.sh` pulls the slices to `render/public/slices/` and runs
   `build_capture.py`, which writes `render/public/capture.json`.

The real commands, in order, from the repo root:

```sh
# whole run: fake host, emulator, app install, 11 slices, capture.json
bash docs/demo/capture/capture.sh

# re-record one slice, or a few, without recording the rest
bash docs/demo/capture/capture.sh --only connect
bash docs/demo/capture/capture.sh --only home_empty,connect

# drive the walk without the emulator bring-up (needs a device and a token)
cd docs/demo/capture/mcp
bun run src/walk.ts --list
bun run src/walk.ts --self-test
bun run src/walk.ts --only connect
```

A direct walk needs the port forwarded and the probe token from logcat:

```sh
adb forward tcp:7391 tcp:7391
export HAROLD_PROBE_TOKEN=$(adb logcat -d -s HaroldProbe:I \
  | sed -n 's/.*token=\([0-9a-f]*\).*/\1/p' | tail -n 1)
cd docs/demo/capture/mcp && bun run src/walk.ts --only connect
```

To rebuild `capture.json` from slices already pulled, without a device:

```sh
python3 docs/demo/capture/build_capture.py
```

## The 182.8 second cut

[`render/`](./render) builds a 1920x1080, 30 fps, **5485 frame** video from the
11 recorded slices. That is 182.8 s. The master is H.264 at CRF 18. The
compressed cut is CRF 26 with 96 kbps AAC and faststart. `capture.json` supplies
the pixels and the timings. `timeline.ts` is the edit, and a retime there never
re-records anything. The `question` beat plays its capture at 1.0x. The cut
follows the script's twelve scenes in order.

## Regenerating it end to end

In order, from the repo root:

```sh
# 1. record the phone (needs docker, adb, an emulator, and the debug app)
bash docs/demo/capture/capture.sh

# 2. rebuild capture.json from the pulled slices; capture.sh already does this
python3 docs/demo/capture/build_capture.py

# 3. render the cut
cd docs/demo/render
bun install
bun test src
bun run lint
bun run render

# 4. pull the review stills out of the master, from the render project
cd docs/demo/render
bunx remotion bundle --out-dir=../work/render/bundle-v5
mkdir -p ../work/render/qa-v5
for f in 45 400 760 980 1200 1600 1800 2240 2400 2700 3000 3300; do
  bunx remotion still ../work/render/bundle-v5 HaroldDemo "../work/render/qa-v5/f-$f.png" --frame=$f
done
```

Step 3 writes `work/render/harold-master.mp4` and then `docs/demo/harold.mp4`.
To re-cut without re-recording, start at step 3: `capture.json` and the slices are
committed, so a fresh clone renders offline.

## What the cut does not cover

These are real limits of the recording, not of the edit. Fixing any of them needs
a better capture.

- **The calibration blink reloads a session.** Every slice starts with a short
  sleep/wake blink so the sync can be measured. When the display wakes after the
  plan beat, the app reloads onto a session. `question` and `build` therefore do
  not start on the exact transcript the plan left, and the cut never pretends
  they are one continuous take.
- **The crops are upscales.** A screen crop magnifies the 1080x2400 capture about
  1.8 to 2.4 times to fill a 1920 wide stage. The app is not re-rendered at that
  size, so its text is soft when the frame is paused.
- **Some taps after `landing` are silent.** The plan slice now records its
  attach, picker, mode and send taps. The `question`, `build`, `changes`,
  `worktrees` and `pr` beats still reach their screens through probe intents, so
  those taps have no ripples and no tap sounds.
- **The plan pickers use fixed AVD points.** `Attach photo` and `Attach files`
  open Android UI outside the app. The driver taps the capture AVD's stable
  1080x2400 picker points and verifies the chips through app facts, so the cut
  shows the pickers themselves without a slow dump in the middle of the beat.
- **The host-side authorize step is an overlay.** The one command that ran off
  camera is drawn on the key beat from `ssh-data.ts`. The phone footage does not
  contain it.

See [`capture/README.md`](./capture/README.md) and
[`render/README.md`](./render/README.md) for the details.
