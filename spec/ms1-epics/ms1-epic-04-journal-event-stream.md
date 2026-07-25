# Milestone 1 Epic 04: Journal and Reconnectable Event Stream

Status: Planned  
Milestone: 1 — Core local operator

## Outcome

Create a durable, append-only record of session activity and a reconnectable
WebSocket stream that delivers ordered replay followed by live events without
gaps or duplicates.

## Dependencies

- [Epic 03: ACP Supervision and Session Lifecycle](ms1-epic-03-acp-session-lifecycle.md)
- SQLite migrations and durable session records
- Shared event and error contracts

## Journal boundary

Persist:

- Session-scoped outbound ACP requests and notifications
- Session-scoped inbound ACP updates, responses, and permission traffic
- Relay lifecycle records needed to explain session state
- Relay errors associated with a session or turn

Do not persist:

- ACP initialization traffic
- Authentication requests, responses, or secrets
- Unrelated process logs

Each journal record includes:

- Durable global cursor
- Relay session ID
- Internal ACP session ID when available
- Per-session sequence number
- Timestamp
- Negotiated protocol version
- Direction
- Record kind
- Raw payload

Journal records are immutable after commit.

## Persistence behavior

- Add explicit journal migrations.
- Allocate global cursors and per-session sequences transactionally.
- Preserve raw JSON payloads without normalizing them into a competing protocol.
- Validate journal metadata and raw payload boundaries with Zod.
- Add indexes for cursor replay and session-scoped reads.
- Define a bounded replay query that cannot load an unbounded history into
  memory.

## Projections

Build pure projections from journal records for:

- Current session lifecycle state
- Current turn state
- Displayable transcript entries
- Tool activity
- Permission activity
- Completion, cancellation, and failure

Do not maintain a second mutable transcript store. Persisted session metadata
may cache current lifecycle state when transactionally derived from the same
journal append.

## WebSocket API

Expose `GET /v1/events` as a WebSocket upgrade with:

- Optional replay after a durable cursor
- Optional workspace and session filters
- Bounded replay batches
- Atomic transition from replay to live delivery
- Heartbeats and dead-connection cleanup
- Explicit invalid, future, and stale cursor errors
- Versioned event envelopes from `packages/contracts`

The server must apply backpressure limits and close clients that cannot keep up
with an actionable error.

## Acceptance criteria

- Every persisted record has a unique increasing global cursor.
- Per-session sequence numbers are contiguous under concurrent appends.
- Reconnecting after cursor N delivers all matching records after N, then live
  records, exactly once for that connection.
- Records appended during replay are not lost or duplicated at the live
  handoff.
- Session and workspace filters cannot leak unrelated events.
- Restarting Relay preserves replay cursors and projection results.
- Authentication and initialization payloads never enter the journal.
- Protocol-version metadata is retained with each raw ACP payload.

## Verification

- Migration tests cover initial creation and repeated startup.
- Property-focused tests cover ordering and projection determinism.
- Integration tests cover replay, live delivery, reconnect, filters,
  heartbeat, invalid cursors, bounded batches, and slow clients.
- Race tests append events while a client transitions from replay to live.
- Restart tests compare projections before and after process restart.

## Failure and recovery

- A failed append commits neither the journal record nor derived session state.
- WebSocket disconnect never changes session execution state.
- A client can recover from disconnect using its last committed cursor.
- Corrupt raw payloads remain inspectable but produce explicit projection errors
  rather than crashing Relay.

## Out of scope

- Prompt and cancel HTTP commands
- Web chat rendering
- Cross-device authentication
- Journal search, export, pruning UI, or analytics
- Normalizing ACP into a Relay-owned event protocol
