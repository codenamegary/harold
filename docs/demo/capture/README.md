# Demo capture

`capture.sh` records the phone walk with one Harold instance. The instance uses
OpenCode only. The phone pairs with it by camera, then starts a new session on
a private `cat-screensaver` feature worktree and takes one real feature from
plan to draft PR. The detailed setup spec is in [setup.md](./setup.md).

| File                         | Role                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `capture.sh`                 | The whole run: prepare the private repo, one daemon, app install, pair, feed, boot, slices, build                  |
| `seed_sessions.sh`           | Purge and seed the five cat sessions in the feature worktree                                                       |
| `compose_camera.mjs`         | Overlay the live QR on the tracked panel after a 40s gate, crop to 1280x960                                       |
| `write_pairing_fixtures.mjs` | Regenerate the Remotion pairing code and QR rows from the live pair JSON                                          |
| `drive_phone.py`             | Walk the app pair -> session menu -> new session -> plan -> question -> build -> usage -> changes -> worktrees -> PR |
| `build_capture.py`           | Re-encode the slices, attach the taps, and write `capture.json`                                                    |
| `push_assets.sh`             | Push the demo photos, `cat-mode.md`, and `cat-diary.txt` onto the factory-reset emulator                          |
| `fixtures/cat-screensaver/`  | The seed project pushed to the private demo repo                                                                  |

`assets/virtual-qr-code-webcam.mp4` is the staged clip the camera feed is
composed from. `assets/cats.zip` holds the demo photos. `assets/cat-mode.md`
is the spec attachment for the feature. `assets/cat-diary.txt` is kept for
other demos. `assets/voice-input.wav` and `audio-env-shim.c` are unused by this
cut.

## What is kept and what is not

- **Kept, committed:** everything in this directory plus
  `docs/demo/render/public/slices/` and `docs/demo/render/public/capture.json`.
- **Not kept:** `docs/demo/work/capture/` (composed feed, logs, raw slices,
  pairing codes, screenshots), the demo data dir, the demo project folder
  root, and the cat-screensaver worktree.

## How to run

Needs `bun`, `opencode`, `gh`, `git`, `sqlite3`, `adb`, `node`, `ffmpeg`,
`ffprobe`, `python3`, `unzip`, a JDK, and the Android SDK with the 36.5+
emulator at `~/android/emulator` (set `EMULATOR` to override). The emulator
needs the videofile camera. Audio is not used.

```sh
bash docs/demo/capture/capture.sh
```

The script uses these fixed demo resources:

- Instance 1: `127.0.0.1:3847`, `~/.harold-demo-3847`,
  `~/harold-demo-workspaces/3847`
- Private demo repo: `codenamegary/cat-screensaver`
- Main clone: `~/harold-demo-workspaces/3847/cat-screensaver`
- Feature worktree: `~/cat-screensaver-worktrees/cat-mode` on
  `feat/cat-mode`
- Workspace name for the feature worktree: `cat-screensaver`

It stops only the demo instance. The real `~/.harold` daemon is left alone.
Each run recreates the demo data dir and DB, keeps the workspace directories,
and re-registers the workspaces and the OpenCode agent. The workspace clone is
pulled with `--ff-only`. The private demo repo is rewritten from
`fixtures/cat-screensaver`, old open PRs for `feat/cat-mode` are closed, the
remote and local branch are deleted, `main` is reset to `origin/main`, and the
feature worktree is recreated. The cat history is seeded in that worktree, then
the worktree is reset again so the recorded story starts clean.

Instance 1's live QR is baked into the camera clip. The emulator boots through
a transient systemd user unit so QEMU survives the shell.

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

1. Pair by camera. The scanner is replaced by the Harold identity screen. The
   user names it `Work`, keeps Violet and the Harold mark, and taps Pair. The
   achievement is unchanged.
2. Open the session menu on the five cat sessions, then start a new session.
   Pick the `cat-screensaver` workspace whose path ends in `cat-mode`. OpenCode
   is the only enabled agent, so it is already selected.
3. Pin the new session to `deepseek/deepseek-flash` before recording the story.
   Switch to Plan mode, type the plan prompt, and attach a cat photo and
   `cat-mode.md`.
4. Send the plan. The agent replies with a short plan and asks one question:
   `Settings toggle` or `Automatic`. Answer `Settings toggle`, then Submit.
5. Switch to Build and send the implementation prompt. The agent adds
   `cat-mode.js`, wires the toggle in `settings.js`, adds tests, and commits on
   `feat/cat-mode`. Any permission request is answered silently.
6. Hold on the context and cost line under the header.
7. Open Changes on the clean uncommitted scope, switch to `Against main`, open
   the `settings.js` diff, and return to the list.
8. Open the Worktree footer and show `main` and `feat/cat-mode`.
9. Ask for a draft PR. The agent runs git and `gh`; the driver holds on the URL
   in the reply and verifies the draft PR with `gh pr list`.

The walk is recorded as named slices. `drive_phone.py` starts one screenrecord
file per action in `/data/local/tmp`, writes the slice manifest, and marks each
tap. `build_capture.py` re-encodes the slices into `public/slices/`, attaches the
taps that landed inside each slice, and writes `capture.json`. There is no
stitched video.

## Slice list

Intro:

`pair_idle`, `pair_tap`, `scanner_open`, `scan_wait`, `first_name`,
`first_confirm`, `paired`

Story:

`session_menu_open`, `new_session`, `workspace_open`, `workspace_pick`,
`continue`, `session_create_wait`, `mode_plan`, `prompt_focus`, `prompt_type`,
`photo_open`, `photo_pick`, `photo_add`, `file_open`, `file_pick`, `send`,
`plan_wait`, `plan_reply`, `elicitation_open`, `elicitation_pick`,
`elicitation_submit`, `mode_build`, `build_prompt`, `build_send`, `build_wait`,
`build_reply`, `usage`, `changes_open`, `changes_branch`, `changes_file`,
`changes_back`, `worktrees_open`, `worktrees_close`, `pr_prompt`, `pr_send`,
`pr_wait`, `pr_reply`

The capture requires all 43 slices. There are no optional question, usage,
branch-scope, or PR URL paths.
