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
npx @codenamegary/harold setup

# daily use
npm install -g @codenamegary/harold
harold serve
```

Setup starts the daemon detached and exits; `harold stop` stops it. Use
`harold serve` when you want the daemon in the foreground.

Never run bare `npx harold`. That name belongs to an unrelated dormant
package on npm.

### Android app

Download `harold-android-<version>.apk` from the latest
[`harold-android-v*` release](https://github.com/codenamegary/harold/releases)
and open it on the phone. Android asks once to allow installs from your
browser. Later releases install over the top.

Each release lists the APK SHA-256 and the signing certificate SHA-256. To
check a download on a computer with the Android SDK:

```sh
sha256sum harold-android-<version>.apk
apksigner verify --print-certs harold-android-<version>.apk
```

If you installed an older debug-signed build of `harold.android`, uninstall
it once before the first release install. The signatures differ, so Android
refuses to update it in place.

## Run from source

Requires [Bun](https://bun.sh).

```sh
bun install
bun run dev serve
```

`bun run dev` runs the CLI. Pass it any command: `bun run dev setup`,
`bun run dev status`, `bun run dev stop`. With no command it prints the
command surface. Setup leaves the daemon running in the background.

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

release-please watches two packages and opens a separate release PR for
each.

- `apps/cli`: `feat`/`fix` commits touching `apps/cli` open a release PR
  for `@codenamegary/harold`. Merging it tags `vX.Y.Z`, publishes to npm
  with provenance (`publish-cli`), and smoke tests
  `npx @codenamegary/harold --version`.
- `apps/android`: `feat`/`fix` commits touching `apps/android` open a
  release PR that bumps `versionName`. Merging it tags
  `harold-android-vX.Y.Z` and runs `release-android`, which builds the
  signed APK and attaches it to the GitHub Release. To rebuild the APK for
  an existing release, dispatch `release-android` with the tag.

The npm bundle embeds the server, so a server-only change ships to npm
only through a CLI release: make the commit touch `apps/cli` (or pair it
with one) so release-please counts it.

## Checks

```sh
bun run check                                   # lint, typecheck, tests
cd apps/android && ./gradlew testDebugUnitTest  # Android unit tests
```

## Docs

- [CONTEXT.md](CONTEXT.md) is the canonical product language.
- [docs/adr](docs/adr) holds the architecture decision records.
