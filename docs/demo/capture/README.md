# Demo capture

`capture.sh` records the SSH-only phone walk. A Docker host from
[`../fake-host`](../fake-host) provides fixed git repositories, a fixed SSH
host key, and scripted ACP agents. The phone adds that host by SSH, then starts
a new session on the `cat-screensaver` feature worktree and takes one feature
from plan to draft PR. The detailed setup spec is in [setup.md](./setup.md).

| File                         | Role                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `capture.sh`                 | The whole run: fake host, emulator, app install, SSH setup, feed, slices, build                                     |
| `drive_phone.py`             | Walk the app from add-host through plan, question, build, usage, changes, worktrees, and draft PR                   |
| `build_capture.py`           | Re-encode the slices, attach the taps, and write `capture.json`                                                     |
| `mcp/`                       | MCP control plane: drive the debug app by tag and intent instead of uidumps, plus the proof-of-concept run          |
| `push_assets.sh`             | Push the demo photos, `cat-mode.md`, and `cat-diary.txt` onto the factory-reset emulator                            |
| `fixtures/cat-screensaver/`  | The seed project copied into the fake host repository                                                               |
| `../fake-host/`              | Docker SSH host, fake agent transcripts, fixed host key, and seeded `~/.harold` state                               |

`assets/cats.zip` holds the demo photos. `assets/cat-mode.md` is the spec
attachment for the feature. `assets/cat-diary.txt` is kept for other demos.

## What is kept and what is not

- **Kept, committed:** everything in this directory plus
  `docs/demo/render/public/slices/` and `docs/demo/render/public/capture.json`.
- **Not kept:** `docs/demo/work/capture/` (logs, raw slices, marks,
  screenshots).

## How to run

Needs `bun`, `docker` with Compose, `git`, `adb`, `node`, `ffmpeg`, `ffprobe`,
`python3`, `unzip`, a JDK, and the Android SDK with the 36.5+ emulator at
`~/android/emulator` (set `EMULATOR` to override). Audio is not used.

```sh
bash docs/demo/capture/capture.sh
```

The fake host listens on `127.0.0.1:2223` by default
(`HAROLD_DEMO_SSH_PORT`). The emulator reaches it through
`adb reverse tcp:2223 tcp:2223`. The app signs in as `gary` with the demo
password `harold`; the password is typed in the UI for the recording, never
passed on the command line to the app.

The capture keeps these fixed resources:

- Fake host container: `harold-demo-host`, compose project `harold-demo`
- SSH endpoint: `127.0.0.1:2223`, user `gary`
- Host key: `SHA256:iKE0VpdoZwc0iRm1SFqsMzAm89GgjOX+tBGfqa4dJ8s`
- Worktree: `/home/gary/sites/cat-screensaver-worktrees/cat-mode` on
  `feat/cat-mode`
- Workspace name for the worktree: `cat-screensaver`
- Emulator AVD: `agent_server_api34`

Each run recreates the host container, which resets the home directory,
repositories, agent history, and fake PR. It stops only the capture emulator,
never a phone or another AVD.

`capture.sh` writes `docs/demo/render/public/slices/` and
`docs/demo/render/public/capture.json`. Preview or render from
`docs/demo/render`:

```sh
bun install
bun run dev
bun run render
```

## How it works

The phone walk records these acts:

1. Add an SSH host. The host is `127.0.0.1`, port `2223`, user `gary`, with
   password authentication. Test the connection, inspect the host key
   fingerprint, trust it, and save.
2. Open the session menu. The seeded agent history from OpenCode, Claude, and
   Codex is already there. Start a new session on the `cat-screensaver`
   worktree with the OpenCode agent.
3. Switch to Plan mode, type the plan prompt, and attach a cat photo and
   `cat-mode.md`.
4. Send the plan. The scripted agent replies with a short plan and asks one
   question: `Settings toggle` or `Automatic`. Answer `Settings toggle`, then
   Submit.
5. Switch to Build and send the implementation prompt. The agent writes
   `cat-mode.js`, updates `settings.js`, adds tests, and commits on
   `feat/cat-mode`.
6. Hold on the context and cost line under the header.
7. Open Changes on the clean uncommitted scope, switch to `Against main`, open
   the `settings.js` diff, and return to the list.
8. Open the Worktree footer and show `main` and `feat/cat-mode`.
9. Ask for a draft PR. The agent pushes and records the fake PR URL; the
   driver holds on the URL in the reply.

The walk is recorded as named slices. `drive_phone.py` starts one screenrecord
file per action in `/data/local/tmp`, writes the slice manifest, and marks each
tap. `build_capture.py` re-encodes the slices into `public/slices/`, attaches the
taps that landed inside each slice, and writes `capture.json`. There is no
stitched video.

## Slice list

Setup:

`home_idle`, `add_host_tap`, `setup_top`, `setup_host`, `setup_auth`,
`setup_password`, `setup_test`, `setup_trust`, `connected`

Story:

`session_menu_open`, `new_session`, `workspace_open`, `workspace_pick`,
`agent_open`, `agent_pick`, `start_session`, `session_create_wait`, `mode_plan`,
`prompt_focus`, `prompt_type`, `photo_open`, `photo_pick`, `photo_add`,
`file_open`, `file_pick`, `send`, `plan_wait`, `plan_reply`,
`elicitation_open`, `elicitation_pick`, `elicitation_submit`, `mode_build`,
`build_prompt`, `build_send`, `build_wait`, `build_reply`, `usage`,
`changes_open`, `changes_branch`, `changes_file`, `changes_back`,
`worktrees_open`, `worktrees_close`, `pr_prompt`, `pr_send`, `pr_wait`,
`pr_reply`

The capture requires every slice. There are no optional question, usage,
branch-scope, or PR URL paths.
