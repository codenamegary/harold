# Fake SSH host

A deterministic SSH host for the demo video and manual app testing. It is a
normal OpenSSH server in a container with a fixed host key and fixed content,
so the phone app connects exactly like it would to a real machine.

```sh
docker compose -f docs/demo/fake-host/compose.yml up -d --build
ssh gary@127.0.0.1 -p 2223      # password: harold
```

The capture starts and resets this container itself. Every container start
rebuilds `/home/gary` from the image seed, so a restart returns the demo to a
clean state.

## What is inside

- User `gary`, password `harold`, SSH on port 2223 (container port 2222).
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

The image rebuild is only needed after changing the agent, seed files, or the
fixture. A plain `down`/`up` resets the home directory.
