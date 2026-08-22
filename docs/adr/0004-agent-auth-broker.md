# Agent auth: host broker, adapters, optional headless browser

Status: Accepted  
Related: [ADR-0001 Device authentication](0001-device-authentication.md), [ADR-0002 Device authorization](0002-device-authorization.md)

Agent auth (provider login for Claude, Cursor, and other ACP agents) is not
device auth. Agent-server is the ACP client and the host. Paired devices only
drive structured auth steps over our HTTP/WS API. We do not show a terminal UI.
We do not call ACP `authenticate` with a catalog fantasy method id on every
start. An Auth broker orchestrates. Per-agent adapters decide methods and ACP
capabilities. Optional HostBrowser is a host capability adapters may use later.

## Decision

1. Treat **agent auth** as host-owned. Credentials live on the single host OS
   identity that runs agent processes. Devices trigger login/logout. They do not
   hold provider secrets as the source of truth.
2. Put orchestration in an **Auth broker**. Put agent quirks in **auth adapters**.
   Put optional automation browser in a **HostBrowser** host capability.
3. Expose a device API of **auth sessions** and a **closed step vocabulary**
   (`choose_method`, `open_url`, `paste_secret`, `confirm`, `show_message`,
   `working`, `done`). Design steps so a richer form schema can arrive later
   without rewriting the broker.
4. Allow **one in-flight auth session per agent id**. Any paired device may view
   live steps and cancel. Secrets travel only in submit actions. Never echo
   secrets in steps or event payloads.
5. Keep **enable separate from auth**. An agent may be enabled and still
   `needs_auth`. Sessions and prompts that need provider auth stay gated until
   the adapter probe says authenticated (or an `auth_required` challenge starts
   or attaches the single-flight session).
6. Build the Sign-in method list from **`adapter.listMethods(ctx)`**. ACP
   `initialize.authMethods` are adapter input, not the UI list. Browser-dependent
   methods stay visible but disabled when HostBrowser is missing.
7. Let each adapter choose ACP **client auth capabilities** on `initialize`.
   Do not globally advertise `auth.terminal` only because a browser exists.
   HostBrowser filling pages is not the same contract as ACP terminal login.
8. Remove blind catalog `authMethodId` authenticate from the supervisor start
   path. An adapter **`onStart`** may call ACP `authenticate` when the agent
   truly needs a protocol-driven agent-type method.
9. After auth success, honor the adapter **completion policy** (`reconnect` or
   `reuse_process`). On cancel or failure, abort the adapter work, dispose any
   browser context for that session, clear in-memory secrets, and do not run a
   host-cred snapshot rollback. Write host credentials only at the success
   boundary.
10. Probe auth status through the adapter (for example `claude auth status`).
    Cache. Refresh after login, logout, and on demand.
11. **Logout** is `broker.logout(agentId)`. Any paired device may call it.
    Blocked while an auth session for that agent is in flight.
12. On mid-turn **`auth_required`**, create a single-flight auth session or
    attach clients to the existing one.
13. Ship a **default adapter** that maps ACP agent-type methods best-effort,
    leaves terminal methods disabled until a translator exists, and probes as
    `unknown` when it cannot know. Custom adapters (Claude first) override.
14. Put HostBrowser **install/status** in Host settings, not under Agents auth.
    Auth methods may point at that status. One browser context per auth session
    when used. No host-wide browser queue in v1.
15. Surface auth **summary** on agent settings list responses. Full status,
    methods, and session live on a dedicated auth resource.

## Architecture

Agent-server is the host and the ACP client. Devices never speak ACP auth
directly.

```mermaid
flowchart TB
  subgraph devices [Paired devices]
    Console[Web operator console]
    WebChat[Web chat]
    Android[Android chat]
  end

  subgraph host [Agent-server host]
    API[HTTP / WS API]
    Broker[Auth broker]
    Adapters[Auth adapters]
    Default[Default adapter]
    Claude[Claude adapter]
    HB[HostBrowser optional]
    Creds[Host cred store]
    Super[ACP supervisor]
    AgentProc[Agent process]
  end

  Console --> API
  WebChat --> API
  Android --> API
  API --> Broker
  Broker --> Adapters
  Adapters --> Default
  Adapters --> Claude
  Claude -.-> HB
  Adapters --> Creds
  Broker --> Super
  Super --> AgentProc
  Adapters -.-> AgentProc
```

```mermaid
flowchart LR
  subgraph brokerBox [Auth broker]
    Sessions[Auth sessions]
    Steps[Closed step vocabulary]
    Status[Auth status cache]
  end

  subgraph adapterBox [Adapter contract]
    ListMethods[listMethods]
    OnStart[onStart]
    Probe[probe]
    StartContinue[start / continue / abort]
    Logout[logout]
    Caps[clientAuthCapabilities]
    Complete[completionPolicy]
  end

  subgraph hostBox [Host capabilities]
    HB2[HostBrowser status / context]
    HostId[Single host identity]
  end

  Sessions --> StartContinue
  Steps --> StartContinue
  Status --> Probe
  ListMethods --> HB2
  StartContinue --> HB2
  StartContinue --> HostId
  Logout --> HostId
  OnStart --> Caps
  Complete --> Super2[Supervisor respawn?]
```

## Critical flows

### Enable agent (auth separate)

No catalog `authenticate` on start. Adapter may run a real ACP `authenticate`
only when `onStart` says so. Probe sets auth summary.

```mermaid
sequenceDiagram
  participant Device
  participant API
  participant Super as Supervisor
  participant Agent as Agent process
  participant Broker as Auth broker
  participant Adapter

  Device->>API: PATCH enable agent
  API->>Super: start(agentId)
  Super->>Agent: spawn
  Super->>Agent: initialize (adapter caps)
  Agent-->>Super: authMethods + capabilities
  Super->>Adapter: onStart(initializeResult)
  opt adapter needs ACP agent-type auth
    Adapter->>Agent: authenticate(real methodId)
  end
  Super->>Broker: noteInitialize / probe
  Broker->>Adapter: probe()
  Adapter-->>Broker: authenticated | needs_auth | unknown
  Broker-->>API: auth summary
  API-->>Device: enabled + auth summary
```

### Sign in (structured steps, optional HostBrowser)

One session per agent. Secrets only in actions. Browser stays on the host.

```mermaid
sequenceDiagram
  participant D1 as Device A
  participant D2 as Device B
  participant API
  participant Broker as Auth broker
  participant Adapter
  participant HB as HostBrowser
  participant Host as Host cred store
  participant Super as Supervisor

  D1->>API: POST auth session (methodId)
  API->>Broker: startSession
  Broker->>Adapter: start(methodId)
  alt method needs browser and HostBrowser ready
    Adapter->>HB: open context for session
    HB-->>Adapter: page needs fields
  end
  Adapter-->>Broker: steps (paste_secret / confirm / …)
  Broker-->>D1: session + steps
  Broker-->>D2: auth_session_updated (same session)

  D1->>API: action submit_secret
  Note over API,Broker: secret in action only, not in steps
  API->>Broker: continue(action)
  Broker->>Adapter: continue(secret)
  Adapter->>HB: fill field / advance
  HB-->>Adapter: done or next field
  Adapter->>Host: write creds at success only
  Adapter-->>Broker: done + completionPolicy
  Broker->>HB: dispose context
  opt reconnect
    Broker->>Super: respawn(agentId)
  end
  Broker->>Adapter: probe()
  Broker-->>D1: succeeded
  Broker-->>D2: auth_session_updated
```

### Mid-chat `auth_required` (create or attach)

```mermaid
sequenceDiagram
  participant Chat as Chat device
  participant Other as Other device
  participant Gateway as Session gateway
  participant Broker as Auth broker
  participant Adapter

  Chat->>Gateway: prompt
  Gateway->>Gateway: agent returns auth_required
  Gateway->>Broker: ensureAuthSession(agentId)

  alt no in-flight session
    Broker->>Adapter: start from challenge
    Broker-->>Chat: new auth session + steps
  else session already in flight
    Broker-->>Chat: attach existing session + steps
  end

  Broker-->>Other: auth_session_updated
  Note over Chat,Other: Any paired device may continue or cancel
```

### Logout

```mermaid
sequenceDiagram
  participant Device
  participant API
  participant Broker as Auth broker
  participant Adapter
  participant Host as Host cred store
  participant Super as Supervisor

  Device->>API: POST logout agent
  API->>Broker: logout(agentId)
  alt auth session in flight
    Broker-->>API: conflict (finish or cancel auth first)
  else idle
    Broker->>Adapter: logout()
    Adapter->>Host: clear host creds
    opt ACP logout advertised
      Adapter->>Adapter: ACP logout RPC
    end
    Adapter-->>Broker: completionPolicy
    opt reconnect
      Broker->>Super: respawn(agentId)
    end
    Broker->>Adapter: probe()
    Broker-->>Device: needs_auth
  end
```

### Cancel or fail mid-auth

```mermaid
sequenceDiagram
  participant Device
  participant Broker as Auth broker
  participant Adapter
  participant HB as HostBrowser

  Device->>Broker: cancel (or adapter fails)
  Broker->>Adapter: abort(session)
  Adapter->>HB: dispose context
  Note over Adapter: drop in-memory secrets<br/>do not write host creds
  Broker->>Adapter: probe()
  Broker-->>Device: cancelled or failed
```

## Type sketch (ideal shape)

Not shipped code. Target shapes for `packages/contracts` (wire) and
`apps/server/src/acp/auth/` (broker). Names may shift at implement time.
No semicolons. Prefer readonly fields and discriminated unions.

### Wire: status, methods, steps, actions

```ts
type AgentId = string

type AgentAuthStatus =
  | "unknown"
  | "needs_auth"
  | "authenticated"
  | "error"

/** Badge fields on GET /v1/settings/agents items */
type AgentAuthSummary = {
  readonly status: AgentAuthStatus
  readonly error: string | null
  readonly activeSessionId: string | null
  readonly canLogout: boolean
}

type AgentAuthMethodAvailability =
  | { readonly kind: "available" }
  | {
      readonly kind: "disabled"
      readonly reason: string
      /** e.g. open Host settings for headless browser */
      readonly remediation: "host_browser" | "none"
    }

type AgentAuthMethod = {
  readonly methodId: string
  readonly title: string
  readonly description: string
  readonly availability: AgentAuthMethodAvailability
}

type AuthSessionStatus =
  | "in_progress"
  | "succeeded"
  | "failed"
  | "cancelled"

type AuthStep =
  | {
      readonly type: "choose_method"
      readonly methods: readonly AgentAuthMethod[]
    }
  | {
      readonly type: "open_url"
      readonly title: string
      readonly url: string
      readonly caption: string | null
    }
  | {
      readonly type: "paste_secret"
      readonly stepId: string
      readonly label: string
      readonly placeholder: string | null
      readonly secretKind: "api_key" | "oauth_token" | "otp" | "other"
    }
  | {
      readonly type: "confirm"
      readonly stepId: string
      readonly title: string
      readonly body: string
      readonly confirmLabel: string
    }
  | {
      readonly type: "show_message"
      readonly level: "info" | "error"
      readonly body: string
    }
  | { readonly type: "working"; readonly label: string }
  | {
      readonly type: "done"
      readonly outcome: "succeeded" | "failed" | "cancelled"
      readonly message: string | null
    }

/** Secrets only appear here, never on AuthStep or WS payloads */
type AuthSessionAction =
  | { readonly type: "select_method"; readonly methodId: string }
  | {
      readonly type: "submit_secret"
      readonly stepId: string
      readonly value: string
    }
  | { readonly type: "confirm"; readonly stepId: string }
  | { readonly type: "ack_open_url"; readonly stepId?: string }
  | { readonly type: "cancel" }

type AgentAuthSession = {
  readonly sessionId: string
  readonly agentId: AgentId
  readonly status: AuthSessionStatus
  readonly methodId: string | null
  readonly steps: readonly AuthStep[]
  readonly error: string | null
}

/** Full auth resource: GET /v1/agents/:agentId/auth */
type AgentAuthResource = {
  readonly agentId: AgentId
  readonly status: AgentAuthStatus
  readonly error: string | null
  readonly methods: readonly AgentAuthMethod[]
  readonly session: AgentAuthSession | null
  readonly hostBrowser: HostBrowserStatus
}
```

### HostBrowser capability

```ts
type HostBrowserStatus =
  | { readonly state: "missing" }
  | { readonly state: "installing" }
  | { readonly state: "ready" }
  | { readonly state: "error"; readonly message: string }

type HostBrowser = {
  status: () => HostBrowserStatus
  /** One context per auth session when an adapter needs automation */
  openContext: (input: {
    readonly ownerSessionId: string
  }) => Promise<HostBrowserContext>
}

type HostBrowserContext = {
  readonly ownerSessionId: string
  navigate: (url: string) => Promise<void>
  /** Adapter-defined; library TBD */
  readNeededInputs: () => Promise<readonly BrowserNeededInput[]>
  fill: (input: {
    readonly fieldId: string
    readonly value: string
  }) => Promise<void>
  dispose: () => Promise<void>
}

type BrowserNeededInput = {
  readonly fieldId: string
  readonly label: string
  readonly secretKind: "api_key" | "oauth_token" | "otp" | "other"
}
```

### Adapter contract

```ts
type AuthCompletionPolicy = "reconnect" | "reuse_process"

type AdapterAuthContext = {
  readonly agentId: AgentId
  readonly hostIdentity: { readonly id: "default" }
  readonly hostBrowser: HostBrowser
  /** Last initialize result, if the agent process is up */
  readonly initializeResult: unknown | null
}

type AuthAdapter = {
  readonly id: string
  /** Which catalog / custom agent ids this adapter owns */
  matches: (agentId: AgentId) => boolean

  clientAuthCapabilities: (
    ctx: AdapterAuthContext,
  ) => Record<string, unknown>

  listMethods: (
    ctx: AdapterAuthContext,
  ) => Promise<readonly AgentAuthMethod[]>

  probe: (ctx: AdapterAuthContext) => Promise<{
    readonly status: AgentAuthStatus
    readonly error: string | null
    readonly canLogout: boolean
  }>

  /** Optional ACP authenticate after initialize; never catalog fantasy ids */
  onStart: (ctx: AdapterAuthContext) => Promise<void>

  start: (
    ctx: AdapterAuthContext,
    input: {
      readonly sessionId: string
      readonly methodId: string | null
      readonly fromChallenge: boolean
    },
  ) => Promise<{ readonly steps: readonly AuthStep[] }>

  continue: (
    ctx: AdapterAuthContext,
    input: {
      readonly sessionId: string
      readonly action: Exclude<AuthSessionAction, { type: "cancel" }>
    },
  ) => Promise<{
    readonly steps: readonly AuthStep[]
    readonly finished: null | {
      readonly outcome: "succeeded" | "failed"
      readonly completionPolicy: AuthCompletionPolicy
      readonly error: string | null
    }
  }>

  abort: (
    ctx: AdapterAuthContext,
    input: { readonly sessionId: string },
  ) => Promise<void>

  logout: (
    ctx: AdapterAuthContext,
  ) => Promise<{ readonly completionPolicy: AuthCompletionPolicy }>
}
```

### Broker surface

```ts
type AuthBroker = {
  getSummary: (agentId: AgentId) => Promise<AgentAuthSummary>
  getResource: (agentId: AgentId) => Promise<AgentAuthResource>

  /** Supervisor calls after initialize (and after respawn) */
  observeInitialize: (input: {
    readonly agentId: AgentId
    readonly initializeResult: unknown
  }) => Promise<void>

  ensureReadyForPrompt: (
    agentId: AgentId,
  ) => Promise<
    | { readonly ok: true }
    | { readonly ok: false; readonly status: AgentAuthStatus }
  >

  startSession: (input: {
    readonly agentId: AgentId
    readonly methodId?: string
  }) => Promise<AgentAuthSession>

  /** auth_required: create or return the single in-flight session */
  ensureSessionFromChallenge: (
    agentId: AgentId,
  ) => Promise<AgentAuthSession>

  applyAction: (input: {
    readonly agentId: AgentId
    readonly sessionId: string
    readonly action: AuthSessionAction
  }) => Promise<AgentAuthSession>

  logout: (agentId: AgentId) => Promise<AgentAuthSummary>

  /** Fan-out to paired devices */
  subscribe: (
    listener: (event: {
      readonly agentId: AgentId
      readonly resource: AgentAuthResource
    }) => void,
  ) => () => void
}
```

### Supervisor seam

```ts
// start(agentId):
//   spawn → initialize(adapter.clientAuthCapabilities)
//   → adapter.onStart (optional real authenticate)
//   → broker.observeInitialize → adapter.probe
//   → mark ACP runtime ready even when auth summary is needs_auth
//   → never authenticate(catalog.authMethodId)

type SupervisorAuthHooks = {
  readonly resolveAdapter: (agentId: AgentId) => AuthAdapter
  readonly authBroker: AuthBroker
  readonly requestRespawn: (agentId: AgentId) => Promise<void>
}
```

## Considered options

### Architecture shape

| Option | Verdict | Why |
|--------|---------|-----|
| Host capability + broker + adapters | **Selected** | Browser reusable. Broker stays UX/session. Adapters own agent differences. |
| Browser only inside Claude adapter | Rejected | Locks a host facility into one agent. Harder status/install UX. |
| Broker owns browser sessions directly | Rejected | Mixes orchestration with automation. Harder to stub and reuse. |

### Device UX for login

| Option | Verdict | Why |
|--------|---------|-----|
| Closed step vocabulary (v1) | **Selected** | One UX for web console, web chat, Android. |
| Raw PTY / terminal view in clients | Rejected | Bad remote UX. Wrong for phones. Host should translate. |
| Adapter-defined freeform UI schema now | Deferred | Future target. Keep step model extensible. |

### Auth vs enable

| Option | Verdict | Why |
|--------|---------|-----|
| Enable and auth separate | **Selected** | Host may already be logged in. Devices can Sign in later from chat. |
| Enable requires auth first | Rejected | Blocks spawn/probe. Couples settings to provider login. |
| Enable always opens auth | Rejected | Noisy when host creds already work. |

### Method list source

| Option | Verdict | Why |
|--------|---------|-----|
| Adapter-declared methods | **Selected** | Claude often returns empty ACP `authMethods` unless we advertise terminal. Product still needs Sign in. |
| Raw ACP `authMethods` only | Rejected | Empty list hides real host login paths. |
| Blind catalog `authMethodId` on start | Rejected | Broke Claude (`Method not implemented`). |

### Concurrency

| Option | Verdict | Why |
|--------|---------|-----|
| One auth session per agent id | **Selected** | Host creds and login flows collide otherwise. |
| One auth session per device | Rejected | Two phones fighting one Claude login. |
| Host-wide browser lock/queue | Rejected for v1 | Extra complexity. Common case is one device. Browser context follows the auth session. |

### Credentials

| Option | Verdict | Why |
|--------|---------|-----|
| Single host OS identity | **Selected for v1** | Matches one operator install. |
| Per-agent isolated cred namespaces | Deferred | Pass a host-identity handle into adapters so this can land later. |
| Store long-lived provider tokens in app DB as source of truth | Rejected | Host is the vault. Broker is not a password manager. |

## Consequences

- Supervisor start must stop calling `authenticate` with catalog ids. Slice 0
  can stub the broker and still fix Claude spawn failure mode.
- Agent settings wire grows an auth summary. Clients need Sign in / Sign out
  entry points on console and later chat.
- Host settings gains headless browser status/install even if the first browser
  implementation is a `missing` stub.
- Claude support likely uses HostBrowser and/or host token install inside a
  Claude adapter, not a client terminal and not a fake `claude-acp` method id.
- Default adapter gives unknown ACP agents a minimal Sign in path when they
  expose agent-type methods. Terminal-only agents need a dedicated adapter or
  stay disabled-with-reason until one exists.
- Paired devices are full operators for agent auth ([ADR-0002](0002-device-authorization.md)).
  Revisit if least-privilege device roles appear later.

## Sources

- [ACP v1 Authentication][acp-auth]
- [ACP Terminal Authentication RFD][acp-terminal-auth]
- [Claude Code authentication][claude-auth]
- Grill session decisions (2026-08-22): host broker Option E, closed steps,
  HostBrowser as optional host capability, enable ≠ auth

[acp-auth]: https://agentclientprotocol.com/protocol/v1/authentication
[acp-terminal-auth]: https://agentclientprotocol.com/rfds/auth-methods
[claude-auth]: https://code.claude.com/docs/en/authentication
