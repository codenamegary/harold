# Demo

The demo video pipeline, in two stages:

| Stage     | Directory  | Role                                                                                          |
| --------- | ---------- | --------------------------------------------------------------------------------------------- |
| `capture` | `capture/` | Records the phone: emulator with a staged camera feed, UI driver, dead-space cut              |
| `render`  | `render/`  | The Remotion cut: terminal, phone frame, captions; renders from fixtures tracked in `public/` |

What is kept and what is not:

- **Kept, committed:** everything in `capture/` and `render/`, including the fixtures in `render/public/` (`phone.mp4`, `capture.json`, `music.mp3`) so a fresh clone renders offline.
- **Not kept:** `work/`. Capture scratch, logs, renders, and spot-check stills all land there and are safe to delete at any time.

See `capture/README.md` and `render/README.md` for the details. The runbook for running and debugging the capture is `.opencode/skills/compose-demo/SKILL.md`.
