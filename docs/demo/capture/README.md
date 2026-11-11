# Demo capture

`capture.sh` records the SSH-only phone walk. A Docker host from
[`../fake-host`](../fake-host) provides fixed git repositories, a fixed SSH
host key, and scripted ACP agents. The phone adds that host by SSH, then starts
a new session on the `cat-screensaver` feature worktree and takes one feature
from plan to draft PR. The detailed setup spec is in [setup.md](./setup.md).

| File                         | Role                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `capture.sh`                 | The whole run: fake host, emulator, app install, probe handshake, slices, build                                     |
| `mcp/src/walk.ts`            | The driver. Records the connect act through the probe's MCP tools, one `screenrecord` file per beat                  |
| `mcp/src/slices.ts`          | The canonical slice list. The driver, `capture.sh` and the render timeline all read it                               |
| `drive_phone.py`             | Legacy uiautomator driver for the old 44-slice cut. Deprecated, see below                                           |
| `build_capture.py`           | Re-encode the slices, attach the taps, and write `capture.json`                                                     |
| `mcp/`                       | MCP control plane: drive the debug app by tag and intent instead of uidumps, plus the proof-of-concept run          |
| `push_assets.sh`             | Push the demo photos, `cat-mode.md`, and `cat-diary.txt` onto the factory-reset emulator                            |
| `fixtures/cat-screensaver/`  | The seed project copied into the fake host repository                                                               |
| `../fake-host/`              | Docker SSH host, fake agent transcripts, fixed host key, and seeded `~/.harold` state                               |

`assets/cats.zip` holds the demo photos. `assets/cat-mode.md` is the spec
attachment for the feature. `assets/cat-diary.txt` is kept for other demos.

## What is kept and what is not

- **Kept, committed:** everything in this directory plus
  `docs/demo/render/public/slices/` and `docs/demo/render/public/capture.json`.
- **Not kept:** `docs/demo/work/capture/` (logs, raw slices, marks,
  screenshots).

## How to run

Needs `bun`, `docker` with Compose, `git`, `adb`, `node`, `ffmpeg`, `ffprobe`,
`python3`, `unzip`, a JDK, and the Android SDK with the 36.5+ emulator at
`~/android/emulator` (set `EMULATOR` to override). Audio is not used.

```sh
bash docs/demo/capture/capture.sh
```

Re-record one slice, or a few, without recording the rest:

```sh
bash docs/demo/capture/capture.sh --only connect_fill
bash docs/demo/capture/capture.sh --only connect_trust,connect_save
```

A `--only` run still drives the app to reach the named slices, records nothing
else, and exits once they are done. It skips the full-set check and the
`capture.json` rebuild. Each file keeps its `NNN-<name>.mp4` name from the plan,
so a later full run sees the same slice as before.

The driver also runs on its own, without the emulator bring-up:

```sh
cd docs/demo/capture/mcp
bun run src/walk.ts --list                      # print the beat plan
bun run src/walk.ts --self-test                 # stub only, no device
bun run src/walk.ts --only connect_fill         # needs a device and a token
```

To run it directly you need the probe token from logcat and the port
forwarded:

```sh
adb forward tcp:7391 tcp:7391
export HAROLD_PROBE_TOKEN=$(adb logcat -d -s HaroldProbe:I \
  | sed -n 's/.*token=\([0-9a-f]*\).*/\1/p' | tail -n 1)
cd docs/demo/capture/mcp && bun run src/walk.ts --only connect_fill
```

`capture.sh` does both steps for you.

The fake host listens on `127.0.0.1:2223` by default
(`HAROLD_DEMO_SSH_PORT`). The emulator reaches it through
`adb reverse tcp:2223 tcp:2223`. The host accepts public key authentication
only and has no demo password. The app generates its key, and the driver
authorizes the public key shown in the form before `Test connection`:

```sh
docker exec -i harold-demo-host add-authorized-key '<ssh-ed25519 ... comment>'
docker exec -i harold-demo-host reset-authorized-keys
```

`reset-authorized-keys` clears the key set before a run. Both commands, their
compose forms, and the key contract are documented in
[`../fake-host/README.md`](../fake-host/README.md).

The capture keeps these fixed resources:

- Fake host container: `harold-demo-host`, compose project `harold-demo`
- SSH endpoint: `127.0.0.1:2223`, user `gary`
- Host key: `SHA256:iKE0VpdoZwc0iRm1SFqsMzAm89GgjOX+tBGfqa4dJ8s`
- Worktree: `/home/gary/sites/cat-screensaver-worktrees/cat-mode` on
  `feat/cat-mode`
- Workspace name for the worktree: `cat-screensaver`
- Emulator AVD: `agent_server_api34`

Each run recreates the host container, which resets the home directory,
repositories, agent history, and fake PR. It stops only the capture emulator,
never a phone or another AVD.

`capture.sh` writes `docs/demo/render/public/slices/` and
`docs/demo/render/public/capture.json`. Preview or render from
`docs/demo/render`:

```sh
bun install
bun run dev
bun run render
```

## How it works

The connect act has one pre-roll beat and seven recorded slices.

The pre-roll beat is `boot`. It waits for the probe to answer, opens the host
form, reads the generated public key out of the form facts, authorizes that key
on the fake host, and scrolls to the bottom of the form. It is never recorded.

| # | Slice | What the picture shows |
| --- | --- | --- |
| 001 | `connect_empty` | The empty host form |
| 002 | `connect_key` | The generated public key |
| 003 | `connect_fill` | Host, user, port and name typed one character at a time |
| 004 | `connect_test` | Test connection, then the host key fingerprint |
| 005 | `connect_trust` | Trust the fingerprint |
| 006 | `connect_save` | Save the host |
| 007 | `landing` | The app leaves the form and lands on chat |

[`mcp/src/slices.ts`](./mcp/src/slices.ts) is the only list of these names. The
driver records exactly them, `verify_slices` in `capture.sh` checks the manifest
against them, and the Remotion timeline reads the same names out of
`capture.json`.

The driver is [`mcp/src/walk.ts`](./mcp/src/walk.ts). It drives the app through
the probe's MCP tools. Every tap is a real adb tap resolved from a tag, and
every keystroke runs inside the app. There is no uiautomator dump in the loop.

Per slice the driver:

1. clears the device mark ledger with `harold_clear_marks`
2. samples the device clock with `harold_anchor`, paired with a host timestamp
3. starts `screenrecord` for `/data/local/tmp/harold-demo-NNN-<name>.mp4`
4. runs the head calibration blink: sleep, hold, wake, dismiss keyguard
5. runs the beat, waiting on facts instead of sleeping
6. samples the device clock again
7. runs the tail blink, stops the recorder, and pulls the file
8. converts the device marks to host time and appends them to `marks.log`

Waits are on facts. `harold_wait` blocks on `fingerprint`, `trusted` or
`settled`, and the landing beat polls the screen id. The only fixed waits are
named cosmetic holds that decide how long the picture rests on a state.

The blink is the contract `build_capture.py` measures. The screen sleeps, holds
black, wakes, and dismisses the keyguard. The driver writes
`sync_wake <monotonic>` with the host stamp taken just before the sleep
keyevent, exactly as the Python driver did, so `blackdetect` can find the split
and the drift between the two blinks.

Typing is per character. Each character writes a `key` mark on the device
clock, and the end of the run writes `keys_done`. `marks.log` keeps the grammar
the Python driver wrote, so `build_capture.py` reads it unchanged:

```
tap <mono> <x> <y>
key <mono>
sync_wake <mono>
<name> <mono>
```

The driver writes those rows in host time order. Device marks arrive after the
beat that produced them, so each slice is buffered and sorted before it is
appended. `build_capture.py` pairs every `key` run with the `keys_done` that
closes it, and it rejects a slice whose marks go backwards.

### Device clock to host clock

Probe marks carry `SystemClock.elapsedRealtimeNanos()`. That number means
nothing to the host on its own. Each slice takes at least two anchor samples.
The driver fits a straight line from device seconds to host seconds and applies
it to every mark in that slice. A normal slice has three anchors: one before the
head blink, one after it, and one before the tail blink.

The driver aborts the slice, and names it in the error, when:

- there are fewer than two anchors, or an anchor round trip is over 500 ms
- the fitted slope leaves (0.99, 1.01)
- the fit residual is over 50 ms
- a device mark goes backwards in time
- a mark sits more than 2 s outside the anchor bracket
- a mark maps more than 2 s outside the recorded window

`work/capture/walk-report.json` records every slice's raw anchors, slope, offset
and residual.

### Why it is fast

The MCP loop covers the connect act in about 9.5 s. The old uiautomator driver
needed 455 s for the same flow, because it dumped and parsed a full view tree
between actions and slept instead of waiting on state.

### Tests, no device

```sh
cd docs/demo/capture/mcp
bun test                 # clock fit, marks rows, slice plan, beats
bunx tsc --noEmit        # types
bun run src/walk.ts --self-test
```

`--self-test` runs all eight beats against an in-memory stub of the probe,
checks the tool sequence, converts the typed marks through anchors, and prints
the marks row count.

## `capture.json` v2 and sync offsets

`build_capture.py` measures each slice's calibration blink and writes the v2
payload. The top level is still `{width, height, slices}`.

| Field | Meaning |
| --- | --- |
| `name`, `file`, `width`, `height`, `still` | unchanged |
| `durationSec` | the published file's own duration, after the head trim |
| `trimSec` | seconds cut off the raw head, `v_end + GUARD` (GUARD = 0.05) |
| `syncOffsetSec` | diagnostic, `v_end + started - T_wake`, always in (0, 1.5) |
| `taps[].atSec` | seconds into the published file; `x`/`y` stay device pixels |
| `keys[].atSec` | seconds into the published file, strictly increasing |
| `marks[].name`, `marks[].atSec` | the `mark()` rows that landed inside the slice |

Time mapping. `T_wake` is the `sync_wake` stamp, `started` comes from
`slices.json`, `v_end` is the frame where the display comes back (blackdetect's
`black_end`):

```
trimSec       = v_end + GUARD
atSec(T)      = (T - T_wake) + v_end - trimSec = (T - T_wake) - GUARD
syncOffsetSec = v_end + started - T_wake
```

Each slice is located twice, with `blackdetect=d=0.10:pic_th=0.98:pix_th=0.0176`
(luma 20.5) and with a per-frame `signalstats` test that needs both a low mean
(`YAVG <= 20`) and dark coverage (`YHIGH <= 20`, the 90th percentile). True
black measures `YAVG` 16.16; the darkest dark-theme UI in this capture is
26.1, so a scrim cannot be read as a blink. It is then re-encoded with
output seeking and `-an -c:v libx264 -crf 20 -fps_mode cfr -r 60`, so Remotion's
frame-index seeks land on exact frames. Keys are sorted and floats are rounded
to 3 dp, so re-running on the same inputs writes a byte-identical file.

The build aborts, with no clamping and no defaults, when a slice:

- has no black run, more than one black run, a run shorter than 0.15 s, or a run
  that starts after 6 s;
- has blackdetect and signalstats disagreeing on an edge by more than 0.08 s;
- has `syncOffsetSec` outside (0, 1.5);
- has any `atSec` outside `[0, durationSec]`, or a published duration below 0.3 s;
- has a `key` run that no `keys_done` mark closes;
- would need more than 15 clicks/s to show its keys.

That last limit is the plan's pacing policy: 2 frames between clicks at 30 fps is
15 clicks/s, and a faster recording cannot be shown at 30 fps. Narrow the typing
window instead of raising the rate. The build prints every typing slice's
character count, measured cadence and shortest shot at 15 clicks/s.

Rebuild from slices already pulled, without a device:

```sh
python3 docs/demo/capture/build_capture.py
```

It reads `docs/demo/work/capture/` (`slices.json`, `marks.log`, `slices/`) and
writes `docs/demo/render/public/` (`capture.json`, `slices/`). `WORK` and
`PUBLIC` override those paths.

The sync math and every abort above are covered by synthetic slices, no device
and no adb:

```sh
python3 -m unittest discover -s docs/demo/capture -p 'test_build_capture.py' -v
```

## Slice list

Pre-roll, never recorded: `boot`

Recorded, in order: `connect_empty`, `connect_key`, `connect_fill`,
`connect_test`, `connect_trust`, `connect_save`, `landing`

The names, the order and the pre-roll or on-camera kind live in
[`mcp/src/slices.ts`](./mcp/src/slices.ts). Ask that file, never a copy:

```sh
cd docs/demo/capture/mcp
bun run src/slices.ts --names    # one name per line, recorded slices only
bun run src/slices.ts --json     # the whole plan with titles and kinds
```

## The old driver

`drive_phone.py` is the uiautomator driver for the earlier 44 slice cut. It
covered the whole app: connect, session start, plan, build, changes, worktrees
and the draft PR. It is kept and marked deprecated, because that cut has no MCP
replacement yet. The probe instruments only the SSH setup screen, so the rest
of the app cannot be driven through MCP today. `capture.sh` no longer calls it,
and git history holds every earlier revision.

Check its escape helper without a device:

```sh
python3 docs/demo/capture/drive_phone.py --self-test
```
