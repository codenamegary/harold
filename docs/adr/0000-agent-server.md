# Agent Server: terms and topology

Status: Draft  
Related: [ADR-0001 Device authentication](0001-device-authentication.md),
[ADR-0002 Device authorization](0002-device-authorization.md),
[ADR-0003 Device pairing](0003-device-pairing-protocol.md),
[ADR-0004 Agent auth broker](0004-agent-auth-broker.md),
[ADR-0005 Session stream frames](0005-session-stream-frames.md)

Agent Server is a local host process. It speaks HTTP and WebSocket to operator
clients. It speaks ACP to agent child processes. This ADR records the topology
and the naming boundaries for that split. The shared words live in
[CONTEXT.md](../../CONTEXT.md). Later ADRs decide auth, pairing, and agent
login. This one only names the map.

## Decision

1. Treat **Agent Server** as the product name for the host process and its
   device-facing API. One install. One host OS identity in v1.
2. Use [CONTEXT.md](../../CONTEXT.md) as the canonical glossary in docs,
   contracts, and UI copy. Prefer a qualified phrase when a bare word collides
   (for example **ACP agent capability** vs **host capability**).
3. Keep **devices off ACP**. Devices and the operator console call the Device
   API only. The host is the ACP client. Agent processes are ACP servers.
4. Draw the topology as three bands: clients, host process, ACP agents. Do not
   draw provider login UI on devices as a direct ACP path
   ([ADR-0004](0004-agent-auth-broker.md)).

## Glossary

The canonical glossary lives in [CONTEXT.md](../../CONTEXT.md). This ADR
keeps the topology and naming boundaries below.

## Topology

```mermaid
flowchart TB
  subgraph clients [Clients]
    Console[Operator console<br/>web, usually loopback]
    Android[Paired device<br/>Android / remote clients]
  end

  subgraph host [Host — Agent Server process]
    API[Device API<br/>HTTP + WS /v1]
    Auth[Authn / authz<br/>host or device principal]
    Workspaces[Workspaces]
    AgentSettings[Agent settings]
    SessionHub[Session hub]
    Caps[Host capabilities<br/>e.g. HostBrowser]
    Super[ACP supervisor]
  end

  subgraph agents [ACP agents]
    Proc[Agent child processes]
  end

  Console -->|host principal| API
  Android -->|Bearer device principal| API
  API --> Auth
  Auth --> Workspaces
  Auth --> AgentSettings
  Auth --> SessionHub
  AgentSettings --> Super
  SessionHub --> Super
  Super -->|stdio JSON-RPC| Proc
  Caps -.-> Super
  Caps -.-> AgentSettings
```

### How the bands interact

1. **Operator console → Device API.** Loopback operator. Registers workspaces.
   Enables agents. Opens chat. Issues pairing codes.
2. **Device → Device API.** Claims a pairing code once. Then uses Bearer on
   every call. Same operator surface as the console.
3. **Device API → host modules.** Auth picks the principal. Routes hit
   workspaces, agent settings, session hub, devices.
4. **Host → agents.** Supervisor spawns enabled agents. Initializes with ACP
   client capabilities. Proxies session create, prompt, permissions, fs, and
   terminal against workspace roots.
5. **Host capabilities.** Optional host facilities (browser automation, and
   later others) sit beside the supervisor. Adapters or ACP handlers may use
   them. Clients still only see Device API shapes.

### Chat path (sketch)

```mermaid
sequenceDiagram
  participant Client as Console or device
  participant API as Device API
  participant Hub as Session hub
  participant Super as ACP supervisor
  participant Agent as Agent process

  Client->>API: create session (workspace cwd, agentId)
  API->>Super: session/new
  Super->>Agent: ACP session/new
  Agent-->>Super: sessionId
  Super-->>API: session
  API-->>Client: session

  Client->>API: WS /v1/sessions/stream
  Client->>API: prompt
  API->>Hub: fan in
  Hub->>Super: prompt
  Super->>Agent: ACP prompt
  Agent-->>Super: session/update …
  Super-->>Hub: updates
  Hub-->>Client: WS events
```

### Pairing path (sketch)

```mermaid
sequenceDiagram
  participant Console as Operator console
  participant API as Device API
  participant Device as New device

  Console->>API: POST pairing code (host principal)
  API-->>Console: code + QR payload
  Device->>API: POST claim(code)
  API-->>Device: opaque credential once
  Device->>API: later calls with Bearer
```

## Boundaries we keep sharp

| Do | Do not |
|----|--------|
| Call the HTTP/WS surface the **Device API** | Call it "the ACP API" |
| Say **host** for the process and loopback principal | Call the web UI "the host" |
| Say **operator console** for the web UI | Say "admin panel" or "dashboard" in product copy |
| Qualify **capability** (ACP agent / ACP client / host) | Use bare "capability" for authz |
| Say **session** for ACP chat | Reuse "session" alone for device auth or agent login |

## Consequences

- New docs and UI strings should match [CONTEXT.md](../../CONTEXT.md). Rename
  drift when found.
- ADR-0001 through ADR-0004 stay the decision records for auth, pairing, and
  agent login. This ADR is the map they sit on.
- If a later milestone splits operator roles, update **Device** and **Device
  API** here before scattering new words through feature ADRs.

## Open questions for review

1. Is **Device API** the right product name, or should contracts say **Operator
   API** (since the host console uses it too)?
2. Should **Host** mean only the process, with **host principal** always spelled
   out for auth?
3. Do we want **Agent Server** vs **agent-server** vs **host** called out as
   three layers (product / package / runtime role)?

