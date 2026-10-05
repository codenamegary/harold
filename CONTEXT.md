# Harold

Harold is a local host process. It speaks HTTP and WebSocket to operator
clients through the Device API, and ACP over stdio to agent child processes.
This is the canonical language for docs, contracts, and UI copy.

## Language

### Product and topology

**Harold**:
The product name for the host process and its device-facing API. One install,
one host OS identity in v1. The package is `@codenamegary/harold`, the CLI
binary is `harold`, and the data dir is `~/.harold`.
_Avoid_: Agent Server, agent-server, harold (as a product name), the server,
backend

**Host**:
The machine and process that run Harold, acting as the ACP client toward
agent processes. The host has no principal on the Device API; local
operators use the `harold` CLI, which reads host state directly.
_Avoid_: host (for a client), host principal

**Device**:
A paired client that holds a durable opaque credential and acts as a full
operator over the Device API. Devices never speak ACP and never hold
provider secrets as the source of truth.
_Avoid_: client (bare), phone

**Device API**:
The shared HTTP and WebSocket contract under `/v1` that all clients call.
Defined in `packages/contracts`, served by `apps/server`.
_Avoid_: ACP API, backend API

**Capability**:
A facility or protocol feature. Always qualify the sense: **ACP agent
capability** (what an Agent advertises on `initialize`), **ACP client
capability** (what the host advertises on `initialize`), or **host capability**
(a host-owned facility, for example HostBrowser).
_Avoid_: bare "capability" for device permissions

### Agents and sessions

**Agent**:
An ACP agent process the host can enable, spawn, and talk to, identified by a
catalog **agent id**.
_Avoid_: bot, model

**Agent id**:
The catalog identifier for an Agent, for example `cursor` or `claude`.
_Avoid_: agent name, agent type

**ACP**:
Agent Client Protocol. The host is the ACP client; each agent process is an
ACP server.
_Avoid_: calling the Device API "the ACP API"

**Workspace**:
A named host directory the operator registers. Agents use it as their working
directory and root.
_Avoid_: project, folder

**Session**:
An ACP chat session, identified by an Agent id plus an ACP `sessionId`. Not a
device credential and not an agent-auth session.
_Avoid_: reusing "session" alone for device auth or provider login

**Agent-auth session**:
An in-flight provider login flow for one Agent id. Host-owned; credentials
live in host tooling, never in the broker.
_Avoid_: login session, auth session

### Session stream

**Session Stream**:
The WebSocket at `/v1/sessions/stream` over which a client follows one Session
and exchanges frames with the host.
_Avoid_: event stream, event bus

**Frame**:
One JSON envelope on the Session Stream, discriminated by a `type` field and
addressed to one Session.
_Avoid_: event, message

**Unknown Frame**:
A Frame whose `type` the receiving client build does not recognize. Dropped
and counted; never ends the stream.
_Avoid_: unexpected frame, bad frame

**Malformed Frame**:
A Frame with a recognized `type` whose required fields are missing or
invalid. A terminal protocol error.
_Avoid_: invalid JSON (that is only one cause)

**Session Config**:
The ACP config options an Agent exposes for a Session: reserved categories
model, mode, and thought level, plus agent-specific others.
_Avoid_: agent settings, composer config

**Protocol Error**:
A terminal Session Stream failure caused by a Malformed Frame. Auto-retry
stops until the operator asks.
_Avoid_: fatal error
