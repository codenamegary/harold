# Harold

**Hark! The Harold Agents Sing**

Harold is a local host process. It speaks HTTP and WebSocket to operator
clients through the Device API, and ACP over stdio to agent child processes.
The paired Android app is the remote client; the `harold` CLI is the local
operator tooling.

## Layout

| Path                 | What lives there                            |
| -------------------- | ------------------------------------------- |
| `apps/server`        | The host process and Device API             |
| `apps/cli`           | The `harold` CLI                            |
| `apps/android`       | Paired device app                           |
| `packages/contracts` | Wire contracts shared by server and clients |

## Run from source

Requires [Bun](https://bun.sh).

```sh
bun install
bun run dev
```

The Device API listens on `127.0.0.1:3847`. Every route except
`GET /v1/status` and the pairing claim requires a device credential
(`Authorization: Bearer`). Pair a device with `harold pair` to get one.

## Configuration

| Variable          | Default     | Meaning                              |
| ----------------- | ----------- | ------------------------------------ |
| `HAROLD_HOST`     | `127.0.0.1` | Loopback bind address                |
| `HAROLD_PORT`     | `3847`      | Device API port                      |
| `HAROLD_DATA_DIR` | `~/.harold` | Database, logs, and runtime settings |

## Release binaries

`bun run build:release` compiles standalone binaries to
`apps/server/release/harold-<target>`. Releases attach `harold-linux-x64`,
`harold-darwin-arm64`, and `harold-windows-x64.exe` plus `SHA256SUMS`.

## Checks

```sh
bun run check                                   # lint, typecheck, tests
cd apps/android && ./gradlew testDebugUnitTest  # Android unit tests
```

## Docs

- [CONTEXT.md](CONTEXT.md) is the canonical product language.
- [docs/adr](docs/adr) holds the architecture decision records.
