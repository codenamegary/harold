# Session stream frames: tolerant unknown types, terminal malformed

Status: Accepted  
Related: [ADR-0000 Harold](0000-harold.md), [CONTEXT.md](../../CONTEXT.md)

The Session Stream is the only Device API surface where the host can push a
shape a client build has never seen. Android ships independently of the
server, so an old build must survive frames added after its release, while the
web client redeploys with the server and stays strict. Clients classify every
inbound Frame: a known `type` with valid required fields decodes, an unknown
`type` is dropped and counted, and a known `type` with missing or invalid
required fields is a terminal Protocol Error.

## Decision

1. Classify each inbound Frame as **Decoded**, **Unknown Frame**, or
   **Malformed Frame**.
2. Unknown Frames never end the Stream. The client discards them and keeps a
   count for diagnostics.
3. Malformed Frames end the Stream as a terminal Protocol Error. The client
   cancels the socket and stops auto-retry until the operator asks.
4. Unknown keys inside a known Frame are ignored. Required fields must still
   decode; a missing or invalid required field is malformed.
5. Additive evolution of the Session Stream happens through new frame `type`
   values. Changing the meaning of an existing Frame in place is a breaking
   change and needs a new type.
6. HTTP payloads stay strict (`HaroldJson`). Requests are answered in
   lockstep with the server release, so unknown keys there are drift.
7. Payloads the client interprets selectively (`update`, `session_config`
   `configOptions`, permission `params`) stay opaque on the wire. Their
   parsers drop shapes they do not recognize instead of failing the Frame.

## Considered options

- **Server-side per-build filtering.** The host would need to know which
  frames each client build understands, and version negotiation to learn it.
  Rejected: more moving parts and a host that must reason about app releases.
- **Tolerate malformed frames too.** A Frame the client actively interprets
  cannot be trusted when its required fields do not decode. Rejected: silent
  wrong state is worse than a stopped Stream.
- **Strict decoding of unknown keys.** An extra key cannot change the meaning
  of the required routing fields, and strictness turns a benign server
  addition into a dead Session for old builds. Rejected.

## Consequences

- The host may add frame types and extra fields at any time; it may not
  redefine an existing Frame's meaning.
- The dropped-Frame count is diagnostics only until a surface consumes it.
- Independently released clients (Android) require the tolerant decode. A
  client that redeploys with the server (web) may keep strict decoding.
