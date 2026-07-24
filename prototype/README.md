# Agent Server prototypes

Two deliberately lightweight prototypes explore the product before the real
Fastify/vertical-slice server is introduced:

- `server-api` — JSON Server resources plus executable Zod contracts.
- `server-ui` — a local-only vanilla web management console and chat client.

## Run locally

In one terminal:

```bash
cd prototype/server-api
bun install
bun run dev
```

In another:

```bash
cd prototype/server-ui
npm install
npm run dev
```

Open `http://127.0.0.1:3000`. The UI reads the API at
`http://127.0.0.1:3001` and falls back to built-in demo data if it is not
running.

Nothing here starts Cursor or exposes a public listener. Pairing, proxy tests,
ACP events, filesystem selection, approvals, and chat streaming are simulated
to make the interaction model testable.
