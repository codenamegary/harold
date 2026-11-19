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

Harold keeps one SSH connection per host identity for management. For each
host identity and agent, it starts one persistent host process that owns the
agent:

```
Android app -> SSH exec (inline host script) -> detached host -> `agent acp` -> many ACP sessions
```

- The host script is sent inline in the SSH exec command. No script file,
  compiled binary, or service is installed on the host. Only runtime state is
  written, under `~/.harold/run/<agent>/`.
- The first client starts the host with `nohup` and the app's file
  descriptors detached. Later clients run the same command and attach to the
  live host instead of starting another agent.
- The host owns the agent's stdin FIFO and stdout log. Every client tails the
  same append-only `logs/<run-id>/out.jsonl` for notifications and responses,
  so two clients see the same conversation from one agent process.
- Agent-to-client requests (`elicitation/create`,
  `session/request_permission`, filesystem, and terminal requests) go only to
  the client that most recently sent `session/new`, `session/load`,
  `session/resume`, or `session/prompt` for that session. Every session has one
  owner, so a second client cannot answer or dismiss a question it is not
  showing. A client that receives a request it cannot answer drops it without
  an error response.
- Unanswered requests are stored by the host until the owner answers. A client
  that reconnects sends `session/load`, becomes the owner, and receives the
  pending request before the session finishes attaching. A client that goes
  away without answering does not cancel the question.
- A host started by an older app version has no owner routing. The app still
  drops requests it cannot answer, so a second client no longer fails the
  question. Single-owner routing starts with the next host process.
- The host owns the one ACP `initialize`. Clients replay that response instead
  of initializing the agent again.
- Closing the app or losing the network closes only the attach bridge. The
  host and agent keep running. Reopening runs the same command and attaches to
  the same process.
- A reconnect follows only new output. Session history comes from ACP
  `session/load`, not from replaying old responses.
- Restarting an agent or removing its last saved connection sends the host's
  stop command and ends the detached process.
- `nohup` is the portable default. A host with
  `systemd` `KillUserProcesses=yes` kills user processes at logout even with
  `nohup`; that host needs lingering or a different service manager.
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
  Rows with the same endpoint and credentials share one pooled SSH session.
- Opening a session attaches to the warm process. Closing the event stream
  detaches but keeps the process. Reopening resumes the transcript with ACP
  `session/load` and a stream reset.
- Creating, listing, deleting, restarting, and reading capabilities all use the
  same warm process. A session list refresh or an agent scan does not spawn an
  extra process.
- If a process exits, every session it hosted goes offline. The session list
  keeps those rows and marks them offline until a successful `session/list`
  confirms them. The watched session reconnects through the one existing retry
  loop and starts one new process. Other sessions start a process when opened.
- A failed session attach discards the in-memory session. Two consecutive
  failures also restart that agent's host. After five failed attaches
  before the stream opens, the reconnect loop stops and shows the agent's
  error instead of retrying forever.
- Removing the last saved connection for a host identity closes its pooled SSH
  session and stops every detached host on it.

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
  run/<agent>/       runtime state for detached ACP hosts
    logs/active      active run id, written atomically before ready
    logs/<run-id>/   one directory per host process
      out.jsonl      append-only agent output, one ACP message per line
      err.log        agent stderr
    in               FIFO, client input (client id prefix on protocol 2)
    agent.in         FIFO, agent stdin, written only by the host router
    out.pipe         FIFO, agent stdout to the host router
    clients/<client>/route.jsonl  requests routed to one attached client
    owners/<session> owner client for each ACP session
    pending/         unanswered agent-to-client requests
    newreq/          client waiting for a session/new response
    last-owner       most recently active owner client
    protocol         host protocol version (2 routes requests by owner)
    ready            present after the host initialize response
    status           host exit reason
    host.pid         detached host process
    agent.pid        agent process
```

Every host start creates a new `logs/<run-id>/` directory (`<UTC start>-<host pid>`).
A previous process's logs are never truncated, reopened, or renamed. A run is
the unit of deletion: `rm -rf` of one directory. Cleanup protects the active
run and the newest run for each agent. The host lists runs with the `logs`
mode and deletes whole inactive runs only when asked with `cleanup
all-inactive`. The app's Connection settings section shows total, per-agent,
and per-run sizes and warns above 512 MB; it never deletes on its own.
Log directories are `700` and log files are `600`.

The `usage` mode prints ACP `usage_update` records from one agent's
`out.jsonl` files. It streams one line at a time, filters on both the
`session/update` method and the `usage_update` kind, and reports the byte
offset where the next scan should resume. The app keeps the latest value per
session in memory. The first scan for an agent reads every run. Later
refreshes read only bytes appended to the newest run.

Session history stays with the agent. Harold reads it with ACP `session/list`
and compiles the per-agent lists in memory; it does not write session files
to the host. Older releases created `sessions/<agent>/<sessionId>.json`; those
files are ignored and safe to delete.

No compiled Harold binary, daemon, or extra port runs on the host. The host
script is held in memory for the lifetime of the host process. The host needs
standard shell tools only: `sh`, `bash`, `mkfifo`, `flock` (optional),
`nohup`, `tail`, `head`, `wc`, `awk`, `sed`, `grep`, and `sort`. Runtime state
under `run/` can be deleted when no host is running.

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

Unit tests run with the standard gate above. The host script lifecycle tests
(`HostLogScriptTest` in `:host`) run the packaged script on the local machine
with a tiny shell ACP agent, so run rotation, reconnect, cleanup protection,
and permissions are covered without an SSH server. The SSH integration test
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
