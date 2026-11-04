# demo-server

A fake Harold for app-store review. It speaks the app-facing HTTP and SSE
contracts, so the production Android app pairs with it like a real server. No
app code changes and no demo button in the app.

The server is deliberately small. It has no runtime dependencies, no database,
and no access to a shell, filesystem, git, or host. All data is fictional and
lives in memory with a 15 minute TTL.

## Run

From the repository root:

```bash
bun run apps/demo-server/src/main.ts
```

`PORT` defaults to `8080`. `HOST` defaults to `0.0.0.0`.

Pair the Android app with:

- Endpoint: `http://<host>:8080` (from an Android emulator, `http://10.0.2.2:8080`)
- Pairing code: any three characters, a dash, and any three more characters, in
  any case or alphabet, for example `DEM-O01` or `abc-_12`

Every claim returns a fresh stateless credential. A server restart does not
force re-pairing, because the token carries its device id.

## What the reviewer sees

- Two workspaces: `aurora-web` and `pixel-garden`.
- Three sessions, newest first.
- One rich transcript on every seeded session with thinking, Markdown, read,
  edit, execute, usage, and a failed tool row.
- Turn 1 of every session runs the full demo: permission, elicitation form, and
  extension panels, then the final answer.
- Turns 2 and 3 return short canned replies.
- Turn 4 and later return a fixed end-of-demo block.
- `aurora-web` has 3 uncommitted files, 2 worktrees, and a non-empty diff.
  `pixel-garden` is clean and has 1 worktree.
- Attachments upload to a fake descriptor. Image uploads return the Harold logo;
  other uploads return the DNS haiku.

## Data handling

- Prompt text and claim bodies are never parsed, logged, buffered, or stored.
- Elicitation and extension reply bodies are never read.
- Permission replies read only `optionId`.
- Uploads read only the multipart file part `Content-Type`, then cancel the
  body. No bytes are stored and nothing is written to disk.
- No request body or credential is logged.
- The only state is in memory: workspaces, sessions, turn metadata, fake
  attachments, and fake directories, keyed by device.

## Sessions and TTL

Device and session state has an absolute 15 minute TTL from creation. Activity
never extends it. A reaper runs every 60 seconds and removes expired sessions.
When all sessions are gone and the device has expired, the device state is
removed. The credential stays valid and the next request reseeds the demo.

Each session stores at most 3 turn records. A turn record keeps only the turn
number, kind, selected canned reply index, status, and bounded panel resolution
metadata. The full transcript is rebuilt from fixed scripts.

## Endpoints

- `GET /healthz`
- `GET /v1/status`
- `GET /review-pairing-qr.png` (the Play review pairing QR)
- `GET /foreground-service-demo.mp4` (the Play foreground-service demo video)
- `POST /v1/pairing-codes/:code/claim`
- `GET /v1/settings/runtime`
- `GET /v1/settings/agents`
- `GET /v1/agents/opencode/auth`
- Workspace, filesystem, session, git, attachment, and device routes matching
  the app contracts.
- `GET /v1/sessions/:id/events` streams SSE with a `: ping` every 25 seconds.
- `GET /demo/attachments/harold-logo.png`
- `GET /demo/attachments/its-not-dns.txt`

## Verify

```bash
cd apps/demo-server
bun run typecheck
bun run lint
bun test
bash test/smoke.sh
```

The tests validate every REST body and every SSE frame with the Zod schemas in
`packages/contracts`. They also cover state isolation, restart-safe credentials,
TTL and reaping, canned reply replay, omitted prompt text, upload privacy, and
the fixed `unknown` agent auth state.
