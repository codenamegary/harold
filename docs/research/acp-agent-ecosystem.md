# ACP agent ecosystem

Checked: 2026-08-08

Scope: which popular coding agents ship Agent Client Protocol (ACP) support,
native vs adapter, and launch commands usable by Agent Server profiles.

## Official index

- Agent list: [ACP Agents](https://agentclientprotocol.com/get-started/agents)
- Curated install registry (auth-capable agents): [ACP Registry](https://agentclientprotocol.com/get-started/registry)
- Registry JSON: `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`
- Zed client docs (common external agents): [External Agents](https://zed.dev/docs/ai/external-agents)

## Summary table

| Agent | Mode | Documented launch | Detect binary | Confidence | Sources |
|-------|------|-------------------|---------------|------------|---------|
| Cursor | Native | `agent acp` | `agent` | high | [Cursor ACP](https://cursor.com/docs/cli/acp) |
| OpenCode | Native | `opencode acp` | `opencode` | high | [OpenCode ACP](https://opencode.ai/docs/acp) |
| Gemini CLI | Native (listed) | `gemini --acp` (ecosystem convention) | `gemini` | medium | [ACP Agents](https://agentclientprotocol.com/get-started/agents), [gemini-cli](https://github.com/google-gemini/gemini-cli) |
| GitHub Copilot | Native (public preview) | `copilot --acp --stdio` (ecosystem) | `copilot` | medium | [ACP Agents](https://agentclientprotocol.com/get-started/agents) |
| Kiro CLI | Native | `kiro-cli acp` | `kiro-cli` | high | [Kiro ACP](https://kiro.dev/docs/cli/acp/) |
| Claude Agent | Adapter | `@agentclientprotocol/claude-agent-acp` (Zed/ACP adapter) | adapter package, not plain `claude` | high | [ACP Agents](https://agentclientprotocol.com/get-started/agents), [claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp) |
| Codex CLI | Adapter | Zed/`codex-acp` adapter | adapter package | high | [ACP Agents](https://agentclientprotocol.com/get-started/agents) |
| Pi | Adapter | `pi-acp` | adapter package | high | [ACP Agents](https://agentclientprotocol.com/get-started/agents), [pi-acp](https://github.com/svkozak/pi-acp) |

## Notes for Agent Server

- Built-in cards + PATH detect fit **native** agents best (same pattern as Cursor).
- Claude / Codex / Pi need an **adapter spawn** path (npx or installed adapter binary), not only `Bun.which("claude")`.
- The ACP Registry can later drive discovery/install metadata. A fixed curated catalog is enough for a first ship.
- Zed lists Claude, Codex, OpenCode, Copilot, Cursor, Gemini, and Pi as common external agents ([docs](https://zed.dev/docs/ai/external-agents)).
