# Fake SSH host

A deterministic SSH host for the demo video and manual app testing. It is a
normal OpenSSH server in a container with a fixed host key and fixed content,
so the phone app connects exactly like it would to a real machine.

The host accepts **public key authentication only**. Password and
keyboard-interactive authentication are off in `sshd_config`, and the `gary`
account has `*` instead of a password hash, so no password can authenticate.

## Start it

```sh
docker compose -f docs/demo/fake-host/compose.yml up -d --build
```

The build runs `sshd -t` and fails if the config is rejected. The entrypoint
runs it again before starting sshd, so a bad config stops the container instead
of serving a half-working demo.

Every container start rebuilds `/home/gary` and removes
`/home/gary/.ssh/authorized_keys`, so a new start has no authorized keys. A
green Test connection therefore proves that run's key was installed.

## Authorize a key

The app generates a fresh key per install and `capture.sh` runs `pm clear`, so
the public key cannot be baked into the image. Inject it at runtime instead:

```sh
docker compose -f docs/demo/fake-host/compose.yml exec -T host \
  add-authorized-key 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... harold-demo'
```

The key can also come from a file:

```sh
docker compose -f docs/demo/fake-host/compose.yml exec -T host \
  add-authorized-key < ~/.ssh/id_ed25519.pub
```

With the container name the same calls are:

```sh
docker exec -i harold-demo-host add-authorized-key '<ssh-ed25519 ... comment>'
docker exec -i harold-demo-host reset-authorized-keys
```

`add-authorized-key` takes one key line on argv or stdin, rejects a malformed
key with a non-zero exit, validates the body with `ssh-keygen`, and ignores a
key that is already authorized (same type and body, comment ignored). It writes
`~/.ssh/authorized_keys` as `gary` with mode `600` inside a `.ssh` directory
with mode `700`.

Check the login from the host machine:

```sh
ssh -o PreferredAuthentications=publickey -o BatchMode=yes \
  -p 2223 gary@127.0.0.1 'echo ok'
```

## Clear keys

```sh
docker compose -f docs/demo/fake-host/compose.yml exec -T host reset-authorized-keys
```

`reset-authorized-keys` leaves an empty `authorized_keys` with the same owner
and modes. Call it before a capture, then inject the key shown in the app's
`Public key` box before tapping `Test connection`.

## What is inside

- User `gary`, public key auth only, SSH on port 2223 (container port 2222).
- Fixed Ed25519 host key at `keys/ssh_host_ed25519_key`:
  `SHA256:iKE0VpdoZwc0iRm1SFqsMzAm89GgjOX+tBGfqa4dJ8s`.
- `~/sites/cat-screensaver`: a small git repository with `main`.
- `~/sites/cat-screensaver-worktrees/cat-mode`: a clean `feat/cat-mode`
  worktree, registered as the `cat-screensaver` workspace.
- `~/sites/moonlit-garden`, `~/sites/meow`, and
  `~/sites/fish-screensaver-for-cats`: extra workspaces for the app lists.
- `~/.harold/workspaces.json` and `~/.harold/agents.json`: the host-side state
  the app reads over SFTP.
- Three scripted ACP agents: OpenCode (the feature walk), Claude Agent, and
  Codex. Their seeded session lists live in `~/.harold-demo/agents/`.
- A tiny fake `gh` that records a draft PR at
  `~/.harold-demo/pull-request.json`.

## Scripted turns

`agent/fake_agent.py` routes a prompt by intent:

- **Plan** sends a short plan and one `elicitation/create` form with
  `Settings toggle` and `Automatic`.
- **Build** writes `src/cat-mode.js`, updates `src/settings.js`, adds
  `test/cat-mode.test.js`, commits on `feat/cat-mode`, and sends a usage
  update (`64.2k / 1M`, `$0.016`).
- **Draft PR** pushes the branch to the local bare remote and records the
  fake PR URL `https://github.com/codenamegary/cat-screensaver/pull/42`.

Everything else gets a short canned reply. The seeded sessions replay their
stored transcripts through `session/load`.

## Reset

```sh
docker compose -f docs/demo/fake-host/compose.yml down
docker compose -f docs/demo/fake-host/compose.yml up -d --build
```

The image rebuild is only needed after changing the agent, the seed files, the
key helper, or the fixture. A plain `down`/`up` resets the home directory and
clears authorized keys; `docker compose restart` also clears the keys and
rebuilds the home directory without recreating the container.
