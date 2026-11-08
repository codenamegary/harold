# Harold Android

Native Jetpack Compose app. Harold connects to your machines over SSH and drives ACP coding agents from the phone.

## Prerequisites

- JDK 17
- Android SDK with platform 36 and current build-tools
- `ANDROID_HOME` or `ANDROID_SDK_ROOT` pointing at the SDK

Install platform 36:

```sh
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

## Build commands

Run from this directory (`apps/android`):

```sh
./gradlew --no-daemon --stacktrace --warning-mode=all lintRelease testDebugUnitTest assembleRelease
```

Install a debug build on a connected device or emulator:

```sh
./gradlew :app:installDebug
```

## The SSH transport, end to end

Harold speaks to one machine per saved connection:

```
Android app -> SSH exec -> `agent acp` (one ACP process per session)
```

- Connecting to a host enrolls the phone with it: generate an Ed25519 key
  (or import a key, or use a password), append the public key to
  `~/.ssh/authorized_keys` on the host, and pin the host key by SHA-256
  fingerprint. The app refuses to connect if the host key changes later.
- A saved connection keeps a copy of its credential in the encrypted
  connection store. SSH keys and passwords can also be named and saved for
  reuse in a separate encrypted store; the SSH setup screen can pick an
  existing entry or create a new one. Removing a saved credential does not
  break a connection that already copied it.
- When several saved connections point at the same SSH endpoint, later rows
  get a numeric suffix on their connection id so they stay separate entries.

## Host state

Everything Harold keeps on the host lives under `~/.harold/`:

```
~/.harold/
  agents.json        shared agent config (written over SFTP, atomic temp + rename)
  workspaces.json    remembered workspace folders
  uploads/<sessionId>/...             attachment uploads
```

Session history stays with the agent. Harold reads it with ACP `session/list`
and compiles the per-agent lists in memory; it does not write session files
to the host. Older releases created `sessions/<agent>/<sessionId>.json`; those
files are ignored and safe to delete.

No Harold process, daemon, or port runs on the host. A closing app or a lost
network ends the agent process. Opening the session again spawns a fresh
process and resumes through ACP `session/load`.

## Agent settings

The per-connection Agents screen manages `agents.json`:

- A hardcoded catalog of known ACP agents ships with the app. Scanning probes
  the host with `command -v` for every known binary in one round trip.
- Detection merges into existing rows without touching user-owned fields
  (`enabled`, `args`). Working custom paths stay untouched. If a saved path
  no longer runs and the scan finds that agent at a new path, the new path
  replaces the dead one. Dismissed agents stay dismissed across scans.
  Custom agents (name, path, args) can be added for anything the catalog does
  not know and are deleted outright.
- Auth state is probed from the agent's own CLI (`claude auth status --json`,
  `cursor-agent status --format json`) with a 30 second TTL, and shown as a
  badge. Probing is advisory; sign-in always happens on the host, and
  restarting an agent respawns its process and re-probes.
- Composer capability buttons (images, files) come from the live ACP
  `initialize` response of the active session. Nothing is persisted: a
  session is text-only until its handshake completes.

## Offline cache

Room keeps the last snapshot of workspaces, sessions, and agents. Each row is
keyed by connection id, so several connections can share the database without
colliding. The database, DAOs, and repositories live in the shared
`:database` module, which `:chat` and `:workspaces` depend on. View models
collect the repository flows, then call `refresh` to read the live state from
the host over SSH. Removing a connection deletes every cached row for it.

## Debug and release builds

Debug builds use the application id `harold.android.debug` and a `-debug`
version suffix. They install next to the release app (`harold.android`) and
never replace it.

Release builds are signed only when these env vars are all set:

- `ANDROID_KEYSTORE_PATH`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Without them, `assembleRelease` produces an unsigned APK. CI signs releases
with the distribution key held in repo secrets.

`versionName` is set by release-please. `versionCode` is derived from it as
`major * 10000 + minor * 100 + patch`.

## Tests

Unit tests run with the standard gate above. The SSH integration test
(`SshIntegrationTest` in `:transport`) drives a real SSH session against
`scripts/ssh-test-server.py` and a fake ACP agent
(`scripts/fake-acp-agent.py`) — see [docs/architecture.md](../../docs/architecture.md)
for setup.

## CI

Android checks run in `.github/workflows/ci.yml` when `apps/android/**` changes.
