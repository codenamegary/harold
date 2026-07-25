# Relay Delivery Roadmap

Status: Confirmed  
Last updated: 2026-07-25

## Product direction

Relay will turn the prototype into a working local agent server one complete
operator outcome at a time. The whole product shell remains visible and evolves
throughout development, but unfinished screens must be clearly read-only rather
than simulate success.

The local web console and future Android client will use the same versioned API
and reconnectable event stream. Relay alone owns ACP sessions.

## Target repository layout

Relay will use a lean monorepo:

```text
/
├── apps/
│   ├── server/          # API, event stream, persistence, and ACP ownership
│   ├── web/             # Local operator console
│   └── android/         # Android client and Gradle build
├── packages/
│   ├── contracts/       # Shared wire schemas: contracts/http and contracts/events
│   └── test-support/    # Shared fixtures and integration helpers, when needed
├── spec/                # Product and technical specifications
├── prototype/           # Temporary reference until replaced
├── package.json         # Bun workspace and root task definitions
└── bun.lock             # Single JavaScript/TypeScript dependency lockfile
```

Repository rules:

- Keep the server as a modular monolith inside `apps/server`.
- Extract a package only when code has a real second consumer.
- `packages/contracts` is the shared boundary between the server and clients.
- Do not create separate packages for ACP, sessions, persistence, device
  authentication, or observability preemptively.
- Preserve `prototype/` as a behavioral reference while replacing it
  incrementally, then remove it after all retained behavior has a real owner.

## Monorepo management

Use Bun workspaces for the JavaScript and TypeScript projects:

- Declare `apps/server`, `apps/web`, and `packages/*` as root workspaces.
- Maintain one root `bun.lock`.
- Use `workspace:*` for dependencies between repository packages.
- Use Bun catalogs to keep shared dependency versions synchronized.
- Run workspace scripts from the root with `bun --filter`, using parallel or
  sequential execution as required.
- Standardize the web and server projects on Bun rather than mixing Bun and npm.

Keep Android within the monorepo but outside the Bun dependency graph:

- Commit the Gradle Wrapper under `apps/android`.
- Use the wrapper for every Android build and check.
- Allow root Bun scripts to invoke `apps/android/gradlew` when a repository-wide
  check needs to include Android.
- Let Gradle own Android dependencies and its Java toolchain.

Start with root package scripts for development, build, test, lint, and checks.
Do not add Turborepo, Nx, Lerna, Changesets, or another task runner initially.
Consider a task orchestrator only when measured CI time or task-ordering
complexity makes root scripts inadequate; adopting one must not require changing
the repository layout.

## Delivery order

### 1. Core local operator

**Value:** A local operator can move between workspaces and delegate unrestricted
work to independent, durable agent sessions.

Deliver:

- Register and validate an existing local folder.
- List, select, and unregister workspaces without modifying their files.
- Create and list sessions by workspace.
- Switch between sessions while work continues independently in the background.
- Rename, end/archive, and resume sessions.
- Exchange multiple chat turns with streamed output.
- Cancel the current turn without ending the session.
- Resume the same underlying agent and its context after Relay restarts.
- Persist raw ACP events with only the Relay metadata needed to route and replay
  them: session ID, sequence number, timestamp, and protocol version.
- Expose all functionality through the shared client API and event stream.

Acceptance boundary:

- Relay does not intercept or limit agent read, write, command, or tool access.
- Only existing local folders are supported.
- Folder browsing, repository cloning, provider integrations, and per-workspace
  policy are deferred.
- The project may continue to run from source during this phase.

#### Web console migration

Migrate `prototype/server-ui` into `apps/web` before wiring backend slices.
The whole product shell stays visible from the start. Each epic enables its
slice. Everything else stays clearly read-only.

Rules:

- Match prototype layout, navigation, and visual design in React, TypeScript,
  Vite, and Tailwind.
- Organize `apps/web` into vertical slices: workspace, session, chat, and
  connection.
- Do not copy prototype mock-success fallbacks, demo data, or simulated timers.
- Disabled controls must look disabled and explain that the feature is not live
  yet.
- Later epics turn on slices by wiring them to the real API and event stream.

#### MS1 epic delivery order

Milestone 1 ships eight epics. Epic numbers are logical order, not GitHub issue
numbers.

| Epic | Title | Delivers |
|------|-------|----------|
| 01 | Workspace, contracts, and server foundation | Bun monorepo, shared contracts, loopback Fastify server |
| 02 | Operator console shell | Prototype migrated to `apps/web`. Full shell visible. Slices disabled until their epic lands. |
| 03 | Durable workspace registry | SQLite, migrations, `/v1/workspaces` CRUD, workspace slice wired to API |
| 04 | ACP supervision and session lifecycle | Supervised ACP process, session create/list/select/rename/archive |
| 05 | Journal and reconnectable event stream | Append-only journal, WebSocket `/v1/events` with cursor replay |
| 06 | Streamed turns and cancellation | Multi-turn chat, streaming output, turn cancel, chat slice live |
| 07 | Concurrent sessions and restart recovery | Background sessions, restart resume, recovery UI states |
| 08 | Operator console hardening | Localization, E2E journey, polish, remove remaining prototype gaps |

Epic 02 is UI-only. It does not require a working backend beyond what Epic 01
already provides. Epics 03 onward enable server-backed behavior slice by slice.

### 2. Trusted devices

**Value:** A second client can become a durable, revocable full operator.

Deliver:

- Generate short-lived, one-time pairing codes.
- Let a client claim a code and receive a durable device credential.
- Reconnect a known device without pairing again.
- List paired devices and their connection or last-seen state.
- Revoke a device and terminate its access immediately.

Acceptance boundary:

- Every paired device is a full operator.
- Prove the complete client-neutral lifecycle locally.
- QR codes are a convenience layer, not the pairing protocol.
- Android-specific presentation is not required in this increment.

### 3. Remote access

**Value:** A paired client can reach Relay through user-managed HTTPS.

Deliver:

- Support a generic HTTPS reverse-proxy deployment.
- Configure the externally advertised Relay URL.
- Perform real reachability, TLS, and device-authentication checks.
- Report actionable setup failures instead of simulated success.

Acceptance boundary:

- Deliver one generic HTTPS path first.
- Caddy, Tailscale, and Cloudflare-specific automation or templates may follow
  only when they add value beyond the generic path.

### 4. Android core

**Value:** The operator can manage real agent work away from the host machine.

Deliver:

- Pair and reconnect an Android device.
- Browse registered workspaces.
- Create, list, switch, rename, end/archive, and resume sessions.
- Stream multi-turn chats.
- Cancel the current turn.
- Show live session states while other sessions continue in the background.

Acceptance boundary:

- Target workspace, session, and chat parity with the local console.
- Do not duplicate every desktop administration screen.
- Use the same client API and event stream as the web console.

### 5. Operational confidence

**Value:** The operator can understand failures and trust local and remote
operation.

Deliver:

- Real Relay server and ACP runtime health.
- Session, device, and pairing activity.
- Running, idle, ended, and error states.
- Useful latency and failure signals.
- Downloadable diagnostics containing actionable runtime information.

Acceptance boundary:

- No decorative or hardcoded metrics.
- Every displayed signal must come from real runtime data.

### 6. Runtime configuration

**Value:** The operator can configure Relay without editing source code.

Deliver:

- Startup behavior.
- Bind address and port.
- Externally advertised URL.
- Log level and log location.
- Registered workspace roots.
- Clear restart requirements for settings that cannot change live.

Acceptance boundary:

- Provider and approval-policy settings are excluded.
- Network-impacting changes must be explicit.

### 7. Repository onboarding

**Value:** A hosted repository becomes a registered local workspace with minimal
setup.

Deliver GitHub first:

- Authenticate a GitHub account.
- Browse accessible repositories.
- Clone a selected repository locally.
- Register the clone as a workspace.

Then deliver the same workflow for GitLab through a shared provider boundary.

Acceptance boundary:

- Do not add pull requests, issues, CI, or hosting-management features.
- Do not manage fetch, pull, or push in this increment.

## Definition of done for every increment

Every increment must include:

- Automated contract and integration coverage.
- Persisted-data compatibility or an explicit migration.
- Structured errors and useful logs.
- A demonstrated failure and recovery path.
- End-to-end coverage for critical user journeys where it provides meaningful
  protection.

An increment is not complete when its UI merely simulates the intended result.

## Explicit cuts and deferrals

- Relay-level approval interception and approval policies.
- Workspace pause.
- Separate web and Android server interfaces.
- Packaged installers, desktop shells, and containers during initial development.
- Session transcript search, export, branching, and duplication.
- GitHub or GitLab pull request, issue, CI, and synchronization workflows.

If the underlying agent emits its own interaction or approval event, Relay may
stream it transparently, but Relay will not introduce an independent approval
gate.

## Dependency chain

Core sessions → trusted-device pairing → generic HTTPS access → Android core →
operational visibility → runtime configuration → GitHub onboarding → GitLab
onboarding.
