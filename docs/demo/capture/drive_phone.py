#!/usr/bin/env python3
"""Drive the Harold Android app through the demo flow.

Assumes the app was just cleared and is showing the unpaired screen. The back
camera plays the composed QR clip, so the first Harold pairs by camera. The
second Harold is paired by typing its endpoint and code.

The walk is recorded as named slices: one screenrecord file per action, from
the tap through the wait for the UI to settle. Remotion schedules the slices.

`--warm` is a manual camera warm-up for debugging. Do not point a warm scan at
a live pairing QR; codes are single-use.
"""
import json
import os
import re
import shlex
import socket
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from contextlib import contextmanager

SERIAL = os.environ.get("SERIAL", "emulator-5554")
PROMPT = os.environ.get("PROMPT", "Do you think my cat's behaviour is strange?")
MODEL = os.environ.get("MODEL", "deepseek/DeepSeek V4.1 Flash 1017")
EFFORT_TARGET = os.environ.get("EFFORT_TARGET", "High")
MARKS = os.environ.get("MARKS", "marks.log")
SLICES = os.environ.get("SLICES", "slices.json")
WARM_SECONDS = float(os.environ.get("WARM_SECONDS", "25"))
SESSION_TITLE = os.environ.get("SESSION_TITLE", "Cat Therapist near me")
MENU_READY_TITLE = os.environ.get("MENU_READY_TITLE", "Does KGB use cats?")
WORKSPACE_READY_NAME = os.environ.get("WORKSPACE_READY_NAME", "elt-meeting-agenda")
HAROLD_ROOT = os.environ.get("HAROLD_ROOT")
INSTANCE2_DATA_DIR = os.environ.get("INSTANCE2_DATA_DIR")
INSTANCE2_PORT = os.environ.get("INSTANCE2_PORT", "3848")
INSTANCE2_ENDPOINT = os.environ.get("INSTANCE2_ENDPOINT", f"http://127.0.0.1:{INSTANCE2_PORT}")
INSTANCE1_WORKSPACES = os.environ.get(
    "INSTANCE1_WORKSPACES", os.path.expanduser("~/harold-demo-workspaces/3847")
)
WORKSPACE_PARENT = os.path.dirname(INSTANCE1_WORKSPACES)
WORKSPACE_PARENT_NAME = os.path.basename(WORKSPACE_PARENT)
WORKSPACE_FOLDER_NAME = os.path.basename(INSTANCE1_WORKSPACES)
SKIP_RECORD = os.environ.get("SKIP_RECORD") == "1"
START = time.monotonic()

UI_LABELS = {
    "New session",
    "Select session",
    "Disconnect from server",
    "Message",
    "Chat with an agent",
    "Start a new session or pick an existing one.",
    "GENERAL",
    "provider/model",
    "mode",
    "AGENT",
    "Thinking",
    "Working",
    "Replying",
    "Waiting for permission",
    "Stop",
    "Harold",
    "Not paired",
    "Pair device",
    "Pair",
    "Harold endpoint",
    "Pairing code",
    "Claim pairing code",
    "Use scanner",
    "Enter manually",
    "Name",
    "Color",
    "Icon",
    "Workspaces",
    "Add workspace",
    "Open folder",
    "Clone repo",
    "Folder",
    "Up",
    "New folder",
    "Filter folders",
    "Use this folder",
    "Selected folder",
    "Workspace name",
    "Repository URL",
    "New folder name",
    "Parent folder",
    "Destination",
    "Available",
    "Missing",
    "Unavailable",
    "Connected Servers",
    "See all sessions…",
    "Sessions",
    "Search sessions",
    "All",
    "Work",
    "Couch",
    "Choose a workspace and agent to start the session.",
    "Choose workspace",
    "Choose agent",
    "New workspace",
    "Continue",
    "Cursor",
    "OpenCode",
    "pi ACP",
    "Search models",
    "Model",
    "Commands",
    "Close command list",
    "Attach photo",
    "Attach files",
    "Dictate with voice",
    "Send message",
    "/init",
    "/review",
    "/compact",
}

VOICE_LABELS = {
    "Start speaking…",
    "Voice input",
    "Cancel",
    "Mute voice input",
    "Unmute voice input",
    "Switch to keyboard input",
    "Expand voice input",
    "Collapse voice input",
    "Send message",
    "Browse commands",
    "/",
    "Start voice input over",
}


def mark(name):
    now = time.monotonic()
    with open(MARKS, "a") as handle:
        handle.write(f"{name} {now:.3f}\n")
    print(f"[{now - START:6.1f}s] {name}", flush=True)


# --- Slice recording ---------------------------------------------------------

_slice_index = 0
_current_slice = None
_slices = []


def write_manifest():
    with open(SLICES, "w") as handle:
        json.dump(_slices, handle, indent=2)
        handle.write("\n")


def slice_start(name):
    global _slice_index, _current_slice
    if _current_slice is not None:
        raise RuntimeError(f"slice {_current_slice['name']} is still recording")
    _slice_index += 1
    mark(f"slice_start_{name}")
    if SKIP_RECORD:
        _current_slice = {
            "index": _slice_index,
            "name": name,
            "file": "",
            "started": time.monotonic(),
        }
        return
    filename = f"{_slice_index:03d}-{name}.mp4"
    remote = f"/data/local/tmp/harold-demo-{filename}"
    started = time.monotonic()
    for attempt in range(2):
        subprocess.Popen(
            [
                "adb", "-s", SERIAL, "shell", "screenrecord",
                "--bit-rate", "12000000", "--time-limit", "300",
                remote,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        time.sleep(0.8)
        exists = adb("shell", "test", "-f", remote).returncode == 0
        if exists:
            break
        adb("shell", "pkill", "-INT", "screenrecord")
        time.sleep(0.6)
    else:
        raise RuntimeError(f"screenrecord never created {remote}")
    _current_slice = {
        "index": _slice_index,
        "name": name,
        "file": filename,
        "started": started,
    }


def slice_stop():
    global _current_slice
    if _current_slice is None:
        return
    current = _current_slice
    current["ended"] = time.monotonic()
    mark(f"slice_end_{current['name']}")
    if not SKIP_RECORD:
        adb("shell", "pkill", "-INT", "screenrecord")
        for _ in range(20):
            running = adb("shell", "pidof", "screenrecord").stdout.strip()
            if not running:
                break
            time.sleep(0.2)
        time.sleep(0.5)
    _current_slice = None
    if not SKIP_RECORD:
        _slices.append(current)
        write_manifest()


@contextmanager
def recorded(name):
    slice_start(name)
    try:
        yield
    finally:
        slice_stop()


def mark_tap(x, y):
    if _current_slice is None:
        return
    with open(MARKS, "a") as handle:
        handle.write(f"tap {time.monotonic():.3f} {x} {y}\n")


# --- UIAutomator -------------------------------------------------------------


def adb(*args, timeout=30):
    return subprocess.run(
        ["adb", "-s", SERIAL, *args], capture_output=True, text=True, timeout=timeout
    )


def dump_root():
    last_error = None
    for _ in range(8):
        adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml")
        xml = adb("exec-out", "cat", "/sdcard/uidump.xml").stdout
        if "<hierarchy" in xml:
            try:
                return ET.fromstring(xml.strip())
            except ET.ParseError as error:
                last_error = error
        time.sleep(0.4)
    raise RuntimeError(f"uiautomator dump failed: {last_error}")


def bounds_center(bounds):
    match = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds or "")
    if match is None:
        return None
    x1, y1, x2, y2 = (int(value) for value in match.groups())
    return (x1 + x2) // 2, (y1 + y2) // 2


def find(root, text=None, desc=None, substring=False):
    for node in root.iter("node"):
        if text is not None:
            value = node.get("text") or ""
            if (text in value) if substring else (value == text):
                return node
        if desc is not None:
            value = node.get("content-desc") or ""
            if (desc in value) if substring else (value == desc):
                return node
    return None


def find_all(root, text=None, desc=None, substring=False):
    matches = []
    for node in root.iter("node"):
        if text is not None:
            value = node.get("text") or ""
            if (text in value) if substring else (value == text):
                matches.append(node)
        if desc is not None:
            value = node.get("content-desc") or ""
            if (desc in value) if substring else (value == desc):
                matches.append(node)
    return matches


def pick_node(nodes, prefer):
    if not nodes:
        return None
    if prefer == "largest":
        return max(nodes, key=lambda node: bounds_center(node.get("bounds"))[1])
    if prefer == "smallest":
        return min(nodes, key=lambda node: bounds_center(node.get("bounds"))[1])
    return nodes[0]


def wait_for(text=None, desc=None, substring=False, timeout=20.0, poll=0.4):
    deadline = time.time() + timeout
    while time.time() < deadline:
        node = find(dump_root(), text=text, desc=desc, substring=substring)
        if node is not None:
            return node
        time.sleep(poll)
    folder = os.path.dirname(MARKS) or "."
    shot = os.path.join(folder, "timeout.png")
    with open(shot, "wb") as handle:
        subprocess.run(
            ["adb", "-s", SERIAL, "exec-out", "screencap", "-p"],
            stdout=handle,
        )
    logcat = os.path.join(folder, "timeout.logcat")
    with open(logcat, "wb") as handle:
        subprocess.run(["adb", "-s", SERIAL, "logcat", "-d"], stdout=handle)
    raise TimeoutError(
        f"not found text={text!r} desc={desc!r} substring={substring}; "
        f"see {shot} and {logcat}"
    )


def tap_point(x, y, settle=0.6, label=None):
    mark_tap(x, y)
    adb("shell", "input", "tap", str(x), str(y))
    suffix = f" ({label!r})" if label else ""
    print(f"  tap at {x},{y}{suffix}")
    if settle:
        time.sleep(settle)


def tap(node, settle=0.6):
    x, y = bounds_center(node.get("bounds"))
    tap_point(
        x,
        y,
        settle,
        node.get("text") or node.get("content-desc") or "row",
    )


def tap_text(
    text,
    timeout=20.0,
    settle=0.6,
    substring=False,
    prefer="first",
):
    deadline = time.time() + timeout
    while time.time() < deadline:
        nodes = find_all(dump_root(), text=text, substring=substring)
        node = pick_node(nodes, prefer)
        if node is not None:
            tap(node, settle=settle)
            return
        time.sleep(0.4)
    raise TimeoutError(f"not found text={text!r} prefer={prefer!r}")


def tap_desc(desc, timeout=20.0, settle=0.6, substring=False):
    tap(wait_for(desc=desc, substring=substring, timeout=timeout), settle=settle)


def tap_text_scroll(text, timeout=15.0, settle=0.6, prefer="largest", max_swipes=6):
    for _ in range(max_swipes):
        nodes = find_all(dump_root(), text=text)
        node = pick_node(nodes, prefer)
        if node is not None:
            tap(node, settle=settle)
            return
        adb("shell", "input", "swipe", "540", "1800", "540", "900", "300")
        time.sleep(0.6)
    raise TimeoutError(f"not found text={text!r} after {max_swipes} swipes")


def edit_text_nodes():
    return [
        node
        for node in dump_root().iter("node")
        if node.get("class") == "android.widget.EditText"
    ]


def tap_edit_text(index=0, settle=0.6):
    nodes = edit_text_nodes()
    if index >= len(nodes):
        raise TimeoutError(f"edit text index {index} not found ({len(nodes)} present)")
    tap(nodes[index], settle=settle)


def type_text(text):
    escaped = shlex.quote(text.replace(" ", "%s"))
    adb("shell", "input", "text", escaped)


def replace_edit_text(index, text, settle=0.8):
    for attempt in range(2):
        tap_edit_text(index, settle=0.6)
        keys = ["KEYCODE_MOVE_END"] + ["KEYCODE_DEL"] * 20
        adb("shell", "input", "keyevent", *keys)
        time.sleep(0.3)
        type_text(text)
        time.sleep(settle)
        nodes = edit_text_nodes()
        if index < len(nodes) and (nodes[index].get("text") or "").strip() == text:
            return
        print(f"  retrying text entry for {text!r}", flush=True)
    actual = ""
    nodes = edit_text_nodes()
    if index < len(nodes):
        actual = (nodes[index].get("text") or "").strip()
    raise RuntimeError(f"could not enter {text!r} (field contains {actual!r})")


def dismiss_keyboard():
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(0.7)


def wait_until_missing(text, timeout=10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if find(dump_root(), text=text) is None:
            return
        time.sleep(0.4)
    raise TimeoutError(f"text={text!r} never disappeared")


def chip_value(prefix, timeout=15.0):
    node = wait_for(desc=prefix, substring=True, timeout=timeout)
    text = node.get("content-desc") or ""
    after = text.split(":", 1)[1] if ":" in text else text
    return after.split(".")[0].strip()


def tap_until_value(prefix, target, tries=6, settle=1.4):
    for _ in range(tries):
        if chip_value(prefix).lower() == target.lower():
            return True
        node = wait_for(desc=prefix, substring=True)
        x, y = bounds_center(node.get("bounds"))
        tap_point(x, y, settle)
    raise TimeoutError(f"{prefix!r} never reached {target!r} (last: {chip_value(prefix)!r})")


def wait_for_chat(timeout=45.0):
    wait_for(desc="Model:", substring=True, timeout=timeout)
    wait_for(text="Message", timeout=timeout)


def wait_for_identity(timeout=60.0):
    wait_for(desc="Violet", timeout=timeout)


def wait_for_session_selector(timeout=60.0):
    wait_for(desc="Select session:", substring=True, timeout=timeout)


def open_session_menu():
    tap(wait_for(desc="Select session:", substring=True, timeout=15))
    wait_for(text="New session", timeout=10)
    wait_for(text="See all sessions", substring=True, timeout=10)
    # The cache paints the menu before the refresh finishes. Wait for a row
    # that is never the header title so the session history beat does not land
    # on a loading state.
    wait_for(text=MENU_READY_TITLE, timeout=30)


def back_to_chat(tries=5):
    for _ in range(tries):
        root = dump_root()
        if find(root, desc="More chat options") is not None:
            return
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
        time.sleep(0.8)
    raise TimeoutError("could not return to the chat screen")


def open_workspaces():
    tap_desc("More chat options", timeout=10)
    wait_for(text="Workspaces", timeout=10)
    tap_text("Workspaces", timeout=10)
    wait_for(text="Workspaces", timeout=15)
    wait_for(text="Available", timeout=30)
    # The first Couch row is visible on the first screen. yuekbox is further
    # down the list, so wait for a workspace that proves both Harolds painted.
    wait_for(text=WORKSPACE_READY_NAME, timeout=30)


def open_add_workspace():
    tap_desc("Add workspace", timeout=10)
    wait_for(text="Add workspace", timeout=10)
    wait_for(text="Open folder", timeout=10)
    # The Harold picker is an EditText when both Harolds are saved, so the
    # filter must be focused by its label rather than by index.
    tap_text("Filter folders", timeout=10)
    type_text(WORKSPACE_PARENT_NAME)
    wait_for(text=WORKSPACE_PARENT, timeout=10)
    dismiss_keyboard()
    tap_text(WORKSPACE_PARENT, timeout=10)
    wait_for(text=WORKSPACE_FOLDER_NAME, timeout=10)
    tap_text(WORKSPACE_FOLDER_NAME, timeout=10)
    wait_for(text="harold", timeout=10)


def tap_send_button():
    tap(wait_for(desc="Send message", timeout=10), settle=0.5)


def wait_for_photo_picker(timeout=20.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        root = dump_root()
        thumbs = find_all(root, desc="Photo taken on", substring=True)
        if len(thumbs) >= 3:
            return thumbs
        time.sleep(0.5)
    raise TimeoutError("photo picker never showed three thumbnails")


def tap_third_photo():
    thumbs = wait_for_photo_picker()

    def position(node):
        x, y = bounds_center(node.get("bounds"))
        return (y, x)

    thumbs.sort(key=position)
    tap(thumbs[2], settle=0.8)


def tap_add_button():
    tap(wait_for(text="Add (", substring=True, timeout=10), settle=1.0)


def wait_for_attached_photo(timeout=15.0):
    wait_for(desc="Remove ", substring=True, timeout=timeout)


def wait_for_file_picker(timeout=20.0):
    return wait_for(text="cat-diary.txt", timeout=timeout)


def wait_for_agent_turn(prompt, timeout=300.0):
    start = time.time()
    saw_running = False
    while time.time() - start < timeout:
        root = dump_root()
        if find(root, desc="Cancel run") is not None or find(root, text="Replying") is not None:
            saw_running = True
            break
        if time.time() - start > 6.0:
            for node in root.iter("node"):
                value = (node.get("text") or "").strip()
                if (
                    value
                    and value != prompt
                    and value not in UI_LABELS
                    and len(value) >= 30
                ):
                    saw_running = True
                    break
        if saw_running:
            break
        time.sleep(0.8)

    if not saw_running:
        return False

    quiet = 0
    while time.time() - start < timeout:
        root = dump_root()
        running = (
            find(root, desc="Cancel run") is not None
            or find(root, text="Replying") is not None
        )
        if running:
            quiet = 0
        else:
            quiet += 1
            if quiet >= 3:
                return True
        time.sleep(1.0)
    return False


def rewind_audio():
    match = re.search(r"-(\d+)$", SERIAL)
    port = int(match.group(1)) if match else 5554
    token_path = os.path.expanduser("~/.emulator_console_auth_token")
    try:
        token = open(token_path).read().strip()
    except OSError:
        token = ""

    try:
        with socket.create_connection(("127.0.0.1", port), timeout=3) as console:
            console.settimeout(1.0)
            if token:
                console.sendall(f"auth {token}\n".encode())
                time.sleep(0.1)
            console.sendall(b"avd hostmicon\n")
            time.sleep(0.2)
            console.sendall(b"avd rewindaudio\n")
            time.sleep(0.3)
    except OSError as error:
        raise RuntimeError(f"could not prepare the emulator WAV input: {error}") from error
    print("  enabled and rewound the WAV microphone input", flush=True)


def wait_for_voice_transcript(timeout=40.0):
    deadline = time.time() + timeout
    last = ""
    stable_since = None
    while time.time() < deadline:
        value = None
        for node in dump_root().iter("node"):
            candidate = (node.get("text") or "").strip()
            if not candidate or candidate in VOICE_LABELS:
                continue
            if candidate in {"›_", "/"} or re.match(r"^\d{1,2}:\d{2}$", candidate):
                continue
            if len(candidate) >= 20:
                value = candidate
                break
        if value is not None:
            if value == last:
                if stable_since is not None and time.time() - stable_since >= 1.0:
                    return value
            else:
                last = value
                stable_since = time.time()
        time.sleep(0.5)
    return last or None


def issue_instance2_code():
    if not HAROLD_ROOT or not INSTANCE2_DATA_DIR:
        raise RuntimeError("HAROLD_ROOT and INSTANCE2_DATA_DIR are required for manual pairing")
    env = os.environ.copy()
    env["HAROLD_DATA_DIR"] = INSTANCE2_DATA_DIR
    env["HAROLD_HOST"] = "127.0.0.1"
    env["HAROLD_PORT"] = INSTANCE2_PORT
    result = subprocess.run(
        [
            "bun", "run", "dev", "pair", "--no-wait", "--json", "--endpoint", "loopback",
        ],
        cwd=HAROLD_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"instance 2 pair failed: {result.stderr.strip()}")
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    if not lines:
        raise RuntimeError("instance 2 pair returned no JSON")
    payload = json.loads(lines[-1])
    code = payload.get("code")
    if not code:
        raise RuntimeError("instance 2 pair returned no code")
    return code


def voice_scene():
    mark("voice_play_start")
    rewind_audio()

    with recorded("voice_open"):
        mark("voice_open")
        tap_desc("Dictate with voice", timeout=15)
        wait_for(desc="Mute voice input", timeout=20)
        time.sleep(0.8)

    with recorded("voice_expand"):
        mark("voice_expanded")
        tap_desc("Expand voice input", timeout=10)
        wait_for(desc="Collapse voice input", timeout=10)
        time.sleep(0.8)

    transcript = None
    with recorded("voice_transcript"):
        transcript = wait_for_voice_transcript(timeout=40)
        if transcript is None:
            mark("voice_transcript_timeout")
            print("no voice transcript detected", file=sys.stderr)
        else:
            mark("voice_play_done")
            mark("voice_transcript")
            print(f"voice transcript: {transcript[:120]}", flush=True)
            time.sleep(1.0)
    if transcript is None:
        return None

    with recorded("voice_send"):
        tap_send_button()
        mark("tap_voice_send")
        time.sleep(1.0)

    with recorded("voice_reply_wait"):
        if not wait_for_agent_turn(transcript):
            mark("voice_reply_timeout")
            print("no voice reply detected in time", file=sys.stderr)
            return None

    with recorded("voice_reply"):
        time.sleep(2.5)
        mark("voice_reply_visible")
    return transcript


def warm():
    tap_text("Pair", timeout=25)
    print(f"warming camera for {WARM_SECONDS:.0f}s", flush=True)
    time.sleep(WARM_SECONDS)
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(1.5)
    return 0


def main():
    mark("driver_start")

    # ── First pairing: idle, Pair tap, scanner, identity, Work name, confirm.
    with recorded("pair_idle"):
        time.sleep(1.5)

    with recorded("pair_tap"):
        tap_text("Pair", timeout=25, settle=0)
        mark("tap_pair")
        time.sleep(0.8)

    with recorded("scanner_open"):
        wait_for(text="Pair device", timeout=30)

    with recorded("scan_wait"):
        wait_for_identity(timeout=120)
        sleep_for = 1.0
        time.sleep(sleep_for)
        mark("first_identity_visible")

    with recorded("first_name"):
        replace_edit_text(0, "Work")
        time.sleep(1.5)
        mark("first_name_typed")

    with recorded("first_confirm"):
        dismiss_keyboard()
        tap_text("Pair", timeout=10)
        wait_for_session_selector(timeout=60)
        mark("first_paired")

    with recorded("paired"):
        time.sleep(5.0)
        mark("paired_chat_visible")

    # ── Second pairing: phone only, no terminal. Issue the code immediately
    # before the scene so it is well inside its 10 minute lifetime.
    code = issue_instance2_code()
    mark("pair2_code_issued")

    with recorded("pair_another_open"):
        tap_desc("More chat options", timeout=10)
        wait_for(text="Pair", timeout=10)
        tap_text("Pair", timeout=10)
        wait_for(text="Pair device", timeout=30)
        mark("pair_another_scanner")

    with recorded("pair_another_manual"):
        tap_text("Enter manually", timeout=10)
        wait_for(text="Claim pairing code", timeout=10)
        mark("pair_another_form")

    with recorded("pair_another_details"):
        tap_edit_text(0)
        type_text(INSTANCE2_ENDPOINT)
        tap_edit_text(1)
        type_text(code)
        time.sleep(1.2)
        mark("pair_another_details_typed")

    with recorded("pair_another_claim"):
        dismiss_keyboard()
        tap_desc("Claim pairing code", timeout=10)
        wait_for_identity(timeout=30)
        mark("pair_another_identity")

    with recorded("pair_another_name"):
        replace_edit_text(0, "Couch")
        time.sleep(1.5)
        mark("pair_another_name_typed")

    with recorded("pair_another_confirm"):
        dismiss_keyboard()
        tap_text("Pair", timeout=10)
        wait_for_session_selector(timeout=60)
        mark("pair_another_paired")

    with recorded("pair_another_done"):
        time.sleep(4.0)
        mark("pair_another_done")

    # ── Session history: dropdown, full Sessions screen, pick Couch/OpenCode.
    with recorded("session_menu_open"):
        open_session_menu()

    with recorded("session_see_all"):
        tap_text("See all sessions", timeout=10, substring=True)
        wait_for(text="Sessions", timeout=15)
        wait_for(text=SESSION_TITLE, timeout=30)
        time.sleep(1.0)
        mark("sessions_screen")

    with recorded("session_pick"):
        tap_text(SESSION_TITLE, timeout=10)
        wait_for(desc="Model:", substring=True, timeout=45)
        mark("session_history_selected")

    with recorded("session_chat"):
        wait_for(text="Message", timeout=45)
        time.sleep(1.5)
        mark("session_history_chat")

    # ── Workspaces: the bookmark list and the add screen. Do not submit.
    with recorded("workspaces_open"):
        mark("workspaces_open")
        open_workspaces()
        time.sleep(1.2)

    with recorded("add_workspace_open"):
        mark("add_workspace_open")
        open_add_workspace()
        time.sleep(1.4)
    back_to_chat()

    with recorded("session_menu_reopen"):
        open_session_menu()

    # ── New session: Work + Cursor, then Couch + OpenCode.
    with recorded("new_session"):
        tap_text("New session", timeout=10, prefer="smallest")
        wait_for(text="Choose a workspace and agent to start the session.", timeout=15)
        mark("new_session_screen")

    with recorded("workspace_open_work"):
        tap_edit_text(0)
        wait_for(text="New workspace", timeout=10)
        wait_for(text="harold", timeout=10)
        time.sleep(0.8)

    with recorded("workspace_pick_work"):
        tap_text("harold", timeout=10, prefer="largest")
        time.sleep(0.6)
        mark("workspace_work")

    with recorded("agent_open_work"):
        tap_edit_text(1)
        wait_for(text="Cursor", timeout=10)
        wait_for(text="pi ACP", timeout=10)
        time.sleep(0.8)

    with recorded("agent_pick_work"):
        tap_text("Cursor", timeout=10, prefer="largest")
        time.sleep(0.6)
        mark("agent_work")

    with recorded("workspace_open_couch"):
        tap_edit_text(0)
        wait_for(text="New workspace", timeout=10)
        time.sleep(0.6)

    with recorded("workspace_pick_couch"):
        tap_text_scroll("yuekbox", timeout=15, prefer="largest")
        time.sleep(0.6)
        mark("workspace_couch")

    with recorded("agent_open_couch"):
        tap_edit_text(1)
        wait_for(text="OpenCode", timeout=10)
        time.sleep(0.8)

    with recorded("agent_pick_couch"):
        tap_text("OpenCode", timeout=10, prefer="largest")
        time.sleep(0.6)
        mark("agent_couch")

    with recorded("continue"):
        tap_text("Continue", timeout=10)
        wait_for(desc="Model:", substring=True, timeout=60)
        mark("tap_continue")

    with recorded("session_create_wait"):
        wait_for(text="Message", timeout=60)
        time.sleep(1.0)

    # ── Composer: model, mode, effort, slash commands, prompt, attachments.
    with recorded("model_open"):
        tap_desc("Model:", timeout=10, substring=True)
        wait_for(text="Search models", timeout=10)

    with recorded("model_search"):
        tap_text("Search models", timeout=5, settle=0.5)
        adb("shell", "input", "text", "deepseek")
        time.sleep(1.2)

    with recorded("model_pick"):
        tap_text(MODEL, timeout=15, settle=0.8)
        wait_until_missing("Search models", timeout=10)
        mark("model_picked")

    if chip_value("Mode:").lower() != "build":
        tap_until_value("Mode:", "Build", tries=4)
    with recorded("mode_plan"):
        mark("mode_plan")
        tap_until_value("Mode:", "Plan", tries=2)
        time.sleep(1.0)

    with recorded("mode_build"):
        tap_until_value("Mode:", "Build", tries=2)
        time.sleep(1.0)
        mark("mode_build")

    effort_node = wait_for(desc="Thinking:", substring=True)
    effort_x, effort_y = bounds_center(effort_node.get("bounds"))
    mark("effort_start")
    for step in range(1, 5):
        if chip_value("Thinking:").lower() == EFFORT_TARGET.lower():
            break
        with recorded(f"effort_{step}"):
            tap_point(effort_x, effort_y, settle=1.2)
    if chip_value("Thinking:").lower() != EFFORT_TARGET.lower():
        with recorded("effort_fix"):
            tap_until_value("Thinking:", EFFORT_TARGET, tries=4)
    mark("effort_set")

    with recorded("slash_open"):
        tap_desc("Browse commands", timeout=10)
        wait_for(text="Commands", timeout=10)
        wait_for(text="/init", timeout=10)
        time.sleep(1.0)
        mark("slash_commands_open")

    with recorded("slash_close"):
        tap_desc("Close command list", timeout=10)
        wait_for(text="Message", timeout=10)
        time.sleep(0.5)

    with recorded("prompt_focus"):
        mark("prompt_start")
        tap_text("Message", timeout=10, settle=0.8)

    with recorded("prompt_type"):
        type_text(PROMPT)
        time.sleep(2.0)
        mark("prompt_typed")

    with recorded("photo_open"):
        mark("attach_photo_start")
        tap_desc("Attach photo", timeout=10)
        wait_for_photo_picker()

    with recorded("photo_pick"):
        tap_third_photo()

    with recorded("photo_add"):
        tap_add_button()
        wait_for_attached_photo()
        mark("photo_attached")
        time.sleep(1.0)

    with recorded("file_open"):
        mark("attach_file_start")
        tap_desc("Attach files", timeout=10)
        wait_for_file_picker()

    with recorded("file_pick"):
        tap(wait_for_file_picker(), settle=1.0)
        wait_for(desc="Remove cat-diary.txt", timeout=10)
        mark("file_attached")
        time.sleep(1.0)

    with recorded("send"):
        tap_send_button()
        mark("tap_send")
        time.sleep(4.0)

    with recorded("reply_wait"):
        if not wait_for_agent_turn(PROMPT):
            mark("reply_timeout")
            print("no transcript reply detected in time", file=sys.stderr)
            return 1

    with recorded("reply"):
        time.sleep(2.5)
        mark("reply_visible")
        time.sleep(1.0)

    if voice_scene() is None:
        return 1
    time.sleep(0.5)
    mark("done")
    return 0


if __name__ == "__main__":
    if "--warm" in sys.argv:
        sys.exit(warm())
    sys.exit(main())
