#!/usr/bin/env python3
"""Tiny multi-session ACP agent used by the SSH integration test.

Exercises initialize, session/new, session/list, session/load, session/delete,
prompt, permission, terminal, config options, and cancellation without a model
provider. Session history lives in a per-agent JSON file when
HAROLD_FAKE_ACP_STATE_DIR is set, so separate processes see the same list and
a restarted process can replay a session's earlier conversation.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

LOG_PATH = os.environ.get("HAROLD_FAKE_ACP_LOG")
STATE_DIR = os.environ.get("HAROLD_FAKE_ACP_STATE_DIR")
AGENT_ID = os.environ.get("HAROLD_FAKE_ACP_AGENT_ID", "opencode")
PAGE_SIZE = int(os.environ.get("HAROLD_FAKE_ACP_LIST_PAGE_SIZE", "50"))
HISTORY_LIMIT = 20

CONFIG_OPTIONS = [
    {
        "id": "model",
        "name": "Model",
        "type": "select",
        "currentValue": "fake",
        "options": [{"value": "fake", "name": "Fake"}],
    }
]

# A per-process suffix is only used when the plain counter would collide with
# a session persisted by an earlier process (after a restart).
PROCESS_SUFFIX = os.urandom(3).hex()
session_counter = 0

next_id = 1000
pending: dict[int, dict] = {}
prompts: dict[str, int] = {}


def log(message: str) -> None:
    if LOG_PATH:
        with open(LOG_PATH, "a", encoding="utf-8") as log_file:
            log_file.write(message + "\n")


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


log(f"process_start agent={AGENT_ID} pid={os.getpid()}")


def state_path() -> str | None:
    if not STATE_DIR:
        return None
    os.makedirs(STATE_DIR, exist_ok=True)
    return os.path.join(STATE_DIR, f"{AGENT_ID}.json")


def load_sessions() -> list[dict]:
    """Read the per-agent session list, tolerating older state shapes."""
    path = state_path()
    if not path or not os.path.exists(path):
        return []
    try:
        with open(path, encoding="utf-8") as state_file:
            raw = json.load(state_file)
    except (OSError, ValueError):
        return []

    if isinstance(raw, dict):
        stored = raw.get("sessions")
        raw = stored if isinstance(stored, list) else list(raw.values())
    if not isinstance(raw, list):
        return []

    sessions: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        session_id = item.get("sessionId") or item.get("id")
        if not isinstance(session_id, str) or not session_id:
            continue
        history = item.get("history")
        sessions.append(
            {
                "sessionId": session_id,
                "cwd": item.get("cwd") if isinstance(item.get("cwd"), str) else "/tmp",
                "title": item.get("title") if isinstance(item.get("title"), str) else "New session",
                "updatedAt": item.get("updatedAt") if isinstance(item.get("updatedAt"), str) else now(),
                "history": [entry for entry in history if isinstance(entry, str)]
                if isinstance(history, list)
                else [],
            }
        )
    return sessions


def save_sessions(sessions: list[dict]) -> None:
    path = state_path()
    if not path:
        return
    temp = path + ".tmp"
    with open(temp, "w", encoding="utf-8") as state_file:
        json.dump(sessions, state_file)
    os.replace(temp, path)


def find_session(sessions: list[dict], session_id: str) -> dict | None:
    for session in sessions:
        if session.get("sessionId") == session_id:
            return session
    return None


def update_session(
    session_id: str,
    *,
    title: str | None = None,
    append: str | None = None,
) -> dict | None:
    sessions = load_sessions()
    session = find_session(sessions, session_id)
    if session is None:
        return None
    if title is not None:
        session["title"] = title
    if append is not None:
        history = list(session.get("history") or [])
        history.append(append)
        session["history"] = history[-HISTORY_LIMIT:]
    session["updatedAt"] = now()
    save_sessions(sessions)
    return session


def new_session_id() -> str:
    global session_counter
    existing = {session["sessionId"] for session in load_sessions()}
    while True:
        session_counter += 1
        candidate = f"ses_{AGENT_ID}_{session_counter}"
        if candidate not in existing:
            return candidate
        suffixed = f"{candidate}_{PROCESS_SUFFIX}"
        if suffixed not in existing:
            return suffixed


def send(message: dict) -> None:
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


def respond(request_id: int, result: object) -> None:
    send({"jsonrpc": "2.0", "id": request_id, "result": result})


def respond_error(request_id: int, code: int, message: str) -> None:
    send({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}})


def notify(method: str, params: object) -> None:
    send({"jsonrpc": "2.0", "method": method, "params": params})


def request(method: str, params: object, action: dict) -> int:
    global next_id
    request_id = next_id
    next_id += 1
    pending[request_id] = action
    send({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})
    return request_id


def update(session_id: str, text: str) -> None:
    notify(
        "session/update",
        {
            "sessionId": session_id,
            "update": {
                "sessionUpdate": "agent_message_chunk",
                "content": {"type": "text", "text": text},
            },
        },
    )


def session_info(session_id: str, title: str) -> None:
    notify(
        "session/update",
        {
            "sessionId": session_id,
            "update": {
                "sessionUpdate": "session_info_update",
                "title": title,
                "updatedAt": now(),
            },
        },
    )


def prompt_text(params: dict) -> str:
    parts = []
    for block in params.get("prompt") or []:
        if isinstance(block, dict) and block.get("type") == "text":
            text = block.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "\n".join(parts)


def clear_prompt(session_id: str) -> int | None:
    prompt_id = prompts.pop(session_id, None)
    if prompt_id is not None:
        for key, action in list(pending.items()):
            if action.get("promptId") == prompt_id:
                pending.pop(key, None)
    return prompt_id


for line in sys.stdin:
    if not line.strip():
        continue
    message = json.loads(line)
    method = message.get("method")
    log(f"recv agent={AGENT_ID} method={method} id={message.get('id')}")
    request_id = message.get("id")
    params = message.get("params") or {}

    if method is None:
        action = pending.pop(request_id, None)
        if action is None:
            log(f"response ignored id={request_id}")
            continue
        log(f"response action={action.get('kind')} id={request_id}")
        session_id = action.get("sessionId")
        prompt_id = action.get("promptId")
        kind = action.get("kind")
        if kind == "permission":
            update(session_id, "permission answered")
            request(
                "terminal/create",
                {
                    "sessionId": session_id,
                    "command": "printf",
                    "args": ["terminal-ok"],
                    "cwd": "/tmp",
                },
                {"kind": "terminal_for_prompt", "sessionId": session_id, "promptId": prompt_id},
            )
        elif kind == "terminal_for_prompt":
            terminal_id = (message.get("result") or {}).get("terminalId", "term_1")
            request(
                "terminal/output",
                {"sessionId": session_id, "terminalId": terminal_id},
                {
                    "kind": "terminal_output",
                    "sessionId": session_id,
                    "promptId": prompt_id,
                    "terminalId": terminal_id,
                },
            )
        elif kind == "terminal_output":
            terminal_id = action.get("terminalId", "term_1")
            update(session_id, "terminal result received")
            update(session_id, "hello from fake acp")
            update_session(session_id, append="hello from fake acp")
            prompts.pop(session_id, None)
            respond(int(prompt_id), {"stopReason": "end_turn"})
            request(
                "terminal/release",
                {"sessionId": session_id, "terminalId": terminal_id},
                {"kind": "terminal_release", "sessionId": session_id},
            )
        continue

    if method == "initialize":
        respond(
            request_id,
            {
                "protocolVersion": 1,
                "agentCapabilities": {
                    "loadSession": True,
                    "promptCapabilities": {"image": True, "embeddedContext": True},
                    "sessionCapabilities": {
                        "list": {},
                        "delete": {},
                        "resume": {},
                    },
                },
                "authMethods": [],
                "agentInfo": {"name": "Fake ACP", "version": "1"},
            },
        )
    elif method == "session/new":
        cwd = params.get("cwd", "/tmp")
        session_id = new_session_id()
        sessions = load_sessions()
        sessions.append(
            {
                "sessionId": session_id,
                "cwd": cwd,
                "title": "New session",
                "updatedAt": now(),
                "history": [],
            }
        )
        save_sessions(sessions)
        log(f"session/new id={session_id} cwd={cwd}")
        respond(
            request_id,
            {
                "sessionId": session_id,
                "configOptions": CONFIG_OPTIONS,
            },
        )
    elif method == "session/list":
        cwd = params.get("cwd")
        sessions = [
            session
            for session in load_sessions()
            if not cwd or session.get("cwd") == cwd
        ]
        offset = int(params.get("cursor") or 0)
        page = sessions[offset : offset + PAGE_SIZE]
        result = {
            "sessions": [
                {
                    "sessionId": session["sessionId"],
                    "cwd": session["cwd"],
                    "title": session["title"],
                    "updatedAt": session["updatedAt"],
                }
                for session in page
            ]
        }
        if offset + PAGE_SIZE < len(sessions):
            result["nextCursor"] = str(offset + PAGE_SIZE)
        log(f"session/list cwd={cwd} returned={len(page)}")
        respond(request_id, result)
    elif method == "session/delete":
        session_id = params.get("sessionId")
        save_sessions(
            [session for session in load_sessions() if session.get("sessionId") != session_id]
        )
        clear_prompt(session_id)
        log(f"session/delete id={session_id}")
        respond(request_id, {})
    elif method == "session/load":
        session_id = params.get("sessionId")
        session = find_session(load_sessions(), session_id)
        if session is None:
            log(f"session/load missing id={session_id}")
            respond_error(request_id, -32002, f"Unknown session: {session_id}")
        else:
            for entry in session.get("history") or []:
                update(session_id, entry)
            update(session_id, "replayed history")
            session_info(session_id, session.get("title") or "Fake titled session")
            respond(request_id, {"configOptions": CONFIG_OPTIONS})
    elif method == "session/prompt":
        session_id = params.get("sessionId")
        text = prompt_text(params)
        session = update_session(session_id, title="Fake titled session", append=text)
        if session is None:
            log(f"session/prompt unknown id={session_id}")
            respond_error(request_id, -32002, f"Unknown session: {session_id}")
        else:
            prompts[session_id] = request_id
            session_info(session_id, "Fake titled session")
            request(
                "session/request_permission",
                {
                    "sessionId": session_id,
                    "toolCall": {"toolCallId": "tool_1", "title": "Run tests"},
                    "options": [
                        {"optionId": "allow", "name": "Allow", "kind": "allow"},
                        {"optionId": "deny", "name": "Deny", "kind": "deny"},
                    ],
                },
                {"kind": "permission", "sessionId": session_id, "promptId": request_id},
            )
    elif method == "session/cancel":
        session_id = params.get("sessionId")
        prompt_id = clear_prompt(session_id)
        log(f"session/cancel id={session_id} prompt={prompt_id}")
        if prompt_id is not None:
            respond(int(prompt_id), {"stopReason": "cancelled"})
    elif method == "session/set_config_option":
        respond(request_id, {"configOptions": CONFIG_OPTIONS})
    elif method == "fs/read_text_file":
        respond(request_id, {"content": "file contents\n"})
    elif method == "fs/write_text_file":
        respond(request_id, None)
    elif method == "terminal/output":
        respond(request_id, {"output": "terminal-ok", "truncated": False})
    elif method == "terminal/wait_for_exit":
        respond(request_id, {"exitCode": 0})
    elif method == "terminal/release":
        respond(request_id, None)
    elif method == "terminal/kill":
        respond(request_id, None)
    else:
        if request_id is not None:
            respond_error(request_id, -32601, f"unknown {method}")
