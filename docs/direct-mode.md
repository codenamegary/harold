# Harold Direct (SSH)

Harold has two transports. Both live in the same Android app and the same
saved-connection list.

| | Harold Hub | Harold Direct |
|---|---|---|
| App to host | HTTP + SSE | SSH |
| Host process | Harold daemon | none |
| Host port | Harold port | existing sshd |
| Pairing | QR code or manual code | SSH key enrollment |
| Sessions | daemon-owned, replayed by the hub | one ACP process per app connection |
| Fan-out | many devices | one active device per session |
| Host state | `~/.harold` daemon files | `~/.harold/direct` |
| Agent auth | managed by the hub | the agent CLI on the host |
| Web client | possible | no |

Direct mode is for hosts that already run sshd and an ACP agent, and for users
who do not want to install or expose a Harold daemon.

## Host requirements

- OpenSSH server (or another SSH server with exec and SFTP)
- `cursor-agent`, `opencode`, or another agent that speaks ACP
- `git` for the Changes screen
- `flock` on Linux, or the `mkdir` fallback on macOS

No Harold process is installed and no Harold port is opened.

## App setup

1. Add connection -> SSH host.
2. Enter host, port, and user.
3. Generate an Ed25519 key on the phone, or import an OpenSSH private key or
   use a password.
4. Add the public key line to `~/.ssh/authorized_keys` on the host.
5. Test the connection. The app shows the host key fingerprint. Trust it to pin
   the key, then save.

Saved connections show a `Server` or `SSH` badge. You can save more than one
connection to the same SSH host. Each keeps its own name, appearance, and
credential. SSH keys and passwords live in the encrypted saved-connection store
on the device. The host key is pinned by SHA-256 fingerprint on every later
connection.

### Saved credentials

When adding an SSH host, give the key or password a name and save it for reuse.
The next SSH setup can select it from the saved-credential dropdown instead of
generating or importing another one. The `Manage` link opens the saved SSH
credential list, where entries can be removed.

Saved SSH credentials live in a separate encrypted store on the phone,
protected by its own Android Keystore key. A saved connection copies the
credential material it needs, so removing a saved credential never breaks an
existing connection.

Android does not provide a system-wide SSH key or password vault. Credential
Manager and Autofill handle app and website passwords and passkeys. KeyChain
handles X.509 client certificates with a system picker. SSH credentials are
therefore app-owned and encrypted by the app.

## Session flow

An app connection owns its agent process:

```
SSH exec -> agent acp -> JSON-RPC over stdio
```

The app implements the ACP client. It sends `initialize`, `session/new`,
`session/load`, `session/prompt`, and `session/cancel`, and answers
`session/request_permission`, `fs/*`, `terminal/*`, and `elicitation/*`
requests over the same channel.

Closing the app or losing the network closes the SSH channel and ends the
process. Reopening the session starts a new process and calls `session/load`
so the agent can replay its history. In-flight turns do not survive a drop.

## Host state

```
~/.harold/direct/
  sessions/<agent>/<sessionId>.json
  locks/<agent>/<sessionId>.lock
  uploads/<sessionId>/...
  workspaces.json
```

Each session has one metadata file. There is no shared index. The app updates
`lastUsedAt` and the title from the first prompt. Files are written over SFTP,
so a partial write only affects that one session.

The lock is an `flock` held by a long-running SSH channel. If another device
has the session active, the lock fails and the second device sees a clear
message. Closing the channel releases the lock. The app briefly retries after
its own close because the host can take a moment to release the file.

## Capabilities

The app exposes transport capabilities instead of pretending both modes are
the same:

- Server: live fan-out, centralized replay, multi-device sessions, QR pairing,
  server-managed agent auth.
- Direct: one active device per session, SSH key pairing, no host daemon, no
  web client. Sessions are labelled `Direct` in the session list.

Agent auth in direct mode is whatever the agent CLI has on the host. The app
does not offer the hub's auth panel for direct connections.

## Testing without a system sshd

The repository includes a userspace SSH server and a fake ACP agent for
integration tests:

```sh
python3 -m venv /tmp/harold-ssh-venv
/tmp/harold-ssh-venv/bin/pip install asyncssh

cd apps/android
HAROLD_RUN_SSH_TESTS=1 \
HAROLD_SSH_TEST_PYTHON=/tmp/harold-ssh-venv/bin/python \
./gradlew :transport:testDebugUnitTest --tests '*SshDirectIntegrationTest'
```

The test covers agent detection, session creation, locking, prompt streaming,
permission replies, terminal execution, resume with `session/load`, and
metadata deletion.

For a real sshd on this host, the emulator can use `10.0.2.2` to reach the
host loopback. A Docker sshd works well when the host has no system sshd:

```sh
docker run -d --name harold-sshd -p 2222:2222 \
  -v "$HOME:/home/codenamegary" ubuntu:24.04 \
  bash -lc 'apt-get update && apt-get install -y openssh-server git &&
    mkdir -p /run/sshd && usermod -d /home/codenamegary -s /bin/bash ubuntu &&
    ssh-keygen -A && exec /usr/sbin/sshd -D -p 2222 \
    -o PermitRootLogin=no -o PasswordAuthentication=no \
    -o AuthorizedKeysFile=/home/codenamegary/.ssh/authorized_keys \
    -o StrictModes=no -o UsePAM=no -o AllowUsers=ubuntu'
```

## Limitations

- One active device per session.
- No in-flight turn survival.
- No Windows host in v1.
- A full-shell SSH key is the v1 default. Scoped forced-command keys can come
  later.
- `session/load` must be supported by the agent for resume. The app tells you
  when an agent supports neither load nor resume.
