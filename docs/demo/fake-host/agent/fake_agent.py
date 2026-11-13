#!/usr/bin/env python3
"""Scripted ACP agent for the Harold demo host.

One process serves one agent id. It speaks JSON-RPC over stdio, keeps its
session list in ~/.harold-demo/agents/<agent>.json, and replays deterministic
transcripts. Prompts are routed by intent:

  * a plan prompt answers with a short plan and one elicitation question;
  * a build prompt writes the cat-mode files, commits them, and reports usage;
  * a PR prompt pushes the branch and opens the fake draft PR;
  * anything else gets a short canned answer.

Run with --seed to write the session history the video starts from.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

HOME = os.path.expanduser("~")
STATE_DIR = os.path.join(HOME, ".harold-demo", "agents")
LOG_PATH = os.path.join(HOME, ".harold-demo", "agent.log")

AGENT_NAMES = {
    "opencode": "OpenCode",
    "claude-acp": "Claude Agent",
    "codex-acp": "Codex",
    "cursor": "Cursor",
    "gemini": "Gemini CLI",
}

CHAR_DELAY = float(os.environ.get("HAROLD_FAKE_CHAR_DELAY", "0.012"))
CHUNK = 24
TOOL_DELAY = float(os.environ.get("HAROLD_FAKE_TOOL_DELAY", "0.22"))

BUILD_SUMMARY = """Cat mode is in.

- `src/cat-mode.js` draws Mia wandering across the canvas.
- `src/settings.js` gets a Cat mode toggle.
- `test/cat-mode.test.js` covers the toggle and the cat path.

Committed 3 files on `feat/cat-mode`. The worktree is clean."""

PR_SUMMARY = """Pushed `feat/cat-mode` and opened a draft PR:

https://github.com/codenamegary/cat-screensaver/pull/42"""

PLAN_TEXT = """Here is the smallest plan:

1. Add `catMode` to the defaults and the settings controls.
2. Put the wandering-cat draw loop in `src/cat-mode.js`.
3. Add tests for the toggle and the cat path.
4. Commit on `feat/cat-mode` and leave the tree clean.

One choice before I build:"""


def log(message: str) -> None:
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        with open(LOG_PATH, "a", encoding="utf-8") as handle:
            handle.write(f"{datetime.now(timezone.utc).isoformat()} {message}\n")
    except OSError:
        pass


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def state_path(agent: str) -> str:
    return os.path.join(STATE_DIR, f"{agent}.json")


def load_sessions(agent: str) -> list[dict]:
    path = state_path(agent)
    if not os.path.exists(path):
        return []
    try:
        with open(path, encoding="utf-8") as handle:
            raw = json.load(handle)
    except (OSError, ValueError):
        return []
    sessions = raw.get("sessions") if isinstance(raw, dict) else raw
    if not isinstance(sessions, list):
        return []
    return [session for session in sessions if isinstance(session, dict)]


def save_sessions(agent: str, sessions: list[dict]) -> None:
    os.makedirs(STATE_DIR, exist_ok=True)
    path = state_path(agent)
    temp = path + ".tmp"
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump({"sessions": sessions}, handle, indent=2)
        handle.write("\n")
    os.replace(temp, path)


def find_session(agent: str, session_id: str) -> dict | None:
    return next(
        (session for session in load_sessions(agent) if session.get("sessionId") == session_id),
        None,
    )


def update_session(
    agent: str,
    session_id: str,
    *,
    title: str | None = None,
    append_role: str | None = None,
    append_text: str | None = None,
    cwd: str | None = None,
    pending_question: dict | None = None,
    usage: dict | None = None,
) -> dict | None:
    sessions = load_sessions(agent)
    session = next(
        (item for item in sessions if item.get("sessionId") == session_id),
        None,
    )
    if session is None:
        return None
    if title is not None:
        session["title"] = title
    if cwd is not None:
        session["cwd"] = cwd
    if append_role is not None:
        history = session.setdefault("history", [])
        history.append({"role": append_role, "text": append_text or ""})
        session["history"] = history[-40:]
    if pending_question is not None:
        session["pendingQuestion"] = pending_question
    if usage is not None:
        session["usage"] = usage
    session["updatedAt"] = now()
    save_sessions(agent, sessions)
    return session


def clear_pending_question(agent: str, session_id: str) -> None:
    sessions = load_sessions(agent)
    for session in sessions:
        if session.get("sessionId") == session_id:
            session.pop("pendingQuestion", None)
    save_sessions(agent, sessions)


CONFIG_OPTIONS = [
    {
        "type": "select",
        "id": "model",
        "name": "Model",
        "category": "model",
        "currentValue": "deepseek/deepseek-flash",
        "options": [
            {"value": "deepseek/deepseek-flash", "name": "DeepSeek V4.1 Flash 1017"},
            {"value": "anthropic/claude-sonnet-4-5", "name": "Claude Sonnet 4.5"},
            {"value": "openai/gpt-5.2-codex", "name": "GPT-5.2 Codex"},
        ],
    },
    {
        "type": "select",
        "id": "mode",
        "name": "Mode",
        "category": "mode",
        "currentValue": "build",
        "options": [
            {"value": "build", "name": "Build"},
            {"value": "plan", "name": "Plan"},
        ],
    },
    {
        "type": "select",
        "id": "thought_level",
        "name": "Thinking",
        "category": "thought_level",
        "currentValue": "medium",
        "options": [
            {"value": "low", "name": "Thinking: Low"},
            {"value": "medium", "name": "Thinking: Medium"},
            {"value": "high", "name": "Thinking: High"},
        ],
    },
]


class FakeAgent:
    def __init__(self, agent: str) -> None:
        self.agent = agent
        self.prompt_turns: dict[str, dict] = {}
        # A question the agent has asked and not yet had answered, per session.
        # A real agent keeps its prompt open across a client reconnect; the demo
        # app drops the live stream whenever the phone sleeps, so the question is
        # re-issued on the next `session/load` instead of being lost.
        self.open_questions: dict[str, dict] = {}
        self.next_request_id = 9000
        self.config = json.loads(json.dumps(CONFIG_OPTIONS))

    # --- JSON-RPC output -------------------------------------------------

    def send(self, message: dict) -> None:
        sys.stdout.write(json.dumps(message) + "\n")
        sys.stdout.flush()

    def respond(self, request_id, result) -> None:
        self.send({"jsonrpc": "2.0", "id": request_id, "result": result})

    def respond_error(self, request_id, code: int, message: str) -> None:
        self.send(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": code, "message": message},
            }
        )

    def notify(self, method: str, params: dict) -> None:
        self.send({"jsonrpc": "2.0", "method": method, "params": params})

    def request(self, method: str, params: dict) -> int:
        request_id = self.next_request_id
        self.next_request_id += 1
        self.send(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": params,
            }
        )
        return request_id

    # --- ACP notifications ----------------------------------------------

    def update(self, session_id: str, payload: dict) -> None:
        self.notify(
            "session/update",
            {"sessionId": session_id, "update": payload},
        )

    def text_chunk(
        self,
        session_id: str,
        text: str,
        *,
        thought: bool = False,
        chunked: bool = True,
    ) -> None:
        kind = "agent_thought_chunk" if thought else "agent_message_chunk"
        size = CHUNK if chunked else max(len(text), 1)
        for index in range(0, len(text), size):
            piece = text[index : index + size]
            self.update(
                session_id,
                {
                    "sessionUpdate": kind,
                    "content": {"type": "text", "text": piece},
                },
            )
            if chunked:
                time.sleep(CHAR_DELAY)

    def tool(self, session_id: str, tool_id: str, title: str, kind: str) -> None:
        self.update(
            session_id,
            {
                "sessionUpdate": "tool_call",
                "toolCallId": tool_id,
                "title": title,
                "kind": kind,
                "status": "in_progress",
            },
        )
        time.sleep(TOOL_DELAY)

    def complete_tool(self, session_id: str, tool_id: str) -> None:
        self.update(
            session_id,
            {
                "sessionUpdate": "tool_call_update",
                "toolCallId": tool_id,
                "status": "completed",
            },
        )
        time.sleep(TOOL_DELAY * 0.5)

    USAGE = {
        "sessionUpdate": "usage_update",
        "used": 64200,
        "size": 1000000,
        "cost": {"amount": 0.016, "currency": "USD"},
    }

    def usage(self, session_id: str) -> None:
        self.update(session_id, self.USAGE)
        # The context line is state, not a message: the app drops it when it
        # rebuilds a session from `session/load`, and the phone loses the stream
        # on every screen sleep, so the figure has to travel with the session.
        update_session(self.agent, session_id, usage=self.USAGE)

    def title(self, session_id: str, title: str) -> None:
        self.update(
            session_id,
            {
                "sessionUpdate": "session_info_update",
                "title": title,
                "updatedAt": now(),
            },
        )

    # --- Protocol --------------------------------------------------------

    def handle(self, message: dict) -> None:
        if "method" not in message:
            self.handle_response(message)
            return

        method = message.get("method")
        request_id = message.get("id")
        params = message.get("params") or {}

        if method == "initialize":
            self.respond(
                request_id,
                {
                    "protocolVersion": 1,
                    "agentCapabilities": {
                        "loadSession": True,
                        "promptCapabilities": {
                            "image": True,
                            "embeddedContext": True,
                        },
                        "sessionCapabilities": {
                            "list": {},
                            "delete": {},
                            "resume": {},
                        },
                    },
                    "authMethods": [],
                    "agentInfo": {
                        "name": AGENT_NAMES.get(self.agent, self.agent),
                        "version": "demo",
                    },
                },
            )
        elif method == "session/new":
            self.session_new(request_id, params)
        elif method == "session/list":
            self.session_list(request_id, params)
        elif method == "session/load":
            self.session_load(request_id, params)
        elif method == "session/delete":
            self.session_delete(request_id, params)
        elif method == "session/prompt":
            self.session_prompt(request_id, params)
        elif method == "session/set_config_option":
            self.set_config(request_id, params)
        elif method == "session/cancel":
            self.session_cancel(params)
        else:
            if request_id is not None:
                self.respond_error(request_id, -32601, f"unknown {method}")

    def handle_response(self, message: dict) -> None:
        request_id = message.get("id")
        result = message.get("result") or {}
        turn = self.prompt_turns.get("question")
        if turn is None or turn.get("requestId") != request_id:
            log(f"ignored response id={request_id}")
            return
        self.prompt_turns.pop("question", None)
        session_id = turn["sessionId"]
        self.open_questions.pop(session_id, None)
        clear_pending_question(self.agent, session_id)
        answer = ""
        if isinstance(result, dict):
            content = result.get("content")
            if isinstance(content, dict):
                answer = str(content.get("mode") or content.get("choice") or "")
        log(f"elicitation answer session={session_id} answer={answer}")
        self.text_chunk(
            session_id,
            "Settings toggle it is. I will keep the change small and test it.",
        )
        prompt_id = turn.get("promptId")
        if prompt_id is not None:
            self.respond(prompt_id, {"stopReason": "end_turn"})

    def session_new(self, request_id, params: dict) -> None:
        cwd = str(params.get("cwd") or HOME)
        sessions = load_sessions(self.agent)
        index = len(sessions) + 1
        session_id = f"ses_demo_{self.agent.replace('-', '_')}_{index:04d}"
        sessions.append(
            {
                "sessionId": session_id,
                "cwd": cwd,
                "title": "New session",
                "updatedAt": now(),
                "history": [],
            }
        )
        save_sessions(self.agent, sessions)
        log(f"session/new {session_id} cwd={cwd}")
        self.respond(
            request_id,
            {
                "sessionId": session_id,
                "configOptions": self.config,
            },
        )

    def session_list(self, request_id, params: dict) -> None:
        cwd = params.get("cwd")
        sessions = sorted(
            load_sessions(self.agent),
            key=lambda session: session.get("updatedAt") or "",
            reverse=True,
        )
        if cwd:
            sessions = [session for session in sessions if session.get("cwd") == cwd]
        offset = int(params.get("cursor") or 0)
        page = sessions[offset : offset + 50]
        result = {
            "sessions": [
                {
                    "sessionId": session["sessionId"],
                    "cwd": session["cwd"],
                    "title": session.get("title") or "New session",
                    "updatedAt": session.get("updatedAt") or now(),
                }
                for session in page
            ]
        }
        if offset + 50 < len(sessions):
            result["nextCursor"] = str(offset + 50)
        log(f"session/list cwd={cwd} count={len(page)}")
        self.respond(request_id, result)

    def session_load(self, request_id, params: dict) -> None:
        session_id = str(params.get("sessionId") or "")
        session = find_session(self.agent, session_id)
        if session is None:
            self.respond_error(request_id, -32002, f"Unknown session: {session_id}")
            return
        for entry in session.get("history") or []:
            role = entry.get("role")
            text = entry.get("text") or ""
            if role == "user":
                self.update(
                    session_id,
                    {
                        "sessionUpdate": "user_message_chunk",
                        "content": {"type": "text", "text": text},
                    },
                )
            elif role == "thought":
                self.text_chunk(session_id, text, thought=True, chunked=False)
            elif role == "tool":
                tool_id = entry.get("id") or "seed-tool"
                self.tool(session_id, tool_id, text, entry.get("kind") or "execute")
                self.complete_tool(session_id, tool_id)
            else:
                # One chunk per replayed message: the client asks to load the
                # same session more than once, and two chunked replays running
                # at once interleave into one transcript row.
                self.text_chunk(session_id, text, chunked=False)
        stored_usage = session.get("usage")
        if isinstance(stored_usage, dict):
            self.update(session_id, stored_usage)
        # A question that is still open belongs to the session, not to the
        # connection that first carried it: re-ask it so a client that dropped
        # its stream comes back to the same card instead of a silent dead turn.
        # It is read back from the session file because the app also closes this
        # process when it goes to the background, so memory would be enough to
        # lose the question on every screen sleep.
        body = self.open_questions.get(session_id) or session.get("pendingQuestion")
        if body is not None:
            self.open_questions[session_id] = body
            question_id = self.request("elicitation/create", body)
            self.prompt_turns["question"] = {
                "requestId": question_id,
                "promptId": None,
                "sessionId": session_id,
            }
            log(f"restored question {question_id} session={session_id}")
        log(f"session/load {session_id}")
        self.respond(request_id, {"configOptions": self.config})

    def session_delete(self, request_id, params: dict) -> None:
        session_id = str(params.get("sessionId") or "")
        save_sessions(
            self.agent,
            [
                session
                for session in load_sessions(self.agent)
                if session.get("sessionId") != session_id
            ],
        )
        log(f"session/delete {session_id}")
        self.respond(request_id, {})

    def set_config(self, request_id, params: dict) -> None:
        config_id = params.get("configId")
        value = params.get("value")
        for option in self.config:
            if option.get("id") == config_id:
                option["currentValue"] = value
        log(f"set_config {config_id}={value}")
        self.respond(request_id, {"configOptions": self.config})

    def session_cancel(self, params: dict) -> None:
        session_id = str(params.get("sessionId") or "")
        turn = self.prompt_turns.pop(session_id, None)
        question = self.prompt_turns.pop("question", None)
        if question and question.get("sessionId") == session_id:
            self.respond(question["promptId"], {"stopReason": "cancelled"})
        if turn:
            self.respond(turn["promptId"], {"stopReason": "cancelled"})
        log(f"session/cancel {session_id}")

    # --- Turns -----------------------------------------------------------

    def session_prompt(self, request_id, params: dict) -> None:
        session_id = str(params.get("sessionId") or "")
        text = "\n".join(
            block.get("text", "")
            for block in params.get("prompt") or []
            if isinstance(block, dict) and block.get("type") == "text"
        )
        session = update_session(
            self.agent,
            session_id,
            append_role="user",
            append_text=text,
        )
        if session is None:
            self.respond_error(request_id, -32002, f"Unknown session: {session_id}")
            return

        lowered = text.lower()
        if "plan only" in lowered or "plan a small cat mode" in lowered:
            self.turn_plan(session_id, request_id)
        elif "implement only the plan" in lowered or "settings toggle. implement" in lowered:
            self.turn_build(session_id, request_id, text)
        elif "draft pr" in lowered:
            self.turn_pr(session_id, request_id, text)
        else:
            self.text_chunk(session_id, "I can help with that. Ask me for a plan, a build, or a draft PR.")
            self.respond(request_id, {"stopReason": "end_turn"})

    def turn_plan(self, session_id: str, prompt_id) -> None:
        self.title(session_id, "Cat mode for the screensaver")
        self.text_chunk(
            session_id,
            "Let me read the spec and the settings file first.",
            thought=True,
        )
        self.tool(session_id, "tool-plan-read", "Read cat-mode.md", "read")
        self.complete_tool(session_id, "tool-plan-read")
        self.text_chunk(session_id, PLAN_TEXT)
        # Persist the plan so a reloaded session replays it. The app rebuilds its
        # transcript from `session/load`, so a plan held only in this process's
        # memory would vanish from the phone after any reconnect.
        update_session(
            self.agent,
            session_id,
            append_role="assistant",
            append_text=PLAN_TEXT,
        )
        body = {
            "sessionId": session_id,
            "toolCallId": "tool-plan-question",
            "message": "One choice before I build.",
            "mode": "form",
            "requestedSchema": {
                "type": "object",
                "properties": {
                    "mode": {
                        "type": "string",
                        "title": "How should cat mode turn on?",
                        "oneOf": [
                            {"const": "settings-toggle", "title": "Settings toggle"},
                            {"const": "automatic", "title": "Automatic"},
                        ],
                    }
                },
                "required": ["mode"],
            },
        }
        self.open_questions[session_id] = body
        update_session(
            self.agent,
            session_id,
            pending_question=body,
        )
        question_id = self.request("elicitation/create", body)
        self.prompt_turns["question"] = {
            "requestId": question_id,
            "promptId": prompt_id,
            "sessionId": session_id,
        }
        log(f"plan question {question_id} session={session_id}")

    def turn_build(self, session_id: str, prompt_id, text: str) -> None:
        self.title(session_id, "Cat mode for the screensaver")
        session = find_session(self.agent, session_id) or {}
        cwd = str(session.get("cwd") or HOME)
        self.text_chunk(
            session_id,
            "I will add the toggle, the cat loop, and the tests, then commit.",
            thought=True,
        )
        self.tool(session_id, "tool-build-read", "Read src/settings.js", "read")
        self.complete_tool(session_id, "tool-build-read")
        self.tool(session_id, "tool-build-settings", "Edit src/settings.js", "edit")
        self.tool(session_id, "tool-build-cat", "Write src/cat-mode.js", "edit")
        self.tool(session_id, "tool-build-test", "Write test/cat-mode.test.js", "edit")
        error = self.apply_build_changes(cwd)
        if error:
            self.text_chunk(session_id, f"I hit a snag: {error}")
            self.respond(prompt_id, {"stopReason": "end_turn"})
            return
        self.complete_tool(session_id, "tool-build-settings")
        self.complete_tool(session_id, "tool-build-cat")
        self.complete_tool(session_id, "tool-build-test")
        self.tool(session_id, "tool-build-test-run", "Run node --test", "execute")
        self.complete_tool(session_id, "tool-build-test-run")
        self.tool(session_id, "tool-build-commit", "Commit on feat/cat-mode", "execute")
        if self.run(["git", "add", "-A"], cwd) == 0:
            self.run(
                [
                    "git",
                    "-c",
                    "user.name=Harold Demo",
                    "-c",
                    "user.email=harold-demo@example.invalid",
                    "commit",
                    "-m",
                    "Add cat mode",
                ],
                cwd,
            )
        self.complete_tool(session_id, "tool-build-commit")
        self.usage(session_id)
        self.text_chunk(session_id, BUILD_SUMMARY)
        update_session(
            self.agent,
            session_id,
            append_role="assistant",
            append_text=BUILD_SUMMARY,
        )
        self.respond(prompt_id, {"stopReason": "end_turn"})
        log(f"build committed cwd={cwd}")

    def turn_pr(self, session_id: str, prompt_id, text: str) -> None:
        session = find_session(self.agent, session_id) or {}
        cwd = str(session.get("cwd") or HOME)
        self.tool(session_id, "tool-pr-push", "Push feat/cat-mode", "execute")
        pushed = self.run(["git", "push", "-u", "origin", "feat/cat-mode"], cwd)
        if pushed != 0:
            log("git push failed; the local bare remote is missing")
        self.complete_tool(session_id, "tool-pr-push")
        self.tool(session_id, "tool-pr-open", "Open draft PR", "execute")
        url = "https://github.com/codenamegary/cat-screensaver/pull/42"
        try:
            created = subprocess.run(
                ["gh", "pr", "create", "--draft", "--title", "Add cat mode"],
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )
            if created.stdout.strip():
                url = created.stdout.strip().splitlines()[-1]
        except (OSError, subprocess.SubprocessError) as error:
            log(f"gh failed: {error}")
        self.complete_tool(session_id, "tool-pr-open")
        summary = PR_SUMMARY.replace(
            "https://github.com/codenamegary/cat-screensaver/pull/42",
            url,
        )
        self.text_chunk(session_id, summary)
        update_session(
            self.agent,
            session_id,
            append_role="assistant",
            append_text=summary,
        )
        self.respond(prompt_id, {"stopReason": "end_turn"})
        log(f"pr {url}")

    # --- Host edits ------------------------------------------------------

    def apply_build_changes(self, cwd: str) -> str | None:
        try:
            settings_path = os.path.join(cwd, "src", "settings.js")
            with open(settings_path, encoding="utf-8") as handle:
                settings = handle.read()

            if "catMode" not in settings:
                settings = settings.replace(
                    "export const DEFAULT_SETTINGS = Object.freeze({\n",
                    "export const DEFAULT_SETTINGS = Object.freeze({\n  catMode: false,\n",
                )
                settings = settings.replace(
                    '  { key: "showClock", label: "Show clock", type: "toggle" },\n',
                    '  { key: "showClock", label: "Show clock", type: "toggle" },\n'
                    '  { key: "catMode", label: "Cat mode", type: "toggle" },\n',
                )
                with open(settings_path, "w", encoding="utf-8") as handle:
                    handle.write(settings)

            with open(os.path.join(cwd, "src", "cat-mode.js"), "w", encoding="utf-8") as handle:
                handle.write(
                    "export const catModeOn = (settings) => Boolean(settings?.catMode)\n"
                    "\n"
                    "export const catPosition = (elapsedMs, width, height) => ({\n"
                    "  x: (elapsedMs * 0.06) % width,\n"
                    "  y: height * 0.72 + Math.sin(elapsedMs * 0.004) * height * 0.08,\n"
                    "})\n"
                    "\n"
                    "export const drawCat = (context, settings, elapsedMs, width, height) => {\n"
                    "  if (!catModeOn(settings)) return\n"
                    "  const { x, y } = catPosition(elapsedMs, width, height)\n"
                    "  context.fillStyle = \"#b6f36b\"\n"
                    "  context.fillRect(x, y, 18, 10)\n"
                    "  context.fillRect(x + 14, y - 5, 6, 6)\n"
                    "}\n"
                )

            test_path = os.path.join(cwd, "test", "cat-mode.test.js")
            os.makedirs(os.path.dirname(test_path), exist_ok=True)
            with open(test_path, "w", encoding="utf-8") as handle:
                handle.write(
                    "import assert from \"node:assert/strict\"\n"
                    "import test from \"node:test\"\n"
                    "import { catModeOn, catPosition } from \"../src/cat-mode.js\"\n"
                    "\n"
                    "test(\"cat mode follows the settings toggle\", () => {\n"
                    "  assert.equal(catModeOn({ catMode: true }), true)\n"
                    "  assert.equal(catModeOn({ catMode: false }), false)\n"
                    "  assert.equal(catModeOn({}), false)\n"
                    "})\n"
                    "\n"
                    "test(\"the cat stays inside the frame\", () => {\n"
                    "  const point = catPosition(5000, 800, 600)\n"
                    "  assert.ok(point.x >= 0 && point.x <= 800)\n"
                    "  assert.ok(point.y >= 0 && point.y <= 600)\n"
                    "})\n"
                )

            return None
        except OSError as error:
            return str(error)

    def run(self, args: list[str], cwd: str) -> int:
        try:
            result = subprocess.run(
                args,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
            if result.returncode != 0:
                log(f"{' '.join(args)}: {result.stderr.strip()}")
            return result.returncode
        except (OSError, subprocess.SubprocessError) as error:
            log(f"{' '.join(args)} failed: {error}")
            return 1


SEED_SESSIONS = {
    "opencode": [
        {
            "sessionId": "ses_cat_kgb",
            "cwd": "/home/gary/sites/cat-screensaver-worktrees/cat-mode",
            "title": "Does KGB use cats?",
            "updatedAt": "2026-11-09T23:41:00Z",
            "history": [
                {"role": "user", "text": "Does KGB use cats?"},
                {
                    "role": "assistant",
                    "text": "No. They tried to recruit one, but the cat slept through the interview.",
                },
            ],
        },
        {
            "sessionId": "ses_cat_therapist",
            "cwd": "/home/gary/sites/cat-screensaver-worktrees/cat-mode",
            "title": "Cat therapist near me",
            "updatedAt": "2026-11-09T23:22:00Z",
            "history": [
                {"role": "user", "text": "Find a cat therapist near me."},
                {
                    "role": "assistant",
                    "text": "Dr. Whiskers has an opening at 3. Bring treats and low expectations.",
                },
            ],
        },
        {
            "sessionId": "ses_cat_hate",
            "cwd": "/home/gary/sites/cat-screensaver-worktrees/cat-mode",
            "title": "Why does my cat hate me?",
            "updatedAt": "2026-11-09T23:05:00Z",
            "history": [
                {"role": "user", "text": "Why does my cat hate me?"},
                {
                    "role": "assistant",
                    "text": "She does not hate you. You are simply warm furniture with thumbs.",
                },
            ],
        },
    ],
    "claude-acp": [
        {
            "sessionId": "ses_garden_palette",
            "cwd": "/home/gary/sites/moonlit-garden",
            "title": "Moonlit garden palette",
            "updatedAt": "2026-11-09T22:58:00Z",
            "history": [
                {"role": "user", "text": "Make the garden feel like midnight."},
                {
                    "role": "assistant",
                    "text": "I would keep the ink blue base and use lime only for the fireflies.",
                },
            ],
        }
    ],
    "codex-acp": [
        {
            "sessionId": "ses_meow_synth",
            "cwd": "/home/gary/sites/meow",
            "title": "Meow, a tiny synth",
            "updatedAt": "2026-11-09T22:44:00Z",
            "history": [
                {"role": "user", "text": "Make a synth that sounds like a cat."},
                {
                    "role": "assistant",
                    "text": "Sine wave, fast pitch envelope, and one very dramatic vibrato.",
                },
            ],
        }
    ],
}


def seed() -> int:
    os.makedirs(STATE_DIR, exist_ok=True)
    for agent, sessions in SEED_SESSIONS.items():
        save_sessions(agent, sessions)
        log(f"seeded {len(sessions)} sessions for {agent}")
    print(f"seeded {sum(len(value) for value in SEED_SESSIONS.values())} sessions")
    return 0


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: fake_agent.py <agent-id>|--seed [args...]", file=sys.stderr)
        return 2
    if sys.argv[1] == "--seed":
        return seed()
    agent = sys.argv[1]
    log(f"process start agent={agent} pid={os.getpid()} argv={sys.argv[2:]}")
    fake = FakeAgent(agent)
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            message = json.loads(line)
        except ValueError:
            log(f"bad json: {line[:200]}")
            continue
        try:
            fake.handle(message)
        except Exception as error:  # keep the process alive for the next turn
            log(f"handler error: {error!r}")
            request_id = message.get("id")
            if request_id is not None:
                fake.respond_error(request_id, -32603, str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
