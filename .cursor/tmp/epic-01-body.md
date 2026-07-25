## Outcome

Establish the production Bun monorepo, shared Zod contracts, and loopback-only Fastify server boundary required by every later MS1 epic.

## Scope

- Root Bun workspace with one lockfile and shared dependency catalog
- `apps/server`, existing `apps/web`, and `packages/contracts`
- Versioned API, error, health, workspace, session, and event schemas
- `GET /v1/status`, structured logs/errors, and graceful shutdown
- Contract and server integration tests

## Done when

The repository installs and checks from the root, the schema-validated health endpoint works on loopback, shutdown leaves no open listener, and no milestone 2+ behavior appears production-ready.

Source specification: `spec/ms1-epics/ms1-epic-01-workspace-contracts-server.md`

## Build spec

### Scope

Delivers the production monorepo skeleton, shared MS1 contract package, and a loopback-only Fastify server with one live endpoint.

**In scope**

- Root `package.json` with Bun workspaces (`apps/*`, `packages/*`), catalogs, and root scripts (`install`, `dev`, `check`, `test`, `lint`, `build`)
- Shared oxlint config enforcing typescript-dev conventions where oxlint supports them
- Migrate `apps/web` from npm to the Bun workspace (remove `package-lock.json`, one root `bun.lock`)
- `packages/contracts` with MS1 Zod schemas for status, errors, workspaces, sessions, and events
- `apps/server` modular monolith with vertical slices, bound to `127.0.0.1`
- `GET /v1/status` returning schema-validated MS1 status skeleton
- Structured JSON errors for validation and internal failures
- Pino structured logging (no secrets or auth material)
- Graceful shutdown on SIGINT/SIGTERM (drain, close listener, exit clean)
- Contract unit tests and server integration tests

**Not in scope**

- SQLite, migrations, or persistence (epic 2)
- Workspace or session HTTP routes (epics 2 and 3)
- ACP subprocess, journal, or WebSocket event stream (epics 3–4)
- Web console features beyond existing scaffold (epic 7)
- M2+ contract resources (devices, pairing, settings, approvals, connection modes)
- `packages/test-support` (add when a second consumer needs it)

### Slices

**Monorepo tooling**

- Root workspace config, catalogs (`zod`, `typescript`, `fastify`, `oxlint`), and filter scripts
- Shared TypeScript config baseline where useful
- `apps/web` absorbed into workspace without functional UI changes
- Root `.oxlintrc.json` with typescript-dev rules. Workspace configs extend it

**Linting (oxlint)**

Shared root config enforces conventions from `typescript-dev` where oxlint has rules:

| Convention | Oxlint rule | Config |
|------------|-------------|--------|
| No `import type` | `typescript/consistent-type-imports` | `prefer: no-type-imports` |
| `type` over `interface` | `typescript/consistent-type-definitions` | `"type"` |
| No classes | `max-classes-per-file` | `max: 0` |
| No extraneous classes | `typescript/no-extraneous-class` | error |
| No barrel exports | `oxc/no-barrel-file` | `threshold: 0` |
| `const` over `var` | `prefer-const`, `no-var` | error |

Not enforceable by lint (code review and architecture):

- Ban all `let` (oxlint has no `no-let` rule; `prefer-const` only covers reassignable bindings)
- No decorators
- Vertical slice folder layout
- Zod models at system boundaries

`apps/web` adds React plugin rules on top of the shared config.

**`packages/contracts`**

- One schema module per resource boundary (status, error, workspace, session, event)
- Direct imports only, no barrel exports
- Types inferred from Zod schemas
- Contract tests that parse representative valid and invalid payloads

**`apps/server` — bootstrap slice**

- Server factory that creates a configured Fastify instance
- Config parsed from env with Zod (`RELAY_HOST` default `127.0.0.1`, `RELAY_PORT` default `3847`)
- Signal handlers wired to graceful shutdown
- Pino logger attached at creation

**`apps/server` — status slice**

- `GET /v1/status` handler
- Response built from runtime state and parsed through `StatusSchema`
- `acp.state` reports `stopped`, `acp.activeSessions` reports `0` until later epics wire real values

**`apps/server` — error slice**

- Shared error envelope schema in contracts
- Fastify error handler maps Zod validation failures and unexpected errors to structured responses
- Consistent HTTP status codes (400 validation, 500 internal)

### Contracts

Public API version prefix: `/v1`.

**Status** (`StatusSchema`)

- `version` — server package version
- `state` — `starting` | `online` | `shutting_down` | `offline`
- `bindAddress` — `127.0.0.1`
- `port` — configured listen port
- `startedAt` — ISO timestamp
- `uptimeSeconds` — non-negative integer
- `acp.state` — `stopped` | `starting` | `ready` | `error` (epic 1 always `stopped`)
- `acp.activeSessions` — non-negative integer (epic 1 always `0`)

**Error** (`ApiErrorSchema`)

- `error.code` — stable machine-readable string
- `error.message` — human-readable summary
- `error.details` — optional structured field-level validation info

**Workspace** (`WorkspaceSchema`)

- `id`, `name`, `path`, `state` (`available` | `missing` | `unavailable`)
- `createdAt`, `lastUsedAt`
- Omit prototype fields not needed for MS1 (`additionalDirectories`, agent counts)

**Session** (`SessionSchema`)

- `id`, `workspaceId`, `name`, `state` (lifecycle enum for later epics)
- `createdAt`, `lastUsedAt`, `archivedAt`
- No `acpSessionId` in public contract (server-internal only)

**Event** (`EventSchema`)

- `cursor`, `type`, `occurredAt`
- Optional `workspaceId`, `sessionId`
- `payload` as discriminated union stub for MS1 event vocabulary (defined now, populated by later epics)
- Event types aligned to milestone doc, not prototype `agent.*` names

All outbound API responses parsed through their Zod schema before send. Inbound request bodies parsed at route boundaries in later epics.

### Persistence

None in this epic. Server holds only in-memory runtime state (boot time, current state enum). No SQLite file, no migrations.

### Testing

**Contract tests** (`packages/contracts`)

- Valid fixtures parse successfully for each schema
- Invalid fixtures fail with expected Zod errors
- Confirms MS1 vocabulary (sessions not agents, no M2+ fields)

**Server integration tests** (`apps/server`)

- `inject()` test: `GET /v1/status` returns 200 and matches `StatusSchema`
- Bind test: server listens on `127.0.0.1` with ephemeral or configured port
- Shutdown test: after `close()`, port is free and no listener remains
- Error test: malformed internal route trigger returns structured `ApiErrorSchema` shape

**Root check script**

- Runs typecheck, oxlint, and tests across all workspaces from root

Default test runner: `bun:test`. No real Cursor ACP process in this epic.

### Implementation decisions

1. **MS1-only contracts.** Shared package contains status, error, workspace, session, and event schemas only. No M2+ prototype resources.
2. **MS1 status skeleton.** `GET /v1/status` returns the full MS1 shape with honest placeholders (`acp.state: stopped`, `acp.activeSessions: 0`).
3. **Default port 3847.** Overridable via `RELAY_PORT` env var.
4. **Loopback bind.** Server listens on `127.0.0.1` only. `RELAY_HOST` env exists but defaults to loopback.
5. **Session vocabulary.** Public API uses `sessions`, not prototype `agents`. `acpSessionId` never appears in client contracts.
6. **Bun workspace.** One root `bun.lock`, catalogs for shared deps, `workspace:*` for internal packages. Web migrates off npm in this epic.
7. **Vertical slices in server.** Each feature owns its schema imports, handler, and tests. No layered `controllers/services/repositories` folders.
8. **Functional style.** Factory functions, immutable data, no classes. Zod at all boundaries.
9. **Fastify defaults.** Pino logging, `inject()` for HTTP tests, `close()` for graceful shutdown.
10. **Oxlint for typescript-dev.** Shared root `.oxlintrc.json` enforces no `import type`, `type` over `interface`, no classes, no barrel files, and `prefer-const`. Workspaces extend the root config. Conventions oxlint cannot check stay in code review.

### Out of scope

- Devices, pairing, remote access, and operational dashboard schemas
- Relay approval policy and settings API
- Workspace pause, folder browsing, git providers
- Fake or mock success paths when services are unavailable
- Task orchestrator (Turborepo, Nx)
- Android app workspace entry

## Story index

| # | Story | Blocked by | Delivers |
|---|-------|------------|----------|
| [#8](https://github.com/codenamegary/agent-server/issues/8) | Bun monorepo foundation | None | Root `bun install` works. `apps/web` lives in the workspace with one `bun.lock`. Shared oxlint config enforces typescript-dev rules. Root `dev`/`build`/`lint` scripts run. |
| [#9](https://github.com/codenamegary/agent-server/issues/9) | MS1 contracts package | #8 | `packages/contracts` exports status, error, workspace, session, and event schemas. Contract tests pass. |
| [#10](https://github.com/codenamegary/agent-server/issues/10) | Loopback server with status and errors | #8, #9 | `apps/server` binds `127.0.0.1:3847`. `GET /v1/status` returns a validated MS1 skeleton. Structured errors work. Graceful shutdown leaves no open listener. Integration tests pass. |
| [#11](https://github.com/codenamegary/agent-server/issues/11) | Root check pipeline | #10 | `bun run check` from root runs typecheck, lint, and tests across all workspaces. Epic done-when criteria met. |
