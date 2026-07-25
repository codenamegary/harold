# Milestone 1 Epic 06: Concurrent Sessions and Restart Recovery

Status: Planned  
Milestone: 1 — Core local operator

## Outcome

Allow independent sessions to continue working in the background and recover
durable session context honestly after Relay or its ACP subprocess restarts.

## Dependencies

- [Epic 05: Streamed Turns and Cancellation](ms1-epic-05-streamed-turns-cancellation.md)
- Durable session records and append-only journal
- Capability-aware Cursor ACP adapter

## Concurrency model

- Relay owns one supervised ACP subprocess.
- The ACP connection multiplexes sessions by internal ACP session ID.
- Different sessions may have active turns concurrently.
- Each individual session remains limited to one foreground turn.
- Switching the selected workspace or session in the web app has no execution
  side effect.
- Every inbound ACP message must resolve to exactly one Relay session before it
  is journaled or projected.

Do not add workspace pause or implicit cancellation on navigation.

## Startup recovery

On Relay startup:

1. Apply SQLite migrations.
2. Rebuild session and turn projections from persisted records.
3. Start, initialize, and authenticate Cursor ACP.
4. Identify sessions that were active, idle, archived, or disconnected.
5. Load eligible sessions when Cursor advertises `session/load`.
6. Reconcile turns interrupted by Relay or ACP shutdown.
7. Publish explicit recovery lifecycle records.

Use the same public resume behavior when ACP v2 later replaces `session/load`
with `session/resume`.

## Recovery semantics

- A successfully loaded session continues with the same ACP conversation
  context.
- Persisted Relay transcript history is replayed from the journal, not
  duplicated from ACP load replay.
- A turn active at process loss becomes recovered only with positive protocol
  evidence; otherwise it becomes interrupted or failed.
- If loading is unsupported, rejected, or no longer valid, preserve history and
  mark the session non-resumable.
- Never create a new ACP session and present it as the old conversation.
- Archived sessions are not automatically loaded at startup.

## ACP process recovery

- Detect child exit and stop accepting prompts until ACP is ready.
- Mark affected sessions disconnected.
- Restart with bounded backoff.
- Reinitialize, authenticate, and reload eligible sessions.
- Prevent overlapping supervisors or duplicate reload attempts.
- Shut down cleanly without allowing the supervisor to restart intentionally
  stopped processes.

## Web behavior

- Show running, idle, disconnected, recovering, non-resumable, archived, and
  error states from real events.
- Keep background session indicators current while another session is selected.
- Preserve each session's last durable cursor and transcript projection.
- Disable commands only for the affected session or during a global ACP outage.
- Explain when history is available but the underlying agent cannot continue.

## Acceptance criteria

- Two sessions can stream turns concurrently without crossed events.
- A second prompt in the same session remains rejected while its turn runs.
- Switching views does not pause, cancel, or disconnect background work.
- Relay restart preserves workspaces, sessions, journal, and transcripts.
- Supported sessions reload into the same Cursor conversation context.
- Unsupported or rejected reloads retain history and show non-resumable state.
- ACP process exit triggers one bounded restart and session reconciliation path.
- No event is attributed to the wrong session.
- Recovery never fabricates completion or continuation.

## Verification

- Integration tests run two fake ACP sessions concurrently and assert strict
  routing isolation.
- Race tests cover simultaneous updates, cancel in one session, and completion
  in another.
- Process tests kill and restart Relay and the fake ACP process independently.
- Recovery tests cover successful load, unsupported load, rejected load,
  interrupted turn, archived session, and repeated restart.
- A guarded real-Cursor test confirms continuation of prior context after Relay
  restart when Cursor supports loading.

## Failure and recovery

- Backoff is bounded and visible through structured state and logs.
- Repeated ACP failure leaves Relay healthy enough to serve persisted history
  and status.
- Partial reload failure affects only the failed session.
- Recovery records are append-only and retry-safe.

## Out of scope

- Multiple ACP subprocesses
- Parallel turns within one session
- Remote clients or authentication
- High-availability Relay
- Session branching, duplication, search, or export
