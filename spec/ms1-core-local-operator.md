# Milestone 1: Core Local Operator

Status: Planned  
Roadmap: [Agent Server delivery roadmap](roadmap.md)

## Value

A local operator can register existing workspaces and delegate unrestricted
work to independent, durable Cursor agent sessions through a real local web
console.

Milestone 1 replaces the simulated prototype with a production-shaped
loopback-only system. Agent Server owns ACP sessions, persists enough protocol history
to replay and recover them, and exposes one versioned API and reconnectable
event stream for the web console and future clients.

## Delivery structure

Milestone 1 is delivered as eight independently verifiable epics on GitHub:

1. [Workspace, contracts, and server foundation](https://github.com/codenamegary/agent-server/issues/1)
2. [Operator console shell](https://github.com/codenamegary/agent-server/issues/16)
3. [Durable workspace registry](https://github.com/codenamegary/agent-server/issues/2)
4. [ACP supervision and session lifecycle](https://github.com/codenamegary/agent-server/issues/4)
5. [Journal and reconnectable event stream](https://github.com/codenamegary/agent-server/issues/3)
6. [Streamed turns and cancellation](https://github.com/codenamegary/agent-server/issues/5)
7. [Concurrent sessions and restart recovery](https://github.com/codenamegary/agent-server/issues/6)
8. [Operator console and hardening](https://github.com/codenamegary/agent-server/issues/7)

Each epic must satisfy its own acceptance, verification, migration, error, and
recovery criteria before the next dependent epic is considered complete.

## Target architecture

```text
/
├── apps/
│   ├── server/          # Fastify API, SQLite, ACP ownership, event stream
│   └── web/             # React, TypeScript, Vite, and Tailwind console
├── packages/
│   ├── contracts/       # Shared wire schemas: contracts/http and contracts/events
│   └── test-support/    # Fixtures, fake ACP process, integration helpers
├── prototype/           # Temporary behavioral and visual reference
└── spec/
    ├── ms1-core-local-operator.md
    └── roadmap.md
```

Use Bun workspaces, one root `bun.lock`, `workspace:*` internal dependencies,
Bun catalogs for shared versions, and root scripts for development, checks,
tests, and builds. Do not add a task orchestrator until measured complexity
justifies one.

Keep `apps/server` a modular monolith organized by vertical slice. Extract code
into `packages` only when it has a genuine second consumer.

## Technical decisions

### TypeScript

- Use direct imports from defining modules; do not create barrel exports.
- Use ordinary imports for values and types; do not use `import type`.
- Use immutable data, pure transformations, and `const` bindings.
- Use type aliases instead of interfaces.
- Do not introduce classes, inheritance, decorators, or `this`-based APIs.
- Define domain, API, persistence, configuration, and form models with Zod and
  infer their TypeScript types.

### Server and persistence

- Use Fastify and bind to `127.0.0.1` for milestone 1.
- Use `bun:sqlite` without an ORM.
- Apply explicit numbered SQL migrations transactionally.
- Return versioned, schema-validated API responses and structured errors.
- Emit structured logs without authentication material or secrets.

### Cursor ACP

- Agent Server owns one supervised `agent acp` subprocess and multiplexes sessions by
  internal ACP session ID.
- Negotiate capabilities and protocol version at startup.
- Implement current Cursor ACP v1 behind a small internal boundary:
  `session/new`, capability-gated `session/load`, `session/prompt`,
  `session/update`, `session/cancel`, and capability-gated `session/close`.
- Preserve a stable Agent Server API so ACP v2 `session/resume` can be added without
  changing client contracts.
- Automatically select the agent-provided one-time allow option for
  `session/request_permission`. Journal the interaction and fail explicitly if
  no permissive option exists. Do not add Agent Server approval policy or UI.

### Event journal

Maintain an append-only journal containing:

- Session-scoped outbound ACP traffic
- Session-scoped inbound ACP traffic
- Agent Server session and turn lifecycle records
- Session-associated failures

Each record includes a durable global cursor, session ID, per-session sequence,
timestamp, negotiated protocol version, direction, record kind, and raw
payload. Exclude ACP initialization, authentication traffic, and secrets.

Build session, turn, transcript, tool, permission, completion, cancellation,
and failure projections from the journal rather than maintaining a second
mutable transcript store.

### Client API and event stream

- Use `/v1/workspaces` and `/v1/sessions` as public resource terminology.
- Keep `acpSessionId` internal to the server.
- Use HTTP commands for workspace, session, prompt, and cancellation actions.
- Use a WebSocket `/v1/events` stream with durable cursor replay, optional
  workspace/session filters, bounded batches, heartbeat, backpressure, and an
  atomic replay-to-live handoff.
- Never silently substitute mock data when production services fail.

## Functional scope

Deliver:

- Register, validate, list, select, rename, and unregister existing local
  folders without modifying their contents.
- Create, list, select, rename, archive, and resume sessions by workspace.
- Stream multiple prompt turns, tool activity, and agent output.
- Cancel the active turn without ending its session.
- Run independent sessions concurrently in the background.
- Reconnect the web client and replay missed durable events.
- Resume the same underlying Cursor conversation after Agent Server restart when
  Cursor supports loading.
- Preserve history and mark sessions honestly non-resumable when loading is
  unsupported or rejected.

## Web console

Use the existing React, TypeScript, Vite, and Tailwind scaffold in `apps/web`.
Organize the application into workspace, session, chat, and connection slices.
Use shared Zod contracts at network boundaries and immutable reducers for
event-driven state.

The prototype remains a visual and behavioral reference. Do not migrate its
simulated chat timers, canned responses, approval cards, workspace pause, fake
connection tests, hardcoded metrics, or milestone 2+ controls as functional
features.

## Quality bar

Every epic includes:

- Contract and integration coverage
- Persisted-data compatibility or an explicit migration
- Structured errors and actionable logs
- A demonstrated failure and recovery path
- Critical user-journey coverage where it provides meaningful protection

Default automated tests use a deterministic fake ACP executable. Guarded
real-Cursor smoke tests run only where Cursor credentials and ACP support are
available.

The final end-to-end journey registers a folder, creates and uses two sessions,
streams output, switches without interrupting background work, cancels a turn,
restarts Agent Server, reconnects and replays events, resumes supported context, and
verifies honest fallback when resume is unavailable.

## Completion boundary

Milestone 1 is complete only when all eight epics pass their checks and the
loopback operator journey works without simulated success.

Out of scope:

- Devices and pairing
- Remote access
- Operational dashboard and diagnostics
- Runtime settings and allowed-root configuration
- Folder browsing and repository cloning
- GitHub and GitLab providers
- Workspace pause
- Agent Server-level approvals
- Transcript search, export, branching, and duplication
- Installers, desktop shells, and containers
