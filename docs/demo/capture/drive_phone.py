#!/usr/bin/env python3
"""Drive the Harold Android app through the demo flow.

Assumes the app was just cleared (unpaired) and is showing the Shell screen.
The back camera shows the composed QR clip, so pairing is a plain scan.
Taps are located through UIAutomator dumps, never hard-coded.

`--warm` is a manual camera warm-up for debugging. capture.sh does not use
it: the recorded scanner slices include the first-open startup and Remotion
trims it. Do not point a warm scan at a live pairing QR; codes are single-use.

The walk is recorded as named slices: one screenrecord file per action, from
the tap through the wait for the UI to settle. The slice manifest and the tap
marks let build_capture.py write capture.json, and Remotion schedules the
slices. There is no stitched video, so changing the pace only changes the
Remotion timeline.

The recorded run shows session history, creates a new session, changes the
model/mode/effort, drafts a prompt with a photo and file attachment, sends
it, then opens voice input and plays `voice-input.wav` into the emulator's
virtual microphone.
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
# Marks are durations, not wall-clock dates. A monotonic clock keeps them
# ordered even if the host clock is adjusted during the walk.
START = time.monotonic()

UI_LABELS = {
    "New session",
    "Select session",
    "Disconnect from server",
    "Message",
    "Chat with an agent",
    "GENERAL",
    "provider/model",
    "mode",
    "AGENT",
    "Thinking",
    "Stop",
    "Harold",
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
#
# One screenrecord file per action: the tap, the wait for the UI to settle,
# and nothing else. build_capture.py turns the files plus the tap marks into
# capture.json, and Remotion schedules the slices. Timing changes happen in
# Remotion, so there is no stitched video and no re-capture for a new pace.

_slice_index = 0
_current_slice = None
_slices = []


def write_manifest():
    with open(SLICES, "w") as handle:
        json.dump(_slices, handle, indent=2)
        handle.write("\n")


def slice_start(name):
    """Start a named screenrecord slice and let the encoder settle."""
    global _slice_index, _current_slice
    if _current_slice is not None:
        raise RuntimeError(f"slice {_current_slice['name']} is still recording")
    _slice_index += 1
    filename = f"{_slice_index:03d}-{name}.mp4"
    started = time.monotonic()
    mark(f"slice_start_{name}")
    subprocess.Popen(
        [
            "adb", "-s", SERIAL, "shell", "screenrecord",
            "--bit-rate", "12000000", "--time-limit", "300",
            f"/data/local/tmp/harold-demo-{filename}",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    _current_slice = {
        "index": _slice_index,
        "name": name,
        "file": filename,
        "started": started,
    }
    # The encoder needs a beat before frames land; keep this dead zone clear
    # of interactions so nothing is clipped off the head of the slice.
    time.sleep(0.8)


def slice_stop():
    """Finalize the current slice. No-op if no slice is open."""
    global _current_slice
    if _current_slice is None:
        return
    current = _current_slice
    current["ended"] = time.monotonic()
    mark(f"slice_end_{current['name']}")
    adb("shell", "pkill", "-INT", "screenrecord")
    # Give screenrecord a moment to write the moov atom.
    time.sleep(1.2)
    _current_slice = None
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


def tap_text(text, timeout=20.0, settle=0.6):
    tap(wait_for(text=text, timeout=timeout), settle=settle)


def tap_desc(desc, timeout=20.0, settle=0.6, substring=False):
    tap(wait_for(desc=desc, substring=substring, timeout=timeout), settle=settle)


def tap_send_button():
    tap(wait_for(desc="Send message", timeout=10), settle=0.5)


def await_desc(desc, timeout=20.0, substring=True):
    return wait_for(desc=desc, substring=substring, timeout=timeout)


def chip_value(prefix, timeout=15.0):
    """Reads the current value out of a 'Prefix: Value. ...' content description."""
    node = await_desc(prefix, timeout=timeout)
    text = node.get("content-desc") or ""
    after = text.split(":", 1)[1] if ":" in text else text
    return after.split(".")[0].strip()


def tap_until_value(prefix, target, tries=6, settle=1.4):
    """Taps the chip until its current value equals the target."""
    for _ in range(tries):
        if chip_value(prefix).lower() == target.lower():
            return True
        node = await_desc(prefix)
        x, y = bounds_center(node.get("bounds"))
        tap_point(x, y, settle)
    raise TimeoutError(f"{prefix!r} never reached {target!r} (last: {chip_value(prefix)!r})")


def type_text(text):
    """Type into the focused field, quoting the apostrophe for the device shell."""
    escaped = shlex.quote(text.replace(" ", "%s"))
    adb("shell", "input", "text", escaped)


def current_agent_name():
    row_names = ("Cursor", "OpenCode", "pi ACP")
    root = dump_root()
    current = next((text for text in row_names if find(root, text=text) is not None), None)
    if current is None:
        raise TimeoutError("no agent row found")
    return current


def open_session_menu():
    tap(wait_for(desc="Select session:", substring=True, timeout=15))
    wait_for(text="New session", timeout=10)


def tap_first_recent_row(timeout=15.0):
    """Tap the most recent session row in the open session dropdown."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        root = dump_root()
        new_session = find(root, text="New session")
        see_all = find(root, text="See all sessions…")
        if new_session is not None and see_all is not None:
            new_y = bounds_center(new_session.get("bounds"))[1]
            see_y = bounds_center(see_all.get("bounds"))[1]
            rows = []
            for node in root.iter("node"):
                value = (node.get("text") or "").strip()
                if not value or value in {"New session", "Loading…", "See all sessions…"}:
                    continue
                center = bounds_center(node.get("bounds"))
                if center and new_y < center[1] < see_y:
                    rows.append((center[1], center[0], node))
            if rows:
                rows.sort(key=lambda row: (row[0], row[1]))
                tap(rows[0][2])
                return
        time.sleep(0.5)
    raise TimeoutError("no recent sessions in the session dropdown")


def wait_for_chat(timeout=20.0):
    wait_for(desc="Model:", substring=True, timeout=timeout)
    wait_for(text="Message", timeout=timeout)


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
    """Wait for the agent run to start and then stay finished for a beat."""
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

    # The composer can briefly stop showing its cancel button between tool
    # calls, so require a few quiet polls before calling the turn done.
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
    """Enable the emulator microphone and restart the WAV input from sample 0."""
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
            # The windowed emulator starts with the host mic gated off even
            # with -allow-host-audio. Turn it on before the stream opens.
            console.sendall(b"avd hostmicon\n")
            time.sleep(0.2)
            console.sendall(b"avd rewindaudio\n")
            time.sleep(0.3)
    except OSError as error:
        raise RuntimeError(f"could not prepare the emulator WAV input: {error}") from error
    print("  enabled and rewound the WAV microphone input", flush=True)


def wait_for_voice_transcript(timeout=40.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        for node in dump_root().iter("node"):
            value = (node.get("text") or "").strip()
            if not value or value in VOICE_LABELS:
                continue
            if value in {"›_", "/"} or re.match(r"^\d{1,2}:\d{2}$", value):
                continue
            return value
        time.sleep(0.5)
    return None


def voice_scene():
    # Restart the WAV before opening voice mode. The lead-in silence in the
    # converted file covers the UI transition and Vosk model warmup.
    mark("voice_play_start")
    rewind_audio()

    with recorded("voice_open"):
        mark("voice_open")
        tap_desc("Dictate with voice", timeout=15)
        wait_for(text="Start speaking…", timeout=15)
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
    """Open the camera once so the first-hit video warmup is out of the way."""
    tap_text("Pair", timeout=25)
    print(f"warming camera for {WARM_SECONDS:.0f}s", flush=True)
    time.sleep(WARM_SECONDS)
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(1.5)
    return 0


def main():
    mark("driver_start")

    # ── Pairing: idle screen, Pair tap, scan wait, paired home. Each slice is
    # one action, so Remotion can trim or stretch the beats independently.
    with recorded("pair_idle"):
        time.sleep(1.5)

    with recorded("pair_tap"):
        tap_text("Pair", timeout=25, settle=0)
        mark("tap_pair")
        time.sleep(0.8)

    # CameraX retries its camera validation for about ten seconds on the
    # emulator. Keep that startup in its own slice so the scan slice starts
    # with the scanner already on screen.
    with recorded("scanner_open"):
        wait_for(text="Pair device", timeout=30)

    with recorded("scan_wait"):
        wait_for(desc="Select session:", substring=True, timeout=120)

    with recorded("paired"):
        time.sleep(5.0)
        mark("paired_chat_visible")

    # ── Session history: open the dropdown, pick the newest row, let the chat
    # load, then open the menu again for a new session.
    with recorded("session_menu_open"):
        open_session_menu()

    with recorded("session_pick"):
        tap_first_recent_row()
        time.sleep(0.8)

    with recorded("session_chat"):
        wait_for_chat(timeout=45)
        time.sleep(1.5)
        mark("session_history_selected")

    with recorded("session_menu_reopen"):
        mark("session_menu_open")
        open_session_menu()

    with recorded("new_session"):
        tap_text("New session", timeout=10)
        mark("tap_new_session")
        wait_for(text="Continue", timeout=15)

    # ── Create screen: workspace -> harold, agent -> OpenCode, Continue.
    root = dump_root()
    if find(root, text="sites") is not None:
        with recorded("workspace_sites"):
            tap_text("sites", timeout=8)
            time.sleep(0.6)

    with recorded("workspace_harold"):
        tap_text("harold", timeout=8)
        time.sleep(0.6)

    current_agent = current_agent_name()
    with recorded("agent_open"):
        tap_text(current_agent, timeout=8)
        wait_for(text="OpenCode", timeout=10)

    with recorded("agent_pick"):
        tap_text("OpenCode", timeout=8)
        time.sleep(0.6)
        mark("agent_selected")

    with recorded("continue"):
        tap_text("Continue", timeout=10)
        mark("tap_continue")
        time.sleep(0.8)

    with recorded("session_create_wait"):
        await_desc("Model:", timeout=60)

    # ── Composer: model, mode, effort, prompt, attachments.
    with recorded("model_open"):
        tap(wait_for(desc="Model:", substring=True, timeout=10))
        wait_for(text="Search models", timeout=10)

    with recorded("model_search"):
        tap_text("Search models", timeout=5, settle=0.5)
        adb("shell", "input", "text", "deepseek")
        time.sleep(1.2)

    with recorded("model_pick"):
        tap_text(MODEL, timeout=15, settle=0.8)
        deadline = time.time() + 10
        while time.time() < deadline and find(dump_root(), text="Search models") is not None:
            time.sleep(0.4)
        mark("model_picked")

    mode_node = await_desc("Mode:")
    mode_x, mode_y = bounds_center(mode_node.get("bounds"))
    with recorded("mode_plan"):
        mark("mode_plan")
        tap_point(mode_x, mode_y, settle=2.0)

    with recorded("mode_build"):
        tap_point(mode_x, mode_y, settle=2.0)
        if "Build" not in chip_value("Mode:"):
            tap_until_value("Mode:", "Build", tries=3)
        mark("mode_build")

    effort_node = await_desc("Thinking:")
    effort_x, effort_y = bounds_center(effort_node.get("bounds"))
    mark("effort_start")
    for step in range(1, 4):
        with recorded(f"effort_{step}"):
            tap_point(effort_x, effort_y, settle=1.2)
    if chip_value("Thinking:") != EFFORT_TARGET:
        with recorded("effort_fix"):
            tap_until_value("Thinking:", EFFORT_TARGET, tries=4)
    mark("effort_set")

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
