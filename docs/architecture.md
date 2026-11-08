# Architecture

Harold is an Android app that drives ACP coding agents on your machines over SSH.

```
Android app -> SSH exec -> `agent acp`
             one process per live session, plus short-lived
             processes for session/list and session/delete
```

One transport, no installs. Anything Harold keeps on the host lives under
`~/.harold/` as plain files the app reads and writes over SFTP. There is no
Harold process, daemon, or port on the host: the requirements are sshd with
exec + SFTP, an ACP-compatible agent CLI, and `git`.

## Sessions

A session is one agent process over one SSH exec channel speaking ACP
JSON-RPC on stdio:

1. The app opens the exec channel (`exec bash -lc 'exec <agent> <args>'`).
2. The app sends `initialize` (`protocolVersion: 1`) and reads the agent's
   capabilities. Composer buttons for images and files come from this live
   response — nothing is persisted, so a session is text-only until the
   handshake completes.
3. `session/load` (or `session/resume`) restores the conversation from the
   agent's own history on the host.
4. Prompts, cancellations, permission and elicitation replies travel as ACP
   requests; closing the app or losing the network ends the process.
   Reopening spawns a fresh process and replays through `session/load`.

## Session history

Agents own session history. Harold does not mirror it to the host:

- `session/list` is called on each enabled agent after `initialize`, and
  the app follows `nextCursor` until the agent is done. Results from every
  agent are compiled in memory, keyed by (agent, session), newest first.
- Agents that do not advertise `sessionCapabilities.list` are skipped.
  One agent failing or timing out drops only its rows.
- Opening a session uses the in-memory row for `cwd`. After a cold start,
  the session process asks its own agent for `session/list` before calling
  `session/load`, so no per-session file is needed.
- `session_info_update` notifications become live title updates. Agents that
  never title a session fall back to the `session/list` title.
- Deleting a session uses ACP `session/delete` when the agent advertises
  `sessionCapabilities.delete`. If it does not, Harold reports that the
  agent's CLI must remove it.

## Host state

```
~/.harold/
  agents.json        shared agent config (written over SFTP, atomic temp + rename)
  workspaces.json    remembered workspace folders
  uploads/<sessionId>/...             attachment uploads
```

`agents.json` and `workspaces.json` are shared across devices: any device can
read or rewrite them, last write wins, and writes go through a temp file plus
rename so a reader never sees a partial file. Session history is not stored
here; older releases wrote `sessions/<agent>/<sessionId>.json`, and those
files are now ignored and can be deleted.

## Agent settings

A hardcoded catalog of known ACP agents ships with each app release. Scanning
a host probes `command -v` for every known binary in one SSH round trip and
merges the results into `agents.json`:

- Detection fills gaps and adds new rows. It never touches user-owned fields
  (`enabled`, `args`). A saved path that no longer runs is replaced when the
  scan finds that agent elsewhere.
- Dismissed agents keep a tombstone, so rescans do not resurrect them.
- Custom agents (name, path, args) cover anything the catalog does not know
  and are deleted outright.
- Spawning uses the row's `path` (or the catalog's binary) plus its `args`.
  A disabled or dismissed agent cannot start.
- Auth state comes from the agent's own CLI where one exists (for example
  `claude auth status --json` or `cursor-agent status --format json`), cached
  for 30 seconds and shown as a badge. Probing is advisory: a failed parse
  degrades to unknown and nothing gates on auth. Sign-in always happens on
  the host; the app surfaces instructions and a restart action that respawns
  the agent's process.

## Identity and trust

The phone generates an Ed25519 key (or imports one, or uses a password),
adds the public key to `~/.ssh/authorized_keys` on the host, and pins the
host key by SHA-256 fingerprint. A changed host key is a hard failure.
Credentials live in an encrypted connection store backed by Android Keystore;
named credentials for reuse live in a second encrypted store.

## Workspaces

A workspace is a folder on the host. Typed entries are validated over SSH
(exists, is a directory), auto-named from the basename, remembered in
`workspaces.json`, and flagged when they sit inside a git work tree. A
default workspace and a default agent per connection are device-local
preferences in the encrypted connection store.

## Repo layout

```
apps/android/
  app         Hilt app, MainActivity, navigation host
  navigation  Navigation3 routes, Navigator, feature entry SPI
  contracts   kotlinx-serialization DTOs (pure Kotlin)
  api         transport-neutral interfaces: AgentApi, SessionStream, errors
  transport   SSH: JSch connections, SFTP, ACP client, session factory,
              agent catalog, host config store, auth probes, git reads
  database    Room cache keyed by connection id
  auth        encrypted connection store, saved credentials, Connections
  live        session ownership, transcript reducer, foreground service
  chat        chat screen, sessions, create session, composer, auth panel
  changes     git changes + file diff screens
  workspaces  workspaces + add workspace screens
  pairing     connections, SSH host setup, agents, connection settings
  shell       start screen
  voice       Vosk speech recognition
  design      shared Compose components + theme tokens
  testing     shared fakes
scripts/
  ssh-test-server.py   userspace SSH server for the integration test
  fake-acp-agent.py    tiny ACP agent the integration test drives
```

## Testing without touching your host

The integration test needs no real sshd. It spawns a userspace SSH server
(Python + asyncssh) on 127.0.0.1 with a generated host key, a sandbox home,
and fake `opencode` and `amp-acp` agents on PATH:

```sh
python3 -m venv /tmp/harold-ssh-venv
/tmp/harold-ssh-venv/bin/pip install asyncssh

cd apps/android
HAROLD_RUN_SSH_TESTS=1 ./gradlew --no-daemon :transport:testDebugUnitTest \
  --tests '*SshIntegrationTest'
```

`HAROLD_SSH_TEST_PYTHON` overrides the interpreter path; `HAROLD_KEEP_SSH_TEST=1`
keeps the temp artifacts around.

A Docker sshd also works: run OpenSSH on `-p 2222:2222` and point the
emulator at `10.0.2.2:2222`.

## Limits by design

- In-flight turns do not survive a disconnect; the next open resumes from
  the agent's saved history.
- Agent sign-in is host-side by definition. The app reports auth state and
  restarts processes; it never runs login flows.
