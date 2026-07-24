# Proposed HTTP and realtime contract

The JSON Server resources intentionally resemble the eventual public API, but
commands should become explicit actions in Fastify instead of relying on direct
database mutations from clients.

## Management

```text
GET    /v1/status
GET    /v1/settings
PATCH  /v1/settings

GET    /v1/workspaces
POST   /v1/workspaces
GET    /v1/workspaces/:workspaceId
PATCH  /v1/workspaces/:workspaceId
DELETE /v1/workspaces/:workspaceId

GET    /v1/workspaces/:workspaceId/agents
POST   /v1/workspaces/:workspaceId/agents
GET    /v1/agents/:agentId
POST   /v1/agents/:agentId/prompts
POST   /v1/agents/:agentId/cancel
POST   /v1/agents/:agentId/archive

GET    /v1/devices
DELETE /v1/devices/:deviceId
POST   /v1/pairing-codes
POST   /v1/pairing-codes/:code/claim

GET    /v1/approvals?state=pending
POST   /v1/approvals/:approvalId/approve
POST   /v1/approvals/:approvalId/deny
```

Deleting a workspace unregisters its canonical path. It must never delete files.
Deleting a device revokes its key and terminates its active connections.

## Realtime

The Android and local chat clients connect to `/v1/events` over WebSocket. Each
event has an ordered server cursor so a reconnecting client can request missed
events.

```json
{
  "cursor": "evt_01JFC8C7E77NQCFH0RF9Z22JHH",
  "type": "agent.output.delta",
  "occurredAt": "2026-07-24T03:18:22.419Z",
  "workspaceId": "ws-agent-server",
  "agentId": "agent-auth",
  "runId": "run_01JFC814BRKPTDZY03NTQF0NE5",
  "payload": {
    "text": "I’ll inspect the existing authentication flow."
  }
}
```

Initial event vocabulary:

```text
server.status
device.connected
device.disconnected
workspace.changed
agent.created
agent.state
agent.output.delta
agent.output.complete
agent.tool.started
agent.tool.completed
agent.approval.requested
agent.question.requested
agent.plan.requested
run.completed
run.failed
```

ACP payloads should be normalized at this boundary. Mobile clients should not
depend directly on Cursor-specific JSON-RPC message shapes.
