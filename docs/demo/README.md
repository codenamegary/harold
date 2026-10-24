# Demo

The demo video pipeline, in two stages:

| Stage     | Directory  | Role                                                                                          |
| --------- | ---------- | --------------------------------------------------------------------------------------------- |
| `capture` | `capture/` | Records the phone: emulator with a staged camera feed, UI driver, dead-space cut              |
| `render`  | `render/`  | The Remotion cut: terminal, phone frame, captions, spotlights; renders from fixtures tracked in `public/` |

What is kept and what is not:

- **Kept, committed:** everything in `capture/` and `render/`, the fixtures in `render/public/` (`slices/`, `capture.json`, `music.mp3`) so a fresh clone renders offline, and the finished cut at `harold.mp4`.
- **Not kept:** `work/`. Capture scratch, logs, preview renders, and spot-check stills all land there and are safe to delete at any time.

See `capture/README.md` and `render/README.md` for the details. The runbook for running and debugging the capture is `.opencode/skills/compose-demo/SKILL.md`.
