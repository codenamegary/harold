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

The phone is driven over MCP, not by UI dumps. The debug app runs a probe server,
and the driver asks that server where a control is. Every tap is still a real adb
tap and every keystroke runs inside the app. The driver records **15 on-camera
slices** plus the pre-roll beats that stage the app between them.

The loop, end to end:

1. `capture.sh` starts the fake host and the emulator, installs the debug app,
   forwards `tcp:7391`, and reads the probe token out of logcat.
2. [`mcp/src/slices.ts`](./capture/mcp/src/slices.ts) is the only list of slice
   names. The driver, `capture.sh`, and the render timeline all read it, so there
   is no second copy to drift. Pre-roll beats (`boot`, `plan_stage`,
   `question_stage`, `build_stage`, `pr_stage`) drive the app but are never
   recorded.
3. [`mcp/src/walk.ts`](./capture/mcp/src/walk.ts) runs one beat per slice. For
   each slice it clears the mark ledger, samples the device clock, starts
   `screenrecord`, and runs a calibration blink: sleep, hold black, wake, dismiss
   the keyguard. Then it runs the beat, waiting on probe facts instead of
   sleeping. After the beat it samples the clock again and runs the tail blink.
4. The blink is the sync contract. `build_capture.py` finds the black run, trims
   the head, and expresses every tap, keystroke, and mark as a time in the
   published file.
5. Marks are stamped on the device clock (`elapsedRealtimeNanos`). The driver
   fits a straight line from device seconds to host seconds over that slice's
   anchor samples, then maps every mark through it. A tap is never off by the gap
   between two clocks.
6. `capture.sh` pulls the slices to `render/public/slices/` and runs
   `build_capture.py`, which writes `render/public/capture.json`.

The real commands, in order, from the repo root:

```sh
# whole run: fake host, emulator, app install, 15 slices, capture.json
bash docs/demo/capture/capture.sh

# re-record one slice, or a few, without recording the rest
bash docs/demo/capture/capture.sh --only connect_fill
bash docs/demo/capture/capture.sh --only connect_trust,connect_save

# drive the walk without the emulator bring-up (needs a device and a token)
cd docs/demo/capture/mcp
bun run src/walk.ts --list
bun run src/walk.ts --self-test
bun run src/walk.ts --only connect_fill
```

A direct walk needs the port forwarded and the probe token from logcat:

```sh
adb forward tcp:7391 tcp:7391
export HAROLD_PROBE_TOKEN=$(adb logcat -d -s HaroldProbe:I \
  | sed -n 's/.*token=\([0-9a-f]*\).*/\1/p' | tail -n 1)
cd docs/demo/capture/mcp && bun run src/walk.ts --only connect_fill
```

To rebuild `capture.json` from slices already pulled, without a device:

```sh
python3 docs/demo/capture/build_capture.py
```

## The 115.2 second cut

> **Status: superseded.** The cut on disk was built before the current
> [`script.md`](./script.md) and does not tell the story written there. It is
> kept as a reference until the rebuild lands. Do not read its beat table as the
> script.

[`render/`](./render) builds a 1920x1080, 30 fps, **3456 frame** video from the
15 recorded slices: 115.2 s exactly, H.264 master at CRF 18, then a compressed
cut at CRF 26 with 96 kbps AAC and faststart. `capture.json` supplies the pixels
and the timings. `timeline.ts` is the edit, and a retime there never re-records
anything. The `question` beat now plays its capture at 1.0x instead of stretching
it, and the frames it gave back went to `build` and `changes`; the total is still
3456.

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
bunx remotion bundle --out-dir=../work/render/bundle-story
mkdir -p ../work/render/qa-final-story
for f in 30 120 180 240 312 366 414 489 546 600 640 700 1000 1050 1320 1450 1600 1900 2210 2300 2410 2570 2690 2800 2960 3180 3260 3380; do
  bunx remotion still ../work/render/bundle-story HaroldDemo "../work/render/qa-final-story/f-$f.png" --frame=$f
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
- **The taps after `landing` are silent.** Those slices record no `taps[]`, so
  their taps have no ripples and no tap sounds. Only the typing in `plan`,
  `build`, and `pr` is sounded.
- **The system pickers are never filmed.** `Attach photo` and `Attach files` open
  Android UI, which no probe tag can reach. The cut shows the chips landing in
  the composer, not the pickers.
- **The host-side authorize step is an overlay.** The one command that ran off
  camera is drawn on the key beat from `ssh-data.ts`. The phone footage does not
  contain it.

See [`capture/README.md`](./capture/README.md) and
[`render/README.md`](./render/README.md) for the details.
