#!/usr/bin/env python3
"""Drive the Harold Android app through the demo flow.

Assumes the app was just cleared (unpaired) and is showing the Shell screen.
The back camera shows the composed QR clip, so pairing is a plain scan.
Taps are located through UIAutomator dumps, never hard-coded.

`--warm` taps Pair and waits for the video camera to produce its first
frames (the first open after an emulator boot takes about 20 seconds), then
backs out. Run it before recording so the recording starts clean.

The walk is recorded in segments: screenrecord runs only while something is
happening on screen. `rec_start`/`rec_stop` bracket every scene, and the pure
waits (the scanner decoding the QR, sessions loading, the agent streaming a
reply) happen with recording off. stitch_segments.py concatenates the
segments afterwards and remaps the marks onto the stitched timeline.

The recorded run shows session history, creates a new session, changes the
model/mode/effort, drafts a prompt with a photo and file attachment, sends
it, then opens voice input and plays `voice-input.wav` into the emulator's
virtual microphone.
"""
import os
import re
import shlex
import socket
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

SERIAL = os.environ.get("SERIAL", "emulator-5554")
PROMPT = os.environ.get("PROMPT", "Do you think my cat's behaviour is strange?")
MODEL = os.environ.get("MODEL", "deepseek/DeepSeek V4.1 Flash")
EFFORT_TARGET = os.environ.get("EFFORT_TARGET", "High")
MARKS = os.environ.get("MARKS", "marks.log")
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


# --- Segmented recording -----------------------------------------------------
#
# screenrecord only runs while something is happening on screen. Every
# rec_start/rec_end pair is marked with its wall time so stitch_segments.py
# can map the other marks onto the stitched video: a segment is anchored to
# its rec_end (SIGINT finalization is near-instant), so it covers
# [rec_end - duration, rec_end] of wall time.

_rec_index = 0
_recording = False


def rec_start():
    """Start a screenrecord segment. No-op while one is already running."""
    global _rec_index, _recording
    if _recording:
        return
    _rec_index += 1
    name = f"{_rec_index:03d}"
    mark(f"rec_start_{name}")
    subprocess.Popen(
        [
            "adb", "-s", SERIAL, "shell", "screenrecord",
            "--bit-rate", "12000000", "--time-limit", "300",
            f"/sdcard/harold-demo-{name}.mp4",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    _recording = True
    # The encoder needs a beat before frames land; keep this dead zone clear
    # of interactions so nothing is clipped off the head of the segment.
    time.sleep(0.8)


def rec_stop():
    """Finalize the current segment. No-op if recording is already off."""
    global _recording
    if not _recording:
        return
    name = f"{_rec_index:03d}"
    mark(f"rec_end_{name}")
    adb("shell", "pkill", "-INT", "screenrecord")
    # Give screenrecord a moment to write the moov atom.
    time.sleep(1.2)
    _recording = False


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
    raise TimeoutError(f"not found text={text!r} desc={desc!r} substring={substring}")


def tap(node, settle=0.6):
    x, y = bounds_center(node.get("bounds"))
    adb("shell", "input", "tap", str(x), str(y))
    print(f"  tap at {x},{y} ({node.get('text') or node.get('content-desc') or 'row'!r})")
    if settle:
        time.sleep(settle)


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
        adb("shell", "input", "tap", str(x), str(y))
        time.sleep(settle)
    raise TimeoutError(f"{prefix!r} never reached {target!r} (last: {chip_value(prefix)!r})")


def type_text(text):
    """Type into the focused field, quoting the apostrophe for the device shell."""
    escaped = shlex.quote(text.replace(" ", "%s"))
    adb("shell", "input", "text", escaped)


def select_agent(name):
    row_names = ("Cursor", "OpenCode", "pi ACP")
    root = dump_root()
    current = next((text for text in row_names if find(root, text=text) is not None), None)
    if current is None:
        raise TimeoutError("no agent row found")
    if current != name:
        tap_text(current, timeout=8)
        time.sleep(0.6)
    tap_text(name, timeout=8)
    time.sleep(0.6)


def open_session_menu():
    tap(wait_for(desc="Select session:", substring=True, timeout=15))
    wait_for(text="New session", timeout=10)


def tap_first_recent_session(timeout=15.0):
    """Tap the most recent session row in the open session dropdown."""
    open_session_menu()
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


def pick_model(model, timeout=15.0):
    tap(wait_for(desc="Model:", substring=True, timeout=10))
    wait_for(text="Search models", timeout=10)
    tap_text("Search models", timeout=5, settle=0.5)
    adb("shell", "input", "text", "deepseek")
    time.sleep(1.2)
    tap_text(model, timeout=timeout, settle=0.8)
    deadline = time.time() + 10
    while time.time() < deadline and find(dump_root(), text="Search models") is not None:
        time.sleep(0.4)


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
    mark("voice_open")
    tap_desc("Dictate with voice", timeout=15)
    wait_for(text="Start speaking…", timeout=15)
    wait_for(desc="Mute voice input", timeout=20)
    time.sleep(0.8)

    mark("voice_expanded")
    tap_desc("Expand voice input", timeout=10)
    wait_for(desc="Collapse voice input", timeout=10)
    time.sleep(0.8)

    transcript = wait_for_voice_transcript(timeout=40)
    if transcript is None:
        mark("voice_transcript_timeout")
        print("no voice transcript detected", file=sys.stderr)
        rec_start()
        return None
    mark("voice_play_done")
    mark("voice_transcript")
    print(f"voice transcript: {transcript[:120]}", flush=True)
    time.sleep(1.0)

    tap_send_button()
    mark("tap_voice_send")
    time.sleep(1.0)
    # The reply streams for a while; that wait never needs to be on camera.
    rec_stop()
    if not wait_for_agent_turn(transcript):
        mark("voice_reply_timeout")
        print("no voice reply detected in time", file=sys.stderr)
        rec_start()
        return None
    rec_start()
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

    # ── Launch and pair. The scan's decode wait is the longest dead stretch
    # in the walk: record the scanner opening, then go off-camera until the
    # feed reaches the live QR and pairing lands.
    rec_start()
    tap_text("Pair", timeout=25, settle=0)
    mark("tap_pair")
    time.sleep(2.5)
    rec_stop()
    wait_for(desc="Select session:", substring=True, timeout=90)

    # ── Paired home settles, then session history: dropdown, rows, pick.
    rec_start()
    time.sleep(1.0)
    mark("paired_chat_visible")

    # Session history: open the header dropdown and pick the most recent row.
    tap_first_recent_session()
    time.sleep(1.5)
    # The session keeps loading behind the composer; finish that off-camera.
    rec_stop()
    wait_for_chat()

    rec_start()
    time.sleep(0.8)
    mark("session_history_selected")
    rec_stop()

    # ── New session from the same dropdown, then the whole create form.
    rec_start()
    mark("session_menu_open")
    open_session_menu()
    tap_text("New session", timeout=10)
    mark("tap_new_session")

    # Create screen: workspace -> harold, agent -> OpenCode, Continue.
    wait_for(text="Continue", timeout=15)
    root = dump_root()
    if find(root, text="sites") is not None:
        tap_text("sites", timeout=8)
        time.sleep(0.6)
    tap_text("harold", timeout=8)
    time.sleep(0.6)
    select_agent("OpenCode")
    mark("agent_selected")
    tap_text("Continue", timeout=10)
    mark("tap_continue")
    time.sleep(0.8)
    # Creating the session is a spinner; keep only the beat, not the wait.
    rec_stop()
    await_desc("Model:", timeout=25)

    # ── Composer: model, mode, effort, prompt, attachments, send. One long
    # segment - it is all interaction, with the script's pauses left intact.
    rec_start()
    time.sleep(0.8)
    mark("config_visible")

    # Model: open the sheet, search, and pick.
    pick_model(MODEL)
    mark("model_picked")

    # Mode: Build -> Plan -> Build (show the cycle, end on Build). The mark
    # lands on the tap so the caption leads the visible flip; the sleep only
    # holds Plan on screen before tapping back.
    mode_node = await_desc("Mode:")
    mode_x, mode_y = bounds_center(mode_node.get("bounds"))
    adb("shell", "input", "tap", str(mode_x), str(mode_y))
    mark("mode_plan")
    time.sleep(2.0)
    adb("shell", "input", "tap", str(mode_x), str(mode_y))
    time.sleep(2.0)
    if "Build" not in chip_value("Mode:"):
        tap_until_value("Mode:", "Build", tries=3)
    mark("mode_build")

    # Effort: for the demo model, three steps from Default land on High.
    # effort_start marks the first tap; effort_set fires once the target
    # value is confirmed, so captions key off the former.
    effort_node = await_desc("Thinking:")
    effort_x, effort_y = bounds_center(effort_node.get("bounds"))
    mark("effort_start")
    for _ in range(3):
        adb("shell", "input", "tap", str(effort_x), str(effort_y))
        time.sleep(1.2)
    if chip_value("Thinking:") != EFFORT_TARGET:
        tap_until_value("Thinking:", EFFORT_TARGET, tries=4)
    mark("effort_set")
    time.sleep(0.8)

    # Prompt. prompt_start marks the tap on the field; typing leaves it drafted.
    mark("prompt_start")
    tap_text("Message", timeout=10, settle=0.8)
    type_text(PROMPT)
    time.sleep(2.0)
    mark("prompt_typed")

    # Photo attachment: third thumbnail, then Add (1).
    mark("attach_photo_start")
    tap_desc("Attach photo", timeout=10)
    tap_third_photo()
    tap_add_button()
    wait_for_attached_photo()
    mark("photo_attached")
    time.sleep(1.0)

    # File attachment: cat-diary.txt from Recent files.
    mark("attach_file_start")
    tap_desc("Attach files", timeout=10)
    tap(wait_for_file_picker(), settle=1.0)
    wait_for(desc="Remove cat-diary.txt", timeout=10)
    mark("file_attached")
    time.sleep(1.0)

    tap_send_button()
    mark("tap_send")
    # Show "Thinking" and the first streamed lines, then cut the rest of the
    # stream and land on the finished reply.
    time.sleep(4.0)
    rec_stop()
    if not wait_for_agent_turn(PROMPT):
        mark("reply_timeout")
        print("no transcript reply detected in time", file=sys.stderr)
        rec_start()
        return 1
    rec_start()
    time.sleep(2.5)
    mark("reply_visible")
    time.sleep(1.0)

    if voice_scene() is None:
        return 1
    time.sleep(1.5)
    rec_stop()
    time.sleep(0.5)
    mark("done")
    return 0


if __name__ == "__main__":
    if "--warm" in sys.argv:
        sys.exit(warm())
    sys.exit(main())
