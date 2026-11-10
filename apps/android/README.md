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

Harold keeps one SSH connection per host identity and one ACP agent process per
agent. Many ACP sessions share that process:

```
Android app -> SSH connection pool -> `agent acp` (one process per host identity + agent) -> many ACP sessions
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
  Rows with the same endpoint and credentials share one pooled SSH session and
  one agent process.
- Opening a session attaches to the warm process. Closing the event stream
  detaches but keeps the process. Reopening resumes the transcript with ACP
  `session/load` and a stream reset.
- Creating, listing, deleting, restarting, and reading capabilities all use the
  same warm process. A session list refresh or an agent scan does not spawn an
  extra process.
- If a process exits, every session it hosted goes offline. The watched session
  reconnects through the one existing retry loop and starts one new process.
  Other sessions stay offline until opened again.
- A failed session attach discards the in-memory session. Two consecutive
  failures also restart that agent's warm process. After five failed attaches
  before the stream opens, the reconnect loop stops and shows the agent's
  error instead of retrying forever.
- Removing the last saved connection for a host identity closes its pooled SSH
  session and every agent process on it.

The Android app is split into `:transport` (SSH primitives and setup),
`:host` (workspaces, git, agent settings, auth, process launch), `:acp` (ACP
protocol, runtime, sessions, streams), and feature modules. Only `:app` wires
the concrete implementations. Feature modules talk through the interfaces in
`:api` and never hold an SSH connection or an agent process.

## Host state

Everything Harold keeps on the host lives under `~/.harold/`:

```
~/.harold/
  agents.json        shared agent config (written over SFTP, atomic temp + rename)
  workspaces.json    remembered workspace folders
  hidden-workspaces.json  workspace paths deleted from the list
  uploads/<sessionId>/...             attachment uploads
```

Session history stays with the agent. Harold reads it with ACP `session/list`
and compiles the per-agent lists in memory; it does not write session files
to the host. Older releases created `sessions/<agent>/<sessionId>.json`; those
files are ignored and safe to delete.

No Harold daemon, service, or port runs on the host. Agent processes are
children of the app's SSH sessions. A backgrounded app closes processes with
no live session. A lost network ends them. Opening the session again starts one
process and resumes through ACP `session/load`.

## Agent settings

The per-connection Agents screen manages `agents.json`:

- A hardcoded catalog of known ACP agents ships with the app. Scanning probes
  the host with `command -v` for every known binary in one round trip.
- Detection merges into existing rows without touching user-owned fields
  (`enabled`, `args`, `binDir`). Working custom paths stay untouched. If a
  saved path no longer runs and the scan finds that agent at a new path, the
  new path replaces the dead one. Dismissed agents stay dismissed across
  scans. Custom agents (name, path, args) can be added for anything the
  catalog does not know and are deleted outright.
- Each agent row can name a Node bin directory. Harold prepends it to `PATH`
  when that agent launches, so `node`, `npx`, and globally installed CLIs come
  from the same runtime. The folder browser is the shared remote folder
  component. Saving checks that the folder exists and contains runnable
  `node` and `npx`.
- Saving a changed executable path, args, or bin directory closes that agent's
  warm process. The next session starts fresh with the saved settings instead
  of reusing a process that captured the old environment.
- `pi-acp` installs both its adapter and the `pi` CLI through `npx`, so the
  agent does not depend on a separate global install.
- Auth state is probed from the agent's own CLI (`claude auth status --json`,
  `cursor-agent status --format json`) with a 30 second TTL, and shown as a
  badge. Probing is advisory; sign-in always happens on the host, and
  restarting an agent respawns its process and re-probes.
- Composer capability buttons (images, files) come from the live ACP
  `initialize` response of the active session. Nothing is persisted: a
  session is text-only until its handshake completes.

## Session catalog and caches

The agent owns session history. The app keeps one in-memory session snapshot
per `(connection, agent)`, fed by the live ACP processes:

- `initialize` starts with no rows.
- `session/list` shows the first page as soon as it arrives, then keeps
  fetching later pages in the background. The agent stays marked as
  refreshing until the last page lands.
- `session/new` adds a row.
- `session/update` patches its title and timestamp.
- `session/delete` removes a row.
- Process death removes only that agent's rows for the connections that
  shared the process.

The Sessions and Chat screens compose those live snapshots with the workspace
and agent caches. On a cold start the list is empty until the first
`session/list` answers, and each agent's answer appears independently. A
remembered session id is only restored after it appears in the live snapshot.

Room keeps the workspace and agent caches, plus a small table for the
phone-local worktree path chosen for a session. The worktree path is keyed by
connection, agent, and session because ACP knows nothing about worktrees.
Removing a connection deletes every cached row for it.

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
(`SshIntegrationTest` in `:acp`) drives a real SSH session against
`scripts/ssh-test-server.py` and a multi-session fake ACP agent
(`scripts/fake-acp-agent.py`). It is skipped unless the Python dependency is
present:

```sh
python3 -m venv /tmp/harold-ssh-venv
/tmp/harold-ssh-venv/bin/pip install asyncssh

HAROLD_RUN_SSH_TESTS=1 ./gradlew :acp:testDebugUnitTest \
  --tests '*SshIntegrationTest'
```

The test checks one agent process and one SSH connection are reused across
sessions, opens, list refreshes, and management calls. It also checks process
restart and session deletion.

## CI

Android checks run in `.github/workflows/ci.yml`.
