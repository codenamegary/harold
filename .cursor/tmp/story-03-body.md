## What to build

Create `apps/server` as a loopback-only Fastify app. Config from env. Structured logging and errors. `GET /v1/status` returns the MS1 status skeleton. Graceful shutdown on SIGINT and SIGTERM.

## Acceptance criteria

- [ ] Server binds to `127.0.0.1` on port `3847` by default (`RELAY_PORT` overrides)
- [ ] `GET /v1/status` returns 200 with a response that matches `StatusSchema`
- [ ] Status reports `acp.state: stopped` and `acp.activeSessions: 0`
- [ ] Validation and internal errors return structured `ApiErrorSchema` responses
- [ ] Pino logs are structured JSON with no secrets or auth material
- [ ] Graceful shutdown closes the listener and leaves no open port
- [ ] Integration tests cover status, bind, shutdown, and error shape

## Blocked by

- https://github.com/codenamegary/agent-server/issues/8
- https://github.com/codenamegary/agent-server/issues/9
