# ADR-0004 Agent auth broker: implementation state and sizing

Checked: 2026-08-22

Scope: what exists today for agent provider auth vs what ADR-0004 specifies,
and how large similar shipped work was, so slices can be filed as issues or
projects. Primary sources only: this repo (code, ADRs, contracts, tests, PRs).

## Verdict

| Question | Answer |
| --- | --- |
| AuthBroker / agent-auth wire / HostBrowser shipped? | **No.** Spec only in ADR-0004. Target paths do not exist on disk. |
| Supervisor `authenticate` today? | **Yes.** Always calls ACP `authenticate` with catalog `authMethodId` after `initialize`. |
| Claude impact | Enable/start fails when the agent rejects fantasy method ids (e.g. `claude-acp` → "Method not implemented"), then settings rolls back `enabled`. |
| Peer sizing | Device auth/pairing shipped as a **multi-PR epic** (~0.5–2.3k additions per PR). Single focused PRs stayed issue-sized. |
| ADR-0004 overall | **Project.** Candidate slices below: **8 issue-shaped**, **5 project-shaped**. |

## 1. Does AuthBroker / adapter / HostBrowser / agent-auth wire exist?

**No implementation.** Only the accepted ADR and glossary links.

| Target (ADR-0004) | On disk today? |
| --- | --- |
| `packages/contracts/src/http/agent-auth.ts` | Missing |
| `apps/server/src/agent/auth/` (broker, adapters, routes) | Missing |
| `apps/server/src/browser/` (HostBrowser) | Missing |
| `apps/web/src/agent/auth/` | Missing |
| `apps/web/src/browser/HostBrowserSettings.tsx` | Missing |

What **does** exist and must not be confused with agent auth:

- `apps/server/src/auth/` — **device** authn/authz (Bearer, loopback host, WS auth frame).
- `packages/contracts/src/events/stream.auth.ts` — WS first-frame `{ type: "auth", authorization }` for device streams, not provider login.
- Catalog / profile `authMethodId` on spawn snapshots and overrides (used by supervisor authenticate today).

ADR status: Accepted. Type sketch marked “Not shipped code.”

## 2. Where does supervisor call authenticate / authMethodId? What breaks for Claude?

### Call site

`spawnAndInitialize` in `apps/server/src/acp/supervisor/supervisor.ts`:

1. `initialize` with `resolved.profile.clientCapabilities`
2. Build capability inventory
3. **`transport.request("authenticate", { methodId: resolved.profile.authMethodId })`**
4. Mark runtime `ready`

Callers of `acpSupervisor.start`:

- Enable path: `apps/server/src/agent-settings/agent-settings-routes.ts` (on PATCH `enabled: true`)
- Session gate: `apps/server/src/session/session.acp.ready.ts` (`ensureSupervisorReady`)
- Bootstrap of enabled agents (same start path)

### Where `authMethodId` is set

- Catalog codegen defaults `authMethodId` to agent id (Claude: `"claude-acp"` in `catalog.agents.generated.ts`).
- Overrides can replace it (Cursor: `"cursor_login"` in `cursor.override.ts`; OpenCode: `"opencode-login"`).
- Custom agents use the agent id as `authMethodId` via registry / repository.

### What breaks for Claude

ADR-0004 records: blind catalog `authMethodId` on start broke Claude with **“Method not implemented.”**

Repo behavior matches that failure mode:

1. Authenticate throws → `start` fails.
2. Enable handler catches, sets `enabled: false`, returns **409** `buildAgentCannotEnableProblem(reason)` with sanitized ACP detail.
3. Web Agents panel surfaces that detail (test fixture uses `"Method not implemented."` on enable conflict).
4. Session open via `ensureSupervisorReady` also fails start with the same sanitized reason.

Cursor can work when `cursor_login` is a real ACP method. Claude’s catalog id `claude-acp` is treated as an ACP method id even when the process does not implement it. Enable stays coupled to that authenticate call (ADR wants enable ≠ auth).

Tests still expect authenticate on every start (`supervisor.test.ts`: “runs initialize and authenticate then caches capabilities”).

## 3. Agent-settings / session / WS patterns ADR-0004 would touch

### Agent settings

- Wire: `packages/contracts/src/http/agent-settings.ts` — `AgentSettings` has `enabled`, `state`, `capabilities`; **no** `AgentAuthSummary`.
- Spawn snapshot includes `authMethodId` (internal/profile), not exposed as agent-auth summary on list/get.
- Routes already start/stop supervisor on enable/disable and map start failures to problems.
- ADR touch: optional auth summary on list/get; dedicated `GET /v1/agents/:agentId/auth` (new), not only settings PATCH.

### Session / chat gateway

- Hub: `apps/server/src/session/hub/` — prompt, subscribe, fan-out `session_update` / `permission_request` / `prompt_complete`.
- Ready gate: `session.acp.ready.ts` starts supervisor if not running; **no** `ensureReadyForPrompt` / auth probe / `auth_required` handling.
- Stream contract: `packages/contracts/src/http/session.stream.ts` — no auth-session message types.
- ADR touch: `auth_required` → `broker.ensureSessionFromChallenge`; gate prompts until authenticated.

### WS / live updates

- Session stream: `/v1/sessions/stream` with device WS auth frame (`stream.auth.ts` + `ws.auth.ts`).
- App journal `/v1/events` was removed (PR #205); console tests assert it is not opened.
- Device pairing progress uses **HTTP poll** (`poll.for.paired.device.ts`), not a live auth-session event bus.
- ADR sketches `auth_session_updated` and `AuthBroker.subscribe`. That fan-out is **new** relative to today’s stream surface (session hub or a new channel). Multi-device live steps are not a small bolt-on.

### Host settings

- Web Host/Runtime settings live under `apps/web/src/settings/` (`RuntimePanel.tsx`). No HostBrowser install/status UI.
- ADR: HostBrowser status/install under Host settings, not Agents auth.

## 4. Similar past features: rough footprint

Device authentication + pairing was an epic of issue-sized and larger PRs, not one merge.

| PR | Title | Additions / files (approx) | Role |
| --- | --- | --- | --- |
| #159 | Device contracts + persistence (AGE-5) | ~1220 / 14 | Contracts + DB |
| #161 | Pairing codes + credential issuance (AGE-6) | ~804 / 13 | Server device slice |
| #162 | Device authn/authz middleware (AGE-7) | ~1111 / 19 | `apps/server/src/auth/*` |
| #163 | Device registry + presence (AGE-8) | ~1249 / 19 | Registry + events (then-era) |
| #164 | Device revocation (AGE-9) | ~496 / 10 | Focused follow-on |
| #165 | Devices console slice (AGE-10) | ~1379 / 27 | Web UI + queries |
| #166 | Second-client journey (AGE-11) | ~594 / 14 | Hardening |
| #177 | Android pair + credential (AGE-23) | ~2301 / 35 | Android pairing |

Current module weight (order of magnitude, including tests):

- `apps/server/src/auth/` + `apps/server/src/device/` + pairing contracts ≈ **4.2k** lines
- `apps/web/src/devices/` ≈ **0.6k** lines
- Android pairing main sources ≈ **0.7k** lines

**Sizing rule of thumb for this repo:**

- **Issue-shaped:** one vertical concern, roughly one PR, often &lt;~900 additions or a tight follow-on (revoke, honest start failures).
- **Project-shaped:** new cross-cutting noun (contracts + server orchestrator + web UI, optionally Android), or live multi-client sync, or real host automation. Expect a short PR train like device auth.

ADR-0004 matches the device-auth **project** shape overall. Individual slices can still be issues.

## 5. Candidate slices (from ADR-0004 target structure)

Heuristic: issue = shippable alone with narrow acceptance; project = multiple modules/surfaces or open design (live fan-out, real browser, Claude host-cred + UI).

| # | Slice | Shape | Evidence line |
| --- | --- | --- | --- |
| 1 | **Stop catalog authenticate on start** (ADR “Slice 0”; stub/no-op auth path) | **Issue** | Single seam: `supervisor.ts` authenticate block; ADR says Slice 0 can stub broker and still fix Claude spawn. |
| 2 | **Wire: `agent-auth.ts`** (AgentAuth, summary, steps, actions) | **Issue** | New contracts file + tests only; peer #159 contracts files (`device.ts` / `pairing-code.ts` scale). |
| 3 | **Auth broker core** (`broker`, `session`, `status`, `registry`, HTTP `routes` / `problems`) | **Project** | New `apps/server/src/agent/auth/*` directory tree; session vocabulary + single-flight + secrets rules; peer pairing/service epic (#161–#163). |
| 4 | **Adapter interface + default adapter** | **Issue** | `adapters/adapter.ts` + `default.adapter.ts` (+ tests); bounded once broker exists; ACP best-effort mapping only. |
| 5 | **Claude adapter** (probe / host-cred / optional browser flows) | **Project** | `claude.adapter.ts` plus HostBrowser and/or host token install; ADR calls Claude the first custom adapter and ties it to HB/token paths. |
| 6 | **HostBrowser stub** (status `missing`, Host settings status) | **Issue** | `apps/server/src/browser/{service,stub,routes}` + small Host settings surface; ADR allows v1 stub. |
| 7 | **HostBrowser real install/automation** | **Project** | Install/status/context/fill; ADR optional capability with product install UX and per-session context. |
| 8 | **Embed `AgentAuthSummary` on agent settings** | **Issue** | Edit `agent-settings.ts` + list/get mapping; ADR touch list is narrow. |
| 9 | **Supervisor hooks** (`clientAuthCapabilities`, `onStart`, `observeInitialize`, respawn) | **Issue** | `supervisor.hooks.ts` + edits to `supervisor.ts`; depends on 1 + 3–4; acceptance is start/probe seam only. |
| 10 | **Session glue** (`ensureReadyForPrompt`, `auth_required` → `ensureSessionFromChallenge`) | **Issue** | Edits under `apps/server/src/session/`; needs broker; no full Sign-in UI required for API/hub behavior. |
| 11 | **Web AgentAuth console** (panel, step views, hooks, fetch helpers) | **Project** | New `apps/web/src/agent/auth/*`; closed step vocabulary UI; peer Devices console #165 (~27 files). |
| 12 | **Live `auth_session_updated` fan-out** | **Project** | Broker `subscribe` + device delivery; `/v1/events` gone; session stream has no auth types; multi-device sync is greenfield. |
| 13 | **Logout + completionPolicy reconnect** | **Issue** | `broker.logout` + supervisor respawn; conflict-while-in-flight; follows broker without full browser/UI. |

### Classification counts

- **Issue-shaped: 8** (slices 1, 2, 4, 6, 8, 9, 10, 13)
- **Project-shaped: 5** (slices 3, 5, 7, 11, 12)

Suggested filing: treat **ADR-0004 as one project** (or epic) with issue children for 1–2, 4, 6, 8–10, 13; keep 3, 5, 7, 11, 12 as nested projects or epic workstreams. Do not file the whole broker+UI+Claude+HB as a single issue.

## Sources

- `docs/adr/0004-agent-auth-broker.md` — decision, target tree, type sketch, Slice 0 note, Claude “Method not implemented”
- `docs/adr/0000-agent-server.md` — glossary: Host capability, agent-auth session vs ACP session
- `apps/server/src/acp/supervisor/supervisor.ts` — `authenticate` with `authMethodId`
- `apps/server/src/acp/supervisor/supervisor.test.ts` — initialize + authenticate expectation
- `apps/server/src/agent-settings/agent-settings-routes.ts` — enable → `start`, rollback on failure
- `apps/server/src/agent-settings/agent-settings-problems.ts` — cannot-enable problem
- `apps/server/src/session/session.acp.ready.ts` — start on ensure-ready
- `apps/server/src/acp/catalog/generated/catalog.agents.generated.ts` — Claude `authMethodId: "claude-acp"`
- `apps/server/src/acp/catalog/overrides/cursor.override.ts` — `authMethodId: "cursor_login"`
- `packages/contracts/src/http/agent-settings.ts` — settings wire (no auth summary)
- `packages/contracts/src/http/session.stream.ts` — session WS vocabulary
- `packages/contracts/src/events/stream.auth.ts` — device stream auth frame only
- `apps/server/src/auth/` — device auth (not agent auth)
- `apps/web/src/agent-settings/agents.panel.test.tsx` — enable conflict shows “Method not implemented.”
- `apps/web/src/connect/poll.for.paired.device.ts` — poll pattern for pairing
- `apps/web/src/connection/connection.recovery.test.tsx` — no `/v1/events` journal socket
- GitHub PRs (visible via `gh`): #159, #161, #162, #163, #164, #165, #166, #177, #205 — device/pairing footprint and event-journal removal
