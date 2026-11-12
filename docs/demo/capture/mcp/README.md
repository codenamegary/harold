# Probe MCP

An MCP control plane for the Harold debug app, built so an agent can drive the
phone in one round trip per intent instead of dumping and parsing uiautomator
trees.

The proof is in [`run-poc.sh`](./run-poc.sh): it adds an SSH connection to the
real app using only MCP tool calls, and records the screen while it happens. The
full walk, from launching the app to landing on the chat screen, runs in about
nine seconds.

## Why MCP lives on the host

MCP is a wire shape, not a capability. Implementing `initialize`, `tools/list`,
and `tools/call` in Kotlin would hard-code a protocol version inside an APK and
put a network listener in a binary whose pitch is "your keys, your host".

So the split is:

| Layer | Where | What it does |
| --- | --- | --- |
| MCP server | host, this package | tool schemas, validation, adb gestures, waiting |
| Control plane | debug APK only | `127.0.0.1:7391`, plain JSON, four routes |
| Probe registry | app process | per-screen facts, named actions, control rects |

```mermaid
flowchart LR
    A[Agent] --> B[MCP server on host]
    B --> C[HTTP client]
    C -->|adb forward 7391| D[ProbeServer in debug APK]
    D --> E[Probe registry]
    E --> F[ViewModel intents and UiState]
    B --> G[adb shell input tap, swipe, and text]
    G --> H[Emulator or device]
```

## Device side

Three files, all inert unless the debug initializer runs.

| File | Role |
| --- | --- |
| [`Probe.kt`](../../../../apps/android/design/src/main/java/harold/android/ui/debug/Probe.kt) | `ScreenProbe` contract, control and mark registry, `Modifier.probeTag` |
| [`SshSetupProbe.kt`](../../../../apps/android/connections/src/main/java/harold/android/connections/SshSetupProbe.kt) | adapter for the SSH host form |
| [`ProbeServer.kt`](../../../../apps/android/app/src/debug/java/harold/android/debug/ProbeServer.kt) | loopback HTTP routes, token, JSON |

- `GET /screen` returns the screen id, state facts, `settled`, and every control
  with its device-pixel rect.
- `POST /intent` runs a named action and returns the new snapshot plus the marks
  it produced.
- `GET /marks` and `POST /marks/clear` handle the device clock ledger.
- `POST /anchor` still samples `elapsedRealtimeNanos`. The walk leaves that route alone.

The walk types with adb. It taps the field once, waits about 150 ms, then sends
one `adb shell input text` per character. It stamps `key` on the host clock
before each character and `keys_done` at the end of the field. On-camera text
is that adb input. [`build_capture.py`](../build_capture.py) still reads that
grammar.

## Tools

| Tool | Purpose |
| --- | --- |
| `harold_screen` | screen id, facts, settled flag, controls with rects |
| `harold_tap` | resolve a tag to its rect, issue a real adb tap |
| `harold_scroll_to` | swipe until the tag has non-zero bounds |
| `harold_type` | focus a field and type it with adb, one character at a time |
| `harold_set` | instant set, pre-roll only |
| `harold_intent` | non-gesture actions such as `test_connection` and `save` |
| `harold_wait` | block on a fact or on `settled`, replacing blind sleeps |
| `harold_navigate` | reach a route by intent, for pre-roll only |
| `harold_marks` / `harold_clear_marks` | read and reset the device ledger |

Anything the video is supposed to show happening goes through `harold_tap` or
`harold_type`. `harold_set` and `harold_navigate` are for reaching a slice, never
for the slice itself, otherwise the demo can show a flow a user cannot walk.

## Run it

```sh
# emulator up, then
ANDROID_SERIAL=emulator-5554 bash docs/demo/capture/mcp/run-poc.sh
```

That builds and installs `harold.android.debug` on the selected device only,
starts the fake host, reverses port 2223, forwards port 7391, cold starts the
app, reads the probe token from logcat, records the screen, runs the walk, and
pulls the video.

Artifacts land in `docs/demo/work/probe-poc/`:

- `poc.mp4` the recording
- `report.json` every step with its tool response, plus all device marks
- `final.png` the screen after the save

To wire an agent to the same server yourself:

```sh
HAROLD_PROBE_TOKEN=<from adb logcat -s HaroldProbe:I> bun run src/server.ts
```

`src/server.ts` is a stdio MCP server. Point any MCP client at it.

Wiring check with no device:

```sh
bun run src/smoke.ts
```

## The capture walk

[`src/walk.ts`](./src/walk.ts) is the driver `capture.sh` uses now. It records
the connect act as one `screenrecord` file per beat and writes the artifacts
`build_capture.py` already reads.

```sh
bun run src/walk.ts --list                    # the beat plan
bun run src/walk.ts --self-test               # stub only, no device, no adb
bun run src/walk.ts --only connect            # one slice
bun run src/walk.ts                           # every on-camera beat
```

| Flag | Meaning |
| --- | --- |
| `--list` | print the beat plan and exit |
| `--only <a,b>` | record these slices only. Repeatable |
| `--self-test` | run every beat against an in-memory stub |
| `--out <dir>` | where the artifacts go. Default `docs/demo/work/capture` |
| `--emulator-serial <sn>` | adb serial to drive |

### The token comes from logcat

The debug APK prints its port and token when the probe starts. The walk reads
the token from the environment, and `capture.sh` fills it in:

```sh
adb forward tcp:7391 tcp:7391
export HAROLD_PROBE_TOKEN=$(adb logcat -d -s HaroldProbe:I \
  | sed -n 's/.*token=\([0-9a-f]*\).*/\1/p' | tail -n 1)
```

`connectProbe` refuses to start without a token, so a stale shell fails at once
instead of collecting a page of 401s.

### What one slice writes

1. `screenrecord` on `/data/local/tmp/harold-demo-NNN-<name>.mp4`
2. the head blink, then the beat
3. the tail blink, then the recorder stops
4. closed key runs checked, then the rows appended to `marks.log`
5. the mp4 pulled to `<out>/slices/NNN-<name>.mp4`

`<out>/slices.json` holds `{index, name, file, remote, started, ended}`.
`<out>/walk-report.json` holds every step and each slice's window and key count.

### Key rows use the host clock

The walk stamps `key` with `performance.now()` before each `adb shell input text`.
It stamps `keys_done` when the field is done. `sync_wake` and `slice_start` use
that same clock.

The field must already be empty. The walk reads the fact after the run and fails
unless it equals the typed string. `composerText` is the chat fact. SSH facts are
`host`, `user`, `port`, and `name`.

`build_capture.py` maps those host stamps onto the video with the calibration
blinks. That drift math is unchanged.

## What the POC showed

Same connect flow the old driver took four hundred and fifty five seconds to
cover, in nine and a half seconds:

| Step | Time |
| --- | --- |
| navigate to the form | 0.8 s |
| type name, host, user, port | 2.4 s total |
| read the generated public key from facts | 2.4 s |
| scroll and tap Test connection | 5.6 s |
| fingerprint present | 6.2 s |
| trust, save, land on chat | 9.5 s |

There is no uidump anywhere in that path.

## Limits, on purpose

- Adding a screen is a `ScreenProbe` adapter plus tags.
- Compose reports an empty rect for a fully clipped control, so a tag alone is
  not enough to tap something below the fold. `harold_scroll_to` covers it and
  `harold_tap` refuses to tap a zero-sized control rather than clicking at 0,0.
- `harold_type` taps the field and types with `adb shell input text`. The field
  must already be empty. The walk calls the same function.
- The renderer's ripple layer still needs `taps[].x/.y`. `harold_tap` returns the
  coordinates it used so they can be written into `capture.json`.
- Key rows are host timestamps. The walk writes them while it types.
- A loopback listener exists only in debug source. `Probe.enabled` starts false
  and only `ProbeInitializer`, which is in the debug manifest, turns it on.
