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
bash docs/demo/capture/capture.sh --only connect
bash docs/demo/capture/capture.sh --only home_empty,connect
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
bun run src/walk.ts --only connect              # needs a device and a token
```

To run it directly you need the probe token from logcat and the port
forwarded:

```sh
adb forward tcp:7391 tcp:7391
export HAROLD_PROBE_TOKEN=$(adb logcat -d -s HaroldProbe:I \
  | sed -n 's/.*token=\([0-9a-f]*\).*/\1/p' | tail -n 1)
cd docs/demo/capture/mcp && bun run src/walk.ts --only connect
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

The connect act has one pre-roll beat and three recorded slices.

The pre-roll beat is `boot`. It waits for the probe to answer on the empty home.
It is never recorded. The generated public key is authorised after Add
connection opens the form, still inside the `connect` slice.

| # | Slice | What the picture shows |
| --- | --- | --- |
| 001 | `home_empty` | The empty home, no connections yet |
| 002 | `connect` | Add connection, type the host, scroll, test, trust, save |
| 003 | `landing` | The app leaves the form and lands on chat |

[`mcp/src/slices.ts`](./mcp/src/slices.ts) is the only list of these names. The
driver records exactly them, `verify_slices` in `capture.sh` checks the manifest
against them, and the Remotion timeline reads the same names out of
`capture.json`.

The driver is [`mcp/src/walk.ts`](./mcp/src/walk.ts). It drives the app through
the probe's MCP tools. Every tap is a real adb tap resolved from a tag. Every
on-camera character is one `adb shell input text` into the focused field.

Per slice the driver:

1. starts `screenrecord` for `/data/local/tmp/harold-demo-NNN-<name>.mp4`
2. runs the head calibration blink: sleep, hold, wake, dismiss keyguard
3. runs the beat and waits on facts
4. runs the tail blink, stops the recorder, and pulls the file
5. checks that every `key` run has a `keys_done`, then appends the rows to `marks.log`

Waits are on facts. `harold_wait` blocks on `fingerprint`, `trusted`, or
`settled`. The landing beat polls the screen id. The only fixed waits are
named cosmetic holds that decide how long the picture rests on a state.

The blink is the contract `build_capture.py` measures. The screen sleeps, holds
black, wakes, and dismisses the keyguard. The driver writes `sync_wake` with
the host stamp of the wake. `build_capture.py` uses the two blinks to map that
host clock onto the video.

Typing focuses the field with one tap, waits about 150 ms, then sends one
character per `adb shell input text`. The driver stamps `key` on the host clock
before each character. It stamps `keys_done` when the field is done. The field
must already be empty. A prefilled value is cleared in pre-roll with an instant
set. The port field starts at 22, so `boot` clears it. After the run the driver
reads the field fact and fails unless it equals the typed string.

`marks.log` keeps this grammar:

```
tap <mono> <x> <y>
key <mono>
sync_wake <mono>
<name> <mono>
```

The driver writes a slice's rows in host time order. `build_capture.py` pairs
every `key` run with the `keys_done` that closes it. Four SSH fields are four
closed runs.

### Host clock and the video

`key`, `tap`, and `sync_wake` rows are host timestamps from the walk.

`build_capture.py` still maps those host stamps onto the published video. It
measures the two calibration blinks and applies the same drift math as before.

`work/capture/walk-report.json` records each slice's window and key count.

### Why it is fast

The MCP loop covers the connect act in about 9.5 s. The old uiautomator driver
needed 455 s for the same flow, because it dumped and parsed a full view tree
between actions and slept instead of waiting on state.

### Tests, no device

```sh
cd docs/demo/capture/mcp
bun test                 # typing escape, marks rows, slice plan, beats
bunx tsc --noEmit        # types
bun run src/walk.ts --self-test
```

`--self-test` runs every beat against an in-memory stub of the probe. It checks
the tool sequence and the host-stamped `marks.log` rows.

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
- has a `key` run that no `keys_done` mark closes.

The build prints how fast each typing slice was. It does not reject a speed.

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

Recorded, in order: `home_empty`, `connect`, `landing`

The names, the order and the pre-roll or on-camera kind live in
[`mcp/src/slices.ts`](./mcp/src/slices.ts). Ask that file, never a copy:

```sh
cd docs/demo/capture/mcp
bun run src/slices.ts --names    # one name per line, recorded slices only
bun run src/slices.ts --json     # the whole plan with titles and kinds
```

## The old driver

`drive_phone.py` is the old uiautomator driver. `capture.sh` drives the walk in
`mcp/src/walk.ts`.

The old file still has an escape self-test. The capture uses the helper in
`mcp/src/input.text.ts`. `bun test` in `mcp/` covers that helper.

Check the old helper without a device:

```sh
python3 docs/demo/capture/drive_phone.py --self-test
```
