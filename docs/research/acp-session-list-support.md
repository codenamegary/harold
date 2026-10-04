# ACP `session/list` support inventory

Checked: 2026-08-11

Scope: for each agent in our pinned ACP catalog
(`apps/server/src/acp/catalog/registry.snapshot.json`), whether it advertises
`sessionCapabilities.list` / implements `session/list`.

## Primary source

Official daily probe of the ACP registry:

- [Protocol Adaptation Matrix](https://github.com/agentclientprotocol/registry/blob/main/.protocol-matrix/latest.md)
  (report dated **2026-08-11**, 31 agents probed)
- Linked from [awesome-acp](https://github.com/tabtabtabai/awesome-acp)

The registry JSON itself does **not** store capability fields (removed from the
manifest schema). Capabilities are only known from `initialize` or this matrix.

## Live probes on this machine (2026-08-11)

| Catalog id   | `session/list` | Notes                                              |
| ------------ | -------------- | -------------------------------------------------- |
| `cursor`     | yes            | `agent acp` CLI `2026.08.04`                       |
| `opencode`   | yes            | `~/.opencode/bin/opencode` `1.18.16`               |
| `claude-acp` | yes            | `npx @agentclientprotocol/claude-agent-acp@0.66.0` |

## Catalog vs matrix

Our catalog has **38** agents. The matrix probed **31**. Overlap is strong for
popular agents. Catalog ids not in the matrix report: `agoragentic-acp`,
`codebuddy-code`, `crow-cli`, `deepagents`, `fast-agent`, `minion-code`,
`qoder`, `vtcode`. Matrix also lists `github-copilot` beside
`github-copilot-cli`; our catalog id is `github-copilot-cli`.

## Inventory (pinned catalog)

`list` = advertises `session/list` in the matrix **Capabilities** column (or
live probe). `core` = agent initializes as an ACP session agent (`session/new`
expected). Confidence: **high** for matrix/live, **low** for unprobed.

| Catalog id           | `session/list` | Core session  | Evidence                                                                                       | Confidence |
| -------------------- | -------------- | ------------- | ---------------------------------------------------------------------------------------------- | ---------- |
| `amp-acp`            | **no**         | yes (init ok) | matrix: Capabilities `-`                                                                       | high       |
| `auggie`             | **yes**        | yes           | matrix                                                                                         | high       |
| `autohand`           | **yes**        | yes           | matrix                                                                                         | high       |
| `claude-acp`         | **yes**        | yes           | matrix + live probe                                                                            | high       |
| `cline`              | **no**         | yes           | matrix: `loadSession` only                                                                     | high       |
| `codex-acp`          | **yes**        | yes           | matrix + source `CodexAcpServer.ts`                                                            | high       |
| `cortex-code`        | unknown        | unknown       | matrix: `proc_err` on init                                                                     | low        |
| `corust-agent`       | **no**         | yes (init ok) | matrix: Capabilities `-`                                                                       | high       |
| `cursor`             | **yes**        | yes           | matrix + live probe                                                                            | high       |
| `devin`              | **yes**        | yes           | matrix                                                                                         | high       |
| `dimcode`            | **yes**        | yes           | matrix                                                                                         | high       |
| `dirac`              | **no**         | yes           | matrix: `loadSession`, `session/resume` only                                                   | high       |
| `factory-droid`      | **yes**        | yes           | matrix                                                                                         | high       |
| `gemini`             | **no**         | yes           | matrix: `loadSession` only                                                                     | high       |
| `github-copilot-cli` | **yes**        | yes           | matrix                                                                                         | high       |
| `glm-acp-agent`      | **yes**        | yes           | matrix                                                                                         | high       |
| `goose`              | **yes**        | yes           | matrix                                                                                         | high       |
| `grok-build`         | **yes**        | yes           | matrix                                                                                         | high       |
| `harn`               | **yes**        | yes           | matrix                                                                                         | high       |
| `junie`              | **yes**        | yes           | matrix                                                                                         | high       |
| `kilo`               | **yes**        | yes           | matrix + lifecycle test calling `session/list`                                                 | high       |
| `kimi`               | **yes**        | yes           | matrix + docs + `server.py` `list_sessions`                                                    | high       |
| `mistral-vibe`       | **yes**        | yes           | matrix                                                                                         | high       |
| `nova`               | **yes**        | yes           | matrix                                                                                         | high       |
| `opencode`           | **yes**        | yes           | matrix + live probe                                                                            | high       |
| `pi-acp`             | **yes**        | yes           | matrix                                                                                         | high       |
| `poolside`           | **yes**        | yes           | matrix                                                                                         | high       |
| `qwen-code`          | **yes**        | yes           | matrix                                                                                         | high       |
| `sigit`              | **no**         | yes           | matrix: `loadSession`, `session/fork` only                                                     | high       |
| `stakpak`            | **no**         | yes           | matrix: `loadSession` only                                                                     | high       |
| `agoragentic-acp`    | unknown        | unknown       | not in matrix                                                                                  | low        |
| `codebuddy-code`     | unknown        | unknown       | not in matrix                                                                                  | low        |
| `crow-cli`           | unknown        | unknown       | not in matrix                                                                                  | low        |
| `deepagents`         | unknown        | unknown       | not in matrix                                                                                  | low        |
| `fast-agent`         | likely yes     | yes           | docs: “Session listing supported” ([fast-agent ACP](https://fast-agent.ai/acp)); not in matrix | medium     |
| `minion-code`        | unknown        | unknown       | not in matrix                                                                                  | low        |
| `qoder`              | unknown        | unknown       | not in matrix                                                                                  | low        |
| `vtcode`             | unknown        | unknown       | not in matrix                                                                                  | low        |

## Agents without `session/list` (known)

These initialize as ACP agents but do **not** advertise list:

| Catalog id     | Still has                       |
| -------------- | ------------------------------- |
| `amp-acp`      | (no caps listed)                |
| `cline`        | `loadSession`                   |
| `corust-agent` | (no caps listed)                |
| `dirac`        | `loadSession`, `session/resume` |
| `gemini`       | `loadSession`                   |
| `sigit`        | `loadSession`, `session/fork`   |
| `stakpak`      | `loadSession`                   |

Among popular allowlist agents (`popular.allowlist.ts`): **gemini** and
possibly others only if unlisted. Allowlist with **yes**: cursor, claude-acp,
codex-acp, opencode, github-copilot-cli, pi-acp, goose, auggie, kilo. Allowlist
with **no**: **gemini**.

## Method probe (matrix footer)

For `session/list` across probed agents: Supported **19**, Auth Required **3**,
Method Not Found **7**, Other **2**. That matches “most list, a minority do not.”

## Implications for Harold gateway

- A gateway that only unions `session/list` still covers most of the catalog and
  nearly all of the popular allowlist except **Gemini** (and the smaller
  no-list set above).
- Agents without list can still take `session/new` + `session/prompt` if the
  host allows creating a session without discovering prior ones.
- Building a host-owned session catalog only for the no-list minority is
  optional product work, not required for Cursor / OpenCode / Claude / Codex.

## Sources

- https://github.com/agentclientprotocol/registry/blob/main/.protocol-matrix/latest.md
- Live `initialize` on `agent acp`, `opencode acp`, `claude-agent-acp@0.66.0`
- https://raw.githubusercontent.com/agentclientprotocol/codex-acp/main/src/CodexAcpServer.ts
- https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-acp.html
- https://fast-agent.ai/acp
- Local catalog: `apps/server/src/acp/catalog/registry.snapshot.json`
