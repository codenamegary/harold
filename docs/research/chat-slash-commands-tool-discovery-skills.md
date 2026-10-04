# Chat slash commands, tool discovery, and skills

Checked: 2026-08-20

Scope: what is possible today for slash commands, tool/command discovery, and
skills in Harold chat (web + Android). Grounded in this repo, official ACP
docs, and Cursor ACP docs. Not secondary blogs.

## Verdict

| Surface          | Slash / commands                                                              | Tool discovery                                                                                                                       | Skills                                                                     |
| ---------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| ACP protocol     | Agents **may** advertise slash commands via `available_commands_update`       | No client-facing tool catalog. Tools show up as `tool_call` updates. MCP servers are supplied by the ACP **client** on `session/new` | No ACP "skills" type in the schema                                         |
| Harold (gateway) | Opaque `session/update` fan-out. Prompt is plain text. No command catalog API | Forwards `tool_call` / `tool_call_update`. Always creates sessions with `mcpServers: []`. Capabilities cache is load/close/list only | No skills HTTP. Catalog note: one agent spawn flag `--experimental-skills` |
| Web chat         | No slash UI. Prototype menu removed                                           | Renders tool rows from stream. Ignores `available_commands_update`                                                                   | None                                                                       |
| Android chat     | Local `/` stub autocomplete only. No server binding                           | Same as web for transcript tools                                                                                                     | Stub names only (`stub-skill`). Explicitly no skills HTTP                  |

## Architecture (how discovery would fit)

```
Web / Android  --REST/WS gateway-->  Harold  --stdio ACP-->  Agent process
                 prompt: { text }                  session/prompt [{ type: text }]
                 session_update (opaque)           session/update (...)
```

Clients never speak ACP. The server is the ACP client. Anything the agent
advertises (commands, modes, plans) arrives as `session/update` and is fanned
out as gateway `session_update` with `update: unknown`
([`packages/contracts/src/http/session.stream.ts`](../../packages/contracts/src/http/session.stream.ts)
lines 50–55, 16–21).

"Tool discovery" in this architecture means one of:

1. **Runtime tool activity** (shipped): parse `tool_call` / `tool_call_update`
   from the stream for transcript UI.
2. **Slash command menus** (protocol-ready, client not wired): handle
   `available_commands_update` and drive a `/` picker from that list.
3. **MCP tool catalogs** (not exposed to chat UIs): ACP lets the **client**
   attach MCP servers on `session/new`. Harold always passes `[]`. Cursor
   ACP can also load project/user `.cursor/mcp.json` when the agent process
   starts in that cwd ([Cursor ACP](https://cursor.com/docs/cli/acp)). Chat
   clients do not list MCP tools over REST/WS today.

## ACP protocol: commands, tools, skills

### Slash commands (official)

Primary: [Slash Commands (v1)](https://agentclientprotocol.com/protocol/v1/slash-commands)

- After `session/new`, the agent **MAY** send
  `sessionUpdate: "available_commands_update"` with `availableCommands[]`
  (`name`, `description`, optional `input.hint`).
- Commands can change mid-session with another notification.
- Invocation is **not** a separate RPC. The client puts `/name …` in a normal
  `session/prompt` text content block.

Also listed under Agent → Client notifications in
[Overview](https://agentclientprotocol.com/protocol/overview)
("Available commands updates").

Schema excerpts (v1 schema dump): `AvailableCommand`,
`AvailableCommandsUpdate` with discriminator `"available_commands_update"`
([schema](https://agentclientprotocol.com/protocol/v1/schema)).

v2 keeps the same advertisement model. Command `input` gains a required
`type: "text"` discriminator
([v2 migration](https://agentclientprotocol.com/protocol/v2/migration)).

### Tools (official)

- Agents report tool execution via `session/update` (`tool_call`,
  `tool_call_update`). See [Tool Calls](https://agentclientprotocol.com/protocol/v1/tool-calls)
  and overview.
- Permission: `session/request_permission` (client method).
- There is **no** ACP method that returns a static list of "available tools"
  for a slash menu.
- MCP: clients pass `mcpServers` on `session/new` / `session/load`
  ([Session Setup](https://agentclientprotocol.com/protocol/v1/session-setup)).
  Agent capabilities may advertise `mcpCapabilities.http` / `sse`.
- Prompt capabilities may advertise `image` / `audio` / `embeddedContext`
  (schema default on `AgentCapabilities`).

### Skills

Official ACP v1 schema text used for this research has **no** `skill` /
`skills` types (searched schema page content). Product "skills" (Cursor agent
skills, experimental agent flags) are outside the slash-command advertisement
model unless an agent chooses to surface them as `availableCommands`.

## Cursor ACP (as implemented against this server)

Primary: [Cursor CLI ACP](https://cursor.com/docs/cli/acp)

- Flow: `initialize` → `authenticate` (`cursor_login`) → `session/new` or
  `session/load` → `session/prompt` → `session/update` / permissions / cancel.
- Modes: `agent` / `plan` / `ask` (session modes, not slash discovery).
- MCP: project/user `.cursor/mcp.json`. Team dashboard MCP not supported in ACP
  mode.
- Extensions: `cursor/ask_question`, `cursor/create_plan`, notifications for
  todos/tasks/images. These are richer UX, not a tool catalog for the composer.
- Docs sample client only handles `agent_message_chunk` for streaming. It does
  not demonstrate `available_commands_update`.

Harold Cursor profile: `agent acp`, `cursor_login`, fs + terminal client
caps
([`apps/server/src/acp/catalog/overrides/cursor.override.ts`](../../apps/server/src/acp/catalog/overrides/cursor.override.ts)
lines 3–13).

## What Harold implements today

### Session / prompt path

1. Gateway client sends WS `prompt` with `text`
   ([`SessionStreamPromptSchema`](../../packages/contracts/src/http/session.stream.ts)
   lines 16–21).
2. Hub wraps it as ACP prompt content
   `[{ type: "text", text }]`
   ([`acp.hub.prompt.ts`](../../apps/server/src/session/hub/acp.hub.prompt.ts)
   lines 14–18).
3. Supervisor calls `session/prompt`
   ([`acp-supervisor.ts`](../../apps/server/src/acp/supervisor/acp-supervisor.ts)
   lines 856–866).
4. Agent `session/update` notifications are forwarded unchanged to subscribers
   ([`acp-supervisor.ts`](../../apps/server/src/acp/supervisor/acp-supervisor.ts)
   lines 344–354;
   [`hub.ts`](../../apps/server/src/session/hub/hub.ts)
   lines 434–440).

So if an agent emits `available_commands_update`, the **bytes reach** web and
Android as `session_update`. Neither client parses that update kind into UI
state today (see below).

### Capabilities cached from `initialize`

Supervisor stores only:

```ts
{ loadSession, sessionCapabilities: { close, list } }
```

([`acp-supervisor-types.ts`](../../apps/server/src/acp/supervisor/acp-supervisor-types.ts)
lines 9–15;
[`parseAgentCapabilities`](../../apps/server/src/acp/supervisor/acp-supervisor.ts)
lines 70–76).

It does **not** persist or expose to REST clients `promptCapabilities`,
`mcpCapabilities`, or a command list.

### MCP on session create

`session/new` / load always use `mcpServers: []`
([`acp-supervisor.ts`](../../apps/server/src/acp/supervisor/acp-supervisor.ts)
lines 577, 612, 757; tests expect `[]` around line 909).

### Skills in catalog

Generated catalog includes Qwen spawn with `--experimental-skills`
([`catalog.agents.generated.ts`](../../apps/server/src/acp/catalog/generated/catalog.agents.generated.ts)
line 509). That is agent-process configuration, not a chat skills API.

## Web chat UX

Composer: textarea + send/cancel only. Placeholder `Ask the agent…`. No `/`
handler
([`ChatComposer.tsx`](../../apps/web/src/chat/ChatComposer.tsx) lines 43–91).

`parseAcpUpdate` handles:

- `agent_message_chunk`, `agent_thought_chunk`
- `tool_call`, `tool_call_update`
- `user_message_chunk`
- everything else → `ignored` (includes `session_info_update`, and would
  include `available_commands_update`)

([`acp.update.ts`](../../apps/web/src/chat/acp.update.ts) lines 114–170;
test for ignored `session_info_update` in
[`acp.update.test.ts`](../../apps/web/src/chat/acp.update.test.ts) line 54).

### Removed prototype slash menu

Commit `3f81079` (_Remove prototype chat and shell chrome_, #157) deleted:

- `apps/web/src/chat/SlashMenu.tsx`
- `PromptChips.tsx`
- `chat-commands.ts`

Regression test now asserts those controls are **gone**
([`chat.page.test.tsx`](../../apps/web/src/chat/chat.page.test.tsx)
lines 176–191): no menu named "Slash commands", no prompt chips, no attach,
no "ACP v0.8" footer.

## Android chat UX

### Shipped slash stub (AGE-46)

Local catalog only. Comment: "No skills HTTP."
([`SlashStubCatalog.kt`](../../apps/android/app/src/main/java/server/agent/android/chat/SlashStubCatalog.kt)
lines 9–22).

- Stubs: `stub-skill`, `stub-help`
- `/` at token start opens a card list; selection inserts `/name `
  ([`ChatScreen.kt`](../../apps/android/app/src/main/java/server/agent/android/chat/ChatScreen.kt)
  lines 472–528)
- Not fed by ACP `available_commands_update`

Linear project **Android chat chrome & composer** states out of scope: "Real
skills catalog or server binding"
([project](https://linear.app/harold/project/android-chat-chrome-and-composer-486c76e83f0a)).
Issue [AGE-46](https://linear.app/harold/issue/AGE-46/composer-icon-send-and-slash-stub-host)
(Done): icon send + stub `/` host, no skills API.

UX research target (Discord/Slack-style `/` autocomplete, skills later):
[`docs/research/android-chrome-chat-ui-patterns.md`](./android-chrome-chat-ui-patterns.md)
lines 28–33, 273–281, 309.

### ACP update parsing

Same ignored set as web for non-transcript updates
([`AcpUpdate.kt`](../../apps/android/app/src/main/java/server/agent/android/chat/AcpUpdate.kt)
lines 40–80).

### Voice input (do not overlap)

| Piece                                                              | Status                                                                                                                    | Source                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `SpeechRecognizer` engine, mute cycles, start-over, `RECORD_AUDIO` | Done ([AGE-58](https://linear.app/harold/issue/AGE-58/android-chat-voice-dictation-recognition-and-session-state))        | `SpeechRecognitionClient.kt`, `VoiceDictationController.kt`, ViewModel wiring |
| Mic button + full-screen overlay UI                                | In Review ([AGE-59](https://linear.app/harold/issue/AGE-59/android-chat-voice-dictation-full-screen-overlay-ui), PR #215) | Not wired on `ChatScreen` / `AppNavHost` in this tree at check time           |

Voice fills the **composer draft** then the operator still taps Send. Separate
from slash discovery.

## Related ADRs / delivery structure

### ADRs in-repo

[`docs/adr/`](../adr/) covers device auth / pairing only (0001–0003). No ADR for
slash commands or tool discovery.

### Delivery structure (Linear project build specs)

**Android chat chrome & composer** (Completed):

- Slice 4: Composer icon send + `/` stub autocomplete host
- Contracts: no new HTTP. Stub catalog local only
- Explicit later work: real skills catalog / server binding

**ACP session gateway** (In Progress):

- Host spawns ACP agents, unions `session/list`, fans out `session/update`
- Pass-through `session/prompt` / cancel
- Web + Android both use the same gateway protocol ([AGE-50](https://linear.app/harold/issue/AGE-50/web-talks-to-the-gateway),
  [AGE-51](https://linear.app/harold/issue/AGE-51/android-talks-to-the-gateway))
- Contracts: Zod at HTTP/WS edges. Live transcript is ACP update fan-out
- Does **not** define a skills or command-menu contract beyond opaque updates

Project: [ACP session gateway](https://linear.app/harold/project/acp-session-gateway-492819e1e1b8)

## What is possible vs not possible today

### Possible now

1. Operator types `/anything` as plain prompt text. Agent may treat it as a
   slash command if it implements that convention (ACP running-commands model).
2. Agent may emit `available_commands_update`. Server will fan it out. Clients
   ignore it for UI.
3. Clients show **in-progress tool calls** from the stream.
4. Android shows a **local stub** `/` picker (placeholders only).
5. Android voice dictation engine can fill the composer (overlay UI pending /
   in review).

### Not possible today (without new work)

1. Web slash menu / command chips (removed on purpose).
2. Client discovering agent tools as a browsable catalog over REST/WS.
3. Binding the `/` picker to ACP `availableCommands`.
4. Skills catalog HTTP or shared web/Android skills API.
5. Chat clients configuring MCP servers for the session (`mcpServers` always
   empty from Harold).
6. Exposing full `agentCapabilities` (prompt/MCP) to clients.

### Natural next seams (inferred from sources, not committed)

1. Parse `available_commands_update` in web + Android reducers. Drive `/`
   autocomplete from session state.
2. Optionally persist last command list per subscribed session on the hub.
3. Decide product "skills" = ACP commands, Cursor-side files, or a new gateway
   resource. ACP itself does not define skills.

## Sources

### Official

- https://agentclientprotocol.com/protocol/overview
- https://agentclientprotocol.com/protocol/v1/slash-commands
- https://agentclientprotocol.com/protocol/v1/session-setup
- https://agentclientprotocol.com/protocol/v1/schema
- https://agentclientprotocol.com/protocol/v2/migration
- https://cursor.com/docs/cli/acp

### Repo

- `packages/contracts/src/http/session.stream.ts`
- `apps/server/src/session/hub/acp.hub.prompt.ts`
- `apps/server/src/session/hub/hub.ts`
- `apps/server/src/acp/supervisor/acp-supervisor.ts`
- `apps/web/src/chat/ChatComposer.tsx`, `acp.update.ts`, `chat.page.test.tsx`
- `apps/android/.../SlashStubCatalog.kt`, `ChatScreen.kt`, `AcpUpdate.kt`
- `apps/android/.../VoiceDictationController.kt`, `SpeechRecognitionClient.kt`
- `docs/research/android-chrome-chat-ui-patterns.md`
- Git: `3f81079` (prototype slash removal), `84f92c7` (AGE-46)

### Linear (product delivery)

- Project Android chat chrome & composer
- Project ACP session gateway
- AGE-46, AGE-50, AGE-51, AGE-58, AGE-59
