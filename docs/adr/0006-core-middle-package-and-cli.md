# Core middle package and the Harold CLI

Status: Accepted  
Related: [ADR-0000 Harold](0000-harold.md), [Epic #313](https://github.com/codenamegary/harold/issues/313)

HTTP becomes the device-only API. Android and pairing keep the `/v1` edge. The
operator gets a first-party CLI. Server routes and the CLI consume one shared
middle package. Status is the exemplar slice: the daemon publishes live state,
the CLI reads it, and no host HTTP route is involved.

## Decision

1. `packages/core` is the middle package. It holds ports, curried use cases,
   and transport-generic adapters. It depends on `contracts` and zod only. No
   Fastify, no database driver, no terminal I/O crosses into it.
2. `apps/cli` is the operator surface. The workspace package is `harold`. It
   uses commander for the command surface, picocolors for output, and
   @clack/prompts for interactive flows.
3. `harold serve` boots the server composition root in the CLI process. One
   process, one daemon.
4. Live daemon state travels through a state file. The daemon writes
   `<dataDir>/daemon-state.json` with `pid`, `writtenAt`, and the status
   projection. Writes are atomic (temp file plus rename), one at startup, one
   per second, none after shutdown stops the writer.
5. The CLI reads the state file through core and checks the writing pid with
   signal 0. Missing file or dead pid means "not running". The CLI never
   learns live state from an HTTP route.
6. DB-backed operations (workspaces, devices, agent settings) run in the CLI
   in process through core against the same SQLite database. CLI transactions
   stay short and tolerate busy locks. Batches #316 to #318 land this path.
7. Server slices keep their HTTP routes as thin wrappers. A route composes
   server adapters into a core use case. The device edge keeps
   `GET /v1/status` because Android verifies reachability against it
   (#320).
8. The daemon writes logs to a file under `<dataDir>` (default `harold.log`)
   or the operator-configured `logPath`. `harold logs` tails that file
   through core's tail slice. A null `logPath` selects the default file, not
   stdout.

9. `harold setup` guarantees a live daemon for the wizard. When none is
   running it spawns the CLI entry with `serve` detached, waits until the
   state file names that pid, and exits after the wizard. The daemon outlives
   setup. `harold stop` signals the live pid through the state file, but only
   when the heartbeat is fresh: a live pid with a stale heartbeat is treated
   as a recycled pid.

## Why not the alternatives

### Live state path

| Option                      | Verdict          | Why                                                                                                                                                                                    |
| --------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State file                  | **Selected**     | No transport to run or secure. Status, logs, and pairing fit file-shaped reads. A crashed daemon leaves a detectable stale file.                                                       |
| Unix socket admin API       | Rejected for now | A second server with lifecycle, permissions, and client code. Nothing in v1 needs request or response with the daemon. Revisit through a new ADR when a command must drive the daemon. |
| CLI calls host HTTP routes  | Rejected         | Host routes on the device edge are what this epic removes (#322).                                                                                                                      |
| CLI reads only the database | Rejected         | Live state (bind port, ACP status, started at) lives in daemon memory, not in SQLite.                                                                                                  |

### Middle package

| Option                 | Verdict      | Why                                                                                        |
| ---------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| `packages/core`        | **Selected** | Matches the workspace layout. `core` names the layer: ports and use cases both edges call. |
| `apps/server/src/core` | Rejected     | The CLI would depend on an app folder. Workspace boundaries hold only between packages.    |
| `packages/shared`      | Rejected     | "Shared" says nothing. The package is the domain middle, not a junk drawer.                |

### CLI location

| Option         | Verdict      | Why                                                                    |
| -------------- | ------------ | ---------------------------------------------------------------------- |
| `apps/cli`     | **Selected** | A shipped app next to `apps/server` and `apps/android`, not a library. |
| `packages/cli` | Rejected     | Packages in this repo are libraries. The CLI ships a bin.              |

## Consequences

- The daemon is the single writer of the state file. Readers never block it.
- `harold serve` runs in the foreground and prints the running view once the
  listener is confirmed. Logs never go to the screen. The daemon writes them
  to the default file, or the operator-configured `logPath`, and
  `harold logs` tails that file.
- `harold serve` while a daemon runs exits 1 with a warning from the same
  state file and points at `harold stop`.
- `harold setup` starts a detached daemon when none is live and exits after
  the wizard. `harold stop` stops a detached daemon; a foreground `serve`
  still stops with Ctrl+C. This reverses the #313 non-goal of no
  daemonization: setup owns a background process, and `harold stop` owns its
  lifecycle.
- The CLI opens the SQLite database for CRUD batches. WAL mode allows one
  writer at a time, so CLI writes stay short.
- The CLI depends on the `server` package for `serve`, config parsing, and
  the database path. The rename (#314) and release naming (#323) keep those
  single-sourced.
