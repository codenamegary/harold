# Milestone 1 Epic 07: Operator Console and Hardening

Status: Planned  
Milestone: 1 — Core local operator

## Outcome

Finish a focused React operator console for real workspace, session, and chat
workflows, then prove the complete milestone 1 journey through automated and
manual recovery checks.

## Dependencies

- [Epic 02: Durable Workspace Registry](ms1-epic-02-durable-workspace-registry.md)
- [Epic 03: ACP Supervision and Session Lifecycle](ms1-epic-03-acp-session-lifecycle.md)
- [Epic 04: Journal and Reconnectable Event Stream](ms1-epic-04-journal-event-stream.md)
- [Epic 05: Streamed Turns and Cancellation](ms1-epic-05-streamed-turns-cancellation.md)
- [Epic 06: Concurrent Sessions and Restart Recovery](ms1-epic-06-concurrency-restart-recovery.md)

## Application structure

Replace the default Vite content in `apps/web/src/App.tsx` and starter styles
with React, TypeScript, Vite, and Tailwind vertical slices:

- `features/workspaces`
- `features/sessions`
- `features/chat`
- `features/connection`

Use:

- Shared Zod contracts at network boundaries
- Direct imports from defining modules
- Immutable reducers and derived state
- Accessible semantic controls
- A small application composition root

Do not add a global state library unless repeated implementation complexity
demonstrates a concrete need.

## Operator workflows

### Workspaces

- List and select registered workspaces.
- Register an existing folder by absolute path.
- Rename and unregister workspace metadata.
- Show missing or unavailable paths honestly.

### Sessions

- List sessions for the selected workspace.
- Create, select, rename, archive, and resume sessions.
- Show running, idle, recovering, disconnected, non-resumable, archived, and
  error states.
- Keep background activity visible without interrupting execution.

### Chat

- Render durable transcript replay and live streamed updates.
- Submit prompts and cancel active turns.
- Show tool and automatically handled permission activity.
- Preserve state across refresh and reconnect.
- Distinguish disconnected, replaying, live, cancelled, completed, interrupted,
  and failed states.

## Prototype migration

Use `prototype/server-ui/index.html` and `prototype/server-ui/styles.css` as
visual and interaction references only.

Do not migrate:

- Simulated chat timers or canned responses
- Relay approval cards
- Workspace pause
- Fake connection tests
- Device pairing or revocation controls
- Hardcoded dashboard metrics
- Functional settings or provider integrations

Later-roadmap surfaces may be omitted from navigation or shown as clearly
read-only. They must never appear operational when backed only by fixtures.

Keep `prototype/` until retained behavior has a real owner and parity is
separately verified.

## Experience requirements

- Responsive layouts for common desktop widths.
- Keyboard-operable workspace, session, prompt, and cancel controls.
- Visible focus states and appropriate labels.
- Predictable loading, empty, error, reconnecting, and disabled states.
- No color-only status communication.
- Destructive metadata actions require explicit confirmation.
- Connection loss never erases durable UI history.

## Milestone end-to-end journey

Automate:

1. Start Relay on loopback with a temporary database.
2. Register a temporary folder.
3. Create a session in that workspace.
4. Submit a prompt and observe streamed output.
5. Create a second session and run both independently.
6. Switch between sessions without affecting background execution.
7. Cancel one active turn without ending its session.
8. Restart Relay.
9. Reconnect the web client and replay missed events.
10. Resume the same underlying agent when supported.
11. Verify honest non-resumable behavior when loading is unavailable.
12. Archive and unregister metadata without changing workspace files.

Use the deterministic fake ACP executable in default automated tests. Keep a
guarded real-Cursor smoke journey for local or credentialed environments.

## Acceptance criteria

- Every milestone 1 workspace, session, and chat operation is available through
  the production API and web console.
- No production workflow silently falls back to mock data.
- Background sessions remain active while the operator navigates.
- Refresh, WebSocket reconnect, Relay restart, and ACP restart produce honest
  recoverable states.
- The complete critical journey passes with the fake ACP implementation.
- The guarded real-Cursor smoke flow passes where Cursor credentials and ACP
  support are available.
- Root typecheck, lint, unit, contract, integration, build, and end-to-end
  commands pass.
- Structured errors and logs are actionable and contain no secrets.
- Persisted data is compatible through all milestone 1 migrations.
- The app remains loopback-only.

## Verification

- Component tests cover all meaningful UI states and interactions.
- Accessibility checks cover labels, focus order, keyboard operation, and
  status announcements.
- End-to-end tests cover the complete milestone journey.
- Failure injection covers API errors, WebSocket loss, ACP exit, Relay restart,
  unsupported resume, and corrupt journal projection input.
- Manual verification compares retained production behavior with the prototype.

## Completion boundary

Milestone 1 is complete only when all seven epics pass their verification and a
local operator can perform the end-to-end journey without simulated success.

Still out of scope:

- Devices and pairing
- Remote access
- Operational dashboard and diagnostics
- Runtime settings
- GitHub and GitLab providers
- Workspace pause
- Relay-level approvals
- Transcript search, export, branching, and duplication
- Installers, desktop shells, and containers
