# Prototype API

This is a mutable fake API backed by [JSON Server](https://github.com/typicode/json-server).
It exists to stabilize UI and Android contracts before implementing the
Fastify server.

```bash
bun install
bun run dev       # http://127.0.0.1:3001
bun run check     # TypeScript + Zod validation
```

## Resources

- `GET /serverStatus`
- `GET|PATCH /settings`
- `/workspaces`
- `/agents?workspaceId=:id`
- `/devices`
- `/pairingCodes`
- `/approvals?state=pending`
- `/activityEvents?_sort=-occurredAt`
- `/proxyGuides`

Array resources receive JSON Server's normal list, create, update, and delete
routes. `contracts.ts` is the proposed shared contract boundary. The production
server should place each resource's schema, handler, service, and tests together
as a vertical slice rather than copying this prototype's database shape into a
layered architecture.

The pairing codes and device fingerprints are presentation-only fixtures; they
do not implement authentication or contain real key material.

See `http-contracts.md` for the proposed command and realtime boundary that the
Fastify implementation can expose later.
