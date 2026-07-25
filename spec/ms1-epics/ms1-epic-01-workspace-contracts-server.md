# Milestone 1 Epic 01: Workspace, Contracts, and Server Foundation

Status: Planned  
Milestone: 1 — Core local operator

## Outcome

Establish the production monorepo and a typed, testable server boundary that
every later milestone 1 epic can build on.

At completion, the repository has one Bun workspace, shared Zod contracts, and
a loopback-only Fastify server exposing a real health endpoint. No prototype
screen or fixture is allowed to masquerade as production behavior.

## Dependencies

- [Relay delivery roadmap](../roadmap.md)
- Existing React, TypeScript, Vite, and Tailwind scaffold in `apps/web`
- Prototype contracts and HTTP notes as references, not production code

## Scope

### Bun workspace

- Add a private root `package.json` declaring:
  - `apps/server`
  - `apps/web`
  - `packages/*`
- Maintain one root `bun.lock`.
- Use `workspace:*` for internal package dependencies.
- Use Bun catalogs for shared dependency versions.
- Add root scripts for development, type checking, linting, testing, and
  building.
- Adopt `apps/web` into the workspace and remove its npm lockfile.
- Do not add Turborepo, Nx, Lerna, Changesets, or another task orchestrator.

### Shared contracts

Create `packages/contracts` with Zod schemas for:

- API success and structured error envelopes
- Server and ACP health
- Workspace resources and commands
- Session resources and commands
- Event stream cursors, filters, and records
- ACP journal metadata

Infer TypeScript types from Zod schemas. Public terminology uses `session`;
`acpSessionId` remains an internal server field.

Promote only the milestone 1 portions of:

- `prototype/server-api/contracts.ts`
- `prototype/server-api/http-contracts.md`

Exclude devices, pairing, proxies, Relay approvals, runtime settings, provider
integrations, and workspace pause.

### Server foundation

Create `apps/server` as a functional Fastify modular monolith:

- Bind to `127.0.0.1` by default.
- Expose `GET /v1/status`.
- Parse configuration and all external values with Zod.
- Serialize responses through shared contracts.
- Return stable structured errors.
- Emit structured logs without secrets.
- Shut down cleanly on process termination.

Keep feature code in vertical slices. Use direct imports and do not create
barrel exports.

## TypeScript constraints

- Use immutable data and pure transformations.
- Use `const`; do not use `let`.
- Use type aliases, not interfaces.
- Do not introduce classes, decorators, inheritance, or `this`-based APIs.
- Use ordinary imports for both values and types; do not use `import type`.
- Define domain, API, persistence, configuration, and form models with Zod.

## Acceptance criteria

- A clean checkout installs from the root with Bun.
- `apps/web`, `apps/server`, and `packages/contracts` resolve as workspaces.
- Only one JavaScript/TypeScript lockfile exists at the repository root.
- `GET /v1/status` returns a response accepted by the shared status schema.
- The server listens on loopback and rejects invalid configuration before
  starting.
- Shutdown closes the HTTP listener and exits without hanging.
- Contract consumers import schemas directly from their defining modules.
- No milestone 2+ contract is exposed as production-ready.
- Root check, test, and build scripts pass.

## Verification

- Contract tests cover valid and invalid envelopes, status, workspace, session,
  event, and error shapes.
- Server integration tests cover health success, serialization, structured
  errors, invalid configuration, and graceful shutdown.
- A smoke test starts the server from the root workspace and requests
  `/v1/status`.

## Failure and recovery

- Startup failures identify the invalid configuration or occupied listener.
- Termination leaves no child process or open listener.
- Contract changes are versioned deliberately; incompatible persisted-data
  migrations are not introduced in this epic.

## Out of scope

- SQLite persistence
- Workspace registration
- ACP process startup
- Session lifecycle
- WebSocket events
- Chat behavior
- Production web UI beyond preserving the existing scaffold
