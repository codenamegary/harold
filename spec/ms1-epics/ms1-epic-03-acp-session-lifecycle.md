# Milestone 1 Epic 03: ACP Supervision and Session Lifecycle

Status: Planned  
Milestone: 1 — Core local operator

## Outcome

Make Relay the sole owner of a supervised Cursor ACP process and provide
durable session lifecycle operations for registered workspaces.

At completion, an operator can create, list, inspect, rename, archive, and
resume sessions. Streaming prompts are delivered in a later epic.

## Dependencies

- [Epic 01: Workspace, Contracts, and Server Foundation](ms1-epic-01-workspace-contracts-server.md)
- [Epic 02: Durable Workspace Registry](ms1-epic-02-durable-workspace-registry.md)
- SQLite migration infrastructure

## ACP boundary

Create functional adapters under `apps/server/src/acp` for:

- Spawning one supervised `agent acp` subprocess
- Newline-delimited JSON-RPC over stdin and stdout
- Request ID allocation and response correlation
- `initialize` and capability negotiation
- Cursor authentication
- `session/new`
- `session/load` when advertised
- `session/close` when advertised
- `session/update` and process lifecycle notifications
- Protocol errors, malformed output, timeouts, exit, and restart

Implement Cursor ACP v1 behind a small internal protocol boundary. Preserve the
negotiated protocol version so ACP v2 `session/resume` can be supported later
without changing Relay's public session API.

Do not expose raw ACP identifiers as public resource identifiers.

## Permission requests

Relay does not add an approval workflow. When Cursor emits
`session/request_permission`:

- Select the agent-provided one-time allow option.
- Record the request and response for the event journal introduced in epic 04.
- Continue without pausing for web approval.
- Fail the active operation explicitly if no permissive one-time option exists.

Do not persist authentication messages or secrets.

## Session vertical slice

Create `apps/server/src/sessions` with colocated models, persistence, behavior,
transport, and tests.

Persist at least:

- Relay session ID
- Workspace ID
- Internal ACP session ID
- Display name
- Lifecycle and resumability state
- Created, updated, archived, and last-active timestamps
- Negotiated ACP protocol version

Support:

- Creating a session for an available registered workspace
- Listing sessions by workspace
- Reading one session
- Renaming a session
- Archiving a session while retaining its history and ACP binding
- Resuming an archived or disconnected session with `session/load` when
  supported
- Marking unsupported or rejected loads honestly as non-resumable

## HTTP API

Expose:

- `GET /v1/workspaces/:workspaceId/sessions`
- `POST /v1/workspaces/:workspaceId/sessions`
- `GET /v1/sessions/:id`
- `PATCH /v1/sessions/:id`
- `POST /v1/sessions/:id/archive`
- `POST /v1/sessions/:id/resume`

## Test support

Add a deterministic fake ACP executable in `packages/test-support` that can:

- Negotiate configurable capabilities
- Create and load sessions
- Emit updates and permission requests
- Return malformed messages and protocol errors
- Delay responses or exit unexpectedly
- Record received requests for assertions

Keep a guarded real-Cursor smoke test outside the default CI suite.

## Acceptance criteria

- Relay starts, initializes, and authenticates one ACP subprocess.
- Multiple Relay session records can map to distinct ACP session IDs.
- Creating a session uses the selected workspace's canonical path as ACP `cwd`.
- Session metadata survives Relay restarts.
- Rename and archive do not lose the ACP session binding.
- Resume uses `session/load` only when capability negotiation permits it.
- Unsupported or failed resume never appears successful.
- Permission requests are answered with the one-time allow option and are not
  presented as Relay approvals.
- ACP startup and protocol failures produce structured server errors and
  actionable logs without leaking secrets.

## Verification

- Unit tests cover JSON-RPC framing, correlation, timeout, malformed output,
  and capability interpretation.
- Integration tests cover create, list, read, rename, archive, supported load,
  unsupported load, and rejected load.
- Process tests cover ACP exit, supervised restart, and graceful Relay shutdown.
- The real-Cursor smoke test verifies initialize, authenticate, new session,
  and load when locally available.

## Failure and recovery

- ACP process exit marks active bindings disconnected before restart.
- Relay does not create duplicate session records when a command is retried.
- A failed resume preserves persisted metadata and reports non-resumable state.
- Graceful Relay shutdown closes or detaches ACP resources without deleting
  Cursor conversation history.

## Out of scope

- Prompt submission
- Live output streaming
- Cancellation
- WebSocket replay
- Concurrent foreground turns
- Restart reconstruction of active turns
- Relay approval policy or UI
