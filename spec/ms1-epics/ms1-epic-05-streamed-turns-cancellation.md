# Milestone 1 Epic 05: Streamed Turns and Cancellation

Status: Planned  
Milestone: 1 — Core local operator

## Outcome

Deliver the first real end-to-end agent conversation: an operator submits
multiple prompts, receives streamed Cursor ACP output, observes tool activity,
and cancels the current turn without ending the session.

## Dependencies

- [Epic 03: ACP Supervision and Session Lifecycle](ms1-epic-03-acp-session-lifecycle.md)
- [Epic 04: Journal and Reconnectable Event Stream](ms1-epic-04-journal-event-stream.md)
- Existing React, TypeScript, Vite, and Tailwind application

## Turn model

- Permit one foreground turn at a time per session.
- Assign every turn a Relay ID before sending its prompt to ACP.
- Journal the outbound prompt before or atomically with marking the turn active.
- Route all `session/update` notifications to the active turn and session.
- Treat the ACP prompt result as the authoritative terminal stop reason.
- Preserve late ACP updates received after cancellation until the terminal
  cancelled state is observed.
- Keep the session available for another prompt after cancellation.

Use pure reducers to derive turn and transcript state from journal records.

## HTTP API

Expose:

- `POST /v1/sessions/:id/prompts`
- `POST /v1/sessions/:id/cancel`

Commands must:

- Use shared Zod request and response schemas.
- Return stable command and turn identifiers.
- Reject a second prompt while the same session has an active turn.
- Reject cancellation when no cancellable turn exists.
- Be retry-safe through an idempotency or command identifier.
- Return structured errors for disconnected, archived, missing, or
  non-resumable sessions.

## ACP behavior

- Send `session/prompt` with the internal ACP session ID.
- Stream `session/update` notifications into the journal and WebSocket.
- Send `session/cancel` for the current turn on cancellation.
- Continue accepting valid late updates until ACP confirms terminal state.
- Automatically answer `session/request_permission` with the one-time allow
  option defined in epic 03.
- Fail explicitly if no permissive option exists.

## Web chat slice

Create `apps/web/src/features/chat` with:

- Typed prompt and cancel commands
- One reconnecting WebSocket client using durable cursors
- An immutable reducer for transcript, turn, tool, and connection state
- Rendering for user messages, agent text, tool activity, permission activity,
  completion, cancellation, and failure
- A cancel action visible only during a cancellable turn
- Disabled prompt submission while the selected session already has an active
  turn
- Honest disconnected and replaying states

Replace the simulated chat behavior in `prototype/server-ui/app.js`; do not
copy its timers, hardcoded responses, or approval card.

## Acceptance criteria

- A prompt reaches the correct ACP session.
- Agent text and tool activity appear incrementally through the shared event
  stream.
- Multiple completed turns preserve order in one session.
- Cancel stops the current turn and leaves the session usable.
- Late updates after cancel are handled without reverting terminal state.
- Duplicate command retries do not submit duplicate ACP prompts or cancels.
- Permission handling never pauses for a Relay approval UI.
- Reloading or reconnecting the web app reconstructs the same transcript from
  the durable cursor and journal.
- Server or ACP failure appears as an explicit turn/session error.

## Verification

- Contract tests cover prompt, cancel, turn, and streamed-event schemas.
- Integration tests cover multi-turn ordering, active-turn conflict,
  cancellation, late updates, permission requests, command retries, and ACP
  process failure.
- Web tests cover streamed rendering, cancel availability, disconnect/replay,
  completion, and error states.
- A guarded end-to-end smoke test uses real Cursor ACP for one prompt and
  cancellation when credentials are available.

## Failure and recovery

- A command accepted by Relay has a durable record before success is returned.
- ACP failure during a turn records an explicit terminal error.
- WebSocket loss does not cancel the turn.
- Reconnect replays the missing turn records after the client's last cursor.
- Cancellation timeout reports uncertainty without inventing success.

## Out of scope

- Parallel turns within one session
- Concurrent execution across multiple sessions
- Full Relay restart recovery
- Transcript search, export, branching, or duplication
- Relay-level approvals
