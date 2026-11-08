#!/usr/bin/env python3
"""Tiny ACP agent used by the SSH integration test.

Exercises initialize, session/new, session/list, session/load, session/delete,
prompt, permission, terminal, config options, and cancellation without a model
provider. Session history lives in a per-agent JSON file when
HAROLD_FAKE_ACP_STATE_DIR is set, so separate processes see the same list.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

LOG_PATH = os.environ.get("HAROLD_FAKE_ACP_LOG")
STATE_DIR = os.environ.get("HAROLD_FAKE_ACP_STATE_DIR")
AGENT_ID = os.environ.get("HAROLD_FAKE_ACP_AGENT_ID", "opencode")
SESSION_ID = os.environ.get("HAROLD_FAKE_ACP_SESSION_ID", "ses_test_opencode")
PAGE_SIZE = int(os.environ.get("HAROLD_FAKE_ACP_LIST_PAGE_SIZE", "50"))

next_id = 1000
pending: dict[int, str] = {}


def log(message: str) -> None:
    if LOG_PATH:
        with open(LOG_PATH, "a", encoding="utf-8") as log_file:
            log_file.write(message + "\n")


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def state_path() -> str | None:
    if not STATE_DIR:
        return None
    os.makedirs(STATE_DIR, exist_ok=True)
    return os.path.join(STATE_DIR, f"{AGENT_ID}.json")


def load_sessions() -> list[dict]:
    path = state_path()
    if not path or not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as state_file:
        return json.load(state_file)


def save_sessions(sessions: list[dict]) -> None:
    path = state_path()
    if not path:
        return
    temp = path + ".tmp"
    with open(temp, "w", encoding="utf-8") as state_file:
        json.dump(sessions, state_file)
    os.replace(temp, path)


def upsert_session(cwd: str, title: str) -> None:
    sessions = [s for s in load_sessions() if s.get("sessionId") != SESSION_ID]
    sessions.append(
        {
            "sessionId": SESSION_ID,
            "cwd": cwd,
            "title": title,
            "updatedAt": now(),
        }
    )
    save_sessions(sessions)


def send(message: dict) -> None:
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


def respond(request_id: int, result: object) -> None:
    send({"jsonrpc": "2.0", "id": request_id, "result": result})


def notify(method: str, params: object) -> None:
    send({"jsonrpc": "2.0", "method": method, "params": params})


def request(method: str, params: object) -> int:
    global next_id
    request_id = next_id
    next_id += 1
    pending[request_id] = method
    send({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})
    return request_id


def update(text: str) -> None:
    notify(
        "session/update",
        {
            "sessionId": SESSION_ID,
            "update": {
                "sessionUpdate": "agent_message_chunk",
                "content": {"type": "text", "text": text},
            },
        },
    )


def session_info(title: str) -> None:
    notify(
        "session/update",
        {
            "sessionId": SESSION_ID,
            "update": {
                "sessionUpdate": "session_info_update",
                "title": title,
                "updatedAt": now(),
            },
        },
    )


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
        log(f"response action={action} id={request_id}")
        if action.startswith("permission:"):
            prompt_id = int(action.split(":", 1)[1])
            update("permission answered")
            terminal = request(
                "terminal/create",
                {
                    "sessionId": SESSION_ID,
                    "command": "printf",
                    "args": ["terminal-ok"],
                    "cwd": "/tmp",
                },
            )
            pending[terminal] = f"terminal-for-prompt:{prompt_id}"
        elif action.startswith("terminal-for-prompt:"):
            prompt_id = action.split(":", 1)[1]
            terminal_id = (message.get("result") or {}).get("terminalId", "term_1")
            output = request(
                "terminal/output",
                {"sessionId": SESSION_ID, "terminalId": terminal_id},
            )
            pending[output] = f"terminal-output:{terminal_id}:{prompt_id}"
        elif action.startswith("terminal-output:"):
            _, terminal_id, prompt_id = action.split(":", 2)
            update("terminal result received")
            update("hello from fake acp")
            respond(int(prompt_id), {"stopReason": "end_turn"})
            request(
                "terminal/release",
                {"sessionId": SESSION_ID, "terminalId": terminal_id},
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
        upsert_session(cwd, "New session")
        respond(
            request_id,
            {
                "sessionId": SESSION_ID,
                "configOptions": [
                    {
                        "id": "model",
                        "name": "Model",
                        "type": "select",
                        "currentValue": "fake",
                        "options": [{"value": "fake", "name": "Fake"}],
                    }
                ],
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
        result = {"sessions": page}
        if offset + PAGE_SIZE < len(sessions):
            result["nextCursor"] = str(offset + PAGE_SIZE)
        log(f"session/list cwd={cwd} returned={len(page)}")
        respond(request_id, result)
    elif method == "session/delete":
        session_id = params.get("sessionId")
        save_sessions(
            [session for session in load_sessions() if session.get("sessionId") != session_id]
        )
        respond(request_id, {})
    elif method == "session/load":
        upsert_session(params.get("cwd", "/tmp"), "Fake titled session")
        session_info("Fake titled session")
        update("replayed history")
        respond(request_id, {"configOptions": []})
    elif method == "session/prompt":
        upsert_session(params.get("cwd", "/tmp"), "Fake titled session")
        session_info("Fake titled session")
        permission = request(
            "session/request_permission",
            {
                "sessionId": SESSION_ID,
                "toolCall": {"toolCallId": "tool_1", "title": "Run tests"},
                "options": [
                    {"optionId": "allow", "name": "Allow", "kind": "allow"},
                    {"optionId": "deny", "name": "Deny", "kind": "deny"},
                ],
            },
        )
        pending[permission] = f"permission:{request_id}"
    elif method == "session/cancel":
        pass
    elif method == "session/set_config_option":
        respond(request_id, {"configOptions": []})
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
            send(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {"code": -32601, "message": f"unknown {method}"},
                }
            )
