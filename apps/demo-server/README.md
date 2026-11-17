# Demo SSH server

A small Bun SSH server for trying the Harold app without a real host. It
accepts any username and any password or public key, serves a virtual
filesystem over SFTP, and runs scripted ACP sessions over SSH exec.

## Run

```sh
cd apps/demo-server
bun install --frozen-lockfile
PORT=3937 bun run start
```

From an Android emulator the host is `10.0.2.2`. The production demo listens
on TCP `3937`.

Environment:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Listen address |
| `PORT` | `2222` | Listen port |
| `HOST_KEY` | embedded demo key | Optional PEM/OpenSSH host key override |
| `DEMO_SEED_WARNING_RUN` | `0` | `1` adds an inactive 600 MB run to the logs section |

The embedded host key is a public demo key. It lives in
[`src/host.key.ts`](./src/host.key.ts) so the runtime never reads the
container filesystem.

## Hardening

- The server never reads the real container filesystem at runtime. `/home/demo`
  and everything below it is an in-memory `VfsStore`; SFTP reads, SFTP writes,
  and exec commands never reach host paths.
- Client SFTP writes are acknowledged and discarded. They never copy the
  payload into the VFS.
- Host logs are byte counters, not log content. A seeded 600 MB warning run
  costs a number, not a 600 MB buffer.
- Host commands carry the inline host script. The server parses only the short
  `harold-agent <mode> ...` suffix and never tokenizes the script body.
- Hard caps: 16 connections, 16 sessions per connection, 64 SFTP handles,
  16 KB ordinary exec commands, 32 KB host-script commands, 256 KB ACP input
  lines, 64 pending lines, 32 host runs per agent, and 100 ACP sessions per
  agent.
- The server does not log commands or client input.

## Tests

```sh
bun test
bun run typecheck
```
