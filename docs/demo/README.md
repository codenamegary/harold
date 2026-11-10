# Demo

The SSH-only demo video pipeline, in three stages:

| Stage       | Directory   | Role                                                                                                   |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `fake-host` | `fake-host/` | Docker SSH host with fixed repos, host key, workspaces, and scripted ACP agents                        |
| `capture`   | `capture/`  | Records the phone: emulator, UI driver, dead-space cut                                                  |
| `render`    | `render/`   | The Remotion cut: terminal, phone frame, captions, spotlights; renders from fixtures tracked in `public/` |

What is kept and what is not:

- **Kept, committed:** everything in `capture/`, `fake-host/`, and `render/`, the fixtures in `render/public/` (`slices/`, `capture.json`, `music.mp3`, `sfx/`) so a fresh clone renders offline, and the finished cut at `harold.mp4`.
- **Not kept:** `work/`. Capture scratch, logs, preview renders, and spot-check stills all land there and are safe to delete at any time.

See `capture/README.md`, `fake-host/README.md`, and `render/README.md` for the details.
