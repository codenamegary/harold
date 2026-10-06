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

## Install

Requires [Bun](https://bun.sh). The package is
[`@codenamegary/harold`](https://www.npmjs.com/package/@codenamegary/harold);
its command is `harold`.

```sh
# first run, no install
npx @codenamegary/harold

# daily use
npm install -g @codenamegary/harold
harold
```

Never run bare `npx harold`. That name belongs to an unrelated dormant
package on npm.

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

## Releases

Two release tracks run on every merge to `main`, both driven by
release-please:

- **Repo and server.** Release PRs version the repo root and
  `apps/server/package.json`. Merging a release publishes binaries
  (`release-binaries`).
- **npm CLI.** Commits touching `apps/cli` (conventional commits only) open
  a release PR for `@codenamegary/harold`. Its releases are tagged
  `harold-vX.Y.Z`, and each one publishes to npm with provenance
  (`publish-cli`) and smoke tests `npx @codenamegary/harold --version`.

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
