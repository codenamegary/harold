# Agent Server

Local operator console and gateway for ACP coding agents.

## Language

**Archived ACP session**:
A host-side filter row keyed by agent id and ACP session id. Deleted sessions stay out of the operator session list even when the agent still returns them from `session/list`.
_Avoid_: Dismissed session, hidden session, tombstone (as product language), archived host session (legacy SQLite lifecycle)
