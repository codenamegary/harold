# Milestone 1 Epic 02: Durable Workspace Registry

Status: Planned  
Milestone: 1 — Core local operator

## Outcome

Let a local operator register, inspect, select, and unregister existing folders
through a real API and web flow.

Workspace metadata survives Relay restarts. Unregistering a workspace never
modifies or deletes its files.

## Dependencies

- [Epic 01: Workspace, Contracts, and Server Foundation](ms1-epic-01-workspace-contracts-server.md)
- Shared workspace and error contracts
- Loopback Fastify server

## Scope

### SQLite foundation

- Use `bun:sqlite`.
- Add explicit, numbered SQL migrations and a schema-version table.
- Apply pending migrations transactionally during startup.
- Add a repository-owned database location suitable for local development.
- Parse rows and write inputs with Zod at the persistence boundary.
- Do not add an ORM.

### Workspace vertical slice

Create `apps/server/src/workspaces` with colocated models, persistence,
behavior, transport, and tests.

Support:

- Registering an absolute path to an existing local directory
- Canonicalizing paths before uniqueness checks
- Listing registered workspaces
- Reading one workspace
- Renaming workspace display metadata
- Selecting a workspace in the web client
- Reporting a previously registered path as missing or unavailable
- Unregistering workspace metadata without touching the directory

Workspace roots and per-workspace security policy remain deferred. Milestone 1
may register any existing directory accessible to the Relay process.

### HTTP API

Expose:

- `GET /v1/workspaces`
- `GET /v1/workspaces/:id`
- `POST /v1/workspaces`
- `PATCH /v1/workspaces/:id`
- `DELETE /v1/workspaces/:id`

All requests and responses use schemas from `packages/contracts`.

### Web flow

Add a workspace feature slice under `apps/web/src/features/workspaces`:

- Fetch and render registered workspaces.
- Register a folder by absolute path.
- Display validation and server errors.
- Select a workspace for later session operations.
- Unregister after explicit confirmation.
- Show missing or unavailable state honestly.

Do not retain a mock-data fallback that appears successful when the server is
unavailable.

## Data model

Persist at least:

- Relay workspace ID
- Display name
- Canonical absolute path
- Availability state
- Created and updated timestamps

Derive current availability from the filesystem when appropriate rather than
treating stale persisted state as authoritative.

## Acceptance criteria

- Registering an existing directory returns a durable workspace.
- Relative paths, files, missing paths, and unreadable directories return
  structured errors.
- Equivalent canonical paths cannot be registered twice.
- A registered workspace remains listed after a server restart.
- A path removed outside Relay appears missing or unavailable without losing
  its workspace record.
- Unregistering removes only Relay metadata and leaves all files unchanged.
- The web flow uses the production API and clearly displays disconnected,
  loading, empty, success, and error states.
- No folder browser, cloning, provider integration, workspace pause, or policy
  controls are introduced.

## Verification

- Migration tests cover a new database, repeated startup, and rollback on
  failure.
- Integration tests use temporary directories for registration, canonical path
  deduplication, missing paths, rename, list, read, and unregister.
- A restart test verifies durable workspace metadata.
- Web tests cover registration validation, selection, unavailable state, and
  unregister confirmation.

## Failure and recovery

- A failed migration prevents startup and reports the migration identifier.
- A transient filesystem failure does not delete workspace metadata.
- Retrying a registration request cannot create duplicate canonical paths.
- Database writes are transactional.

## Out of scope

- ACP integration
- Session creation
- Event streaming
- Chat
- Allowed-root configuration UI
- Folder browsing
- Repository cloning
