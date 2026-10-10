#!/usr/bin/env python3
"""Drive the Harold Android app through the README demo flow (v2).

Assumes the app was just cleared (unpaired) and is showing the Shell screen,
and that the pairing QR is already on the virtual-scene poster.
Taps are located through UIAutomator dumps, never hard-coded.
"""
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

SERIAL = os.environ.get("SERIAL", "emulator-5554")
PROMPT = os.environ.get("PROMPT", "Summarize this repo in one sentence")
MODEL = os.environ.get("MODEL", "deepseek/DeepSeek V4.1 Flash")
EFFORT_TARGET = os.environ.get("EFFORT_TARGET", "High")
MARKS = os.environ.get("MARKS", "/tmp/opencode/media/marks.log")
START = time.time()


def mark(name):
    with open(MARKS, "a") as handle:
        handle.write(f"{name} {time.time():.3f}\n")
    print(f"[{time.time() - START:6.1f}s] {name}", flush=True)


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


def wait_for_transcript_reply(prompt, timeout=120.0):
    """Wait until a text node beyond our prompt looks like a reply."""
    ui_labels = {
        "New session", "Select session", "Disconnect from server", "Message",
        "Chat with an agent", "GENERAL", "provider/model", "mode", "AGENT",
        "Thinking", "Stop", "Harold",
    }
    deadline = time.time() + timeout
    while time.time() < deadline:
        root = dump_root()
        for node in root.iter("node"):
            value = (node.get("text") or "").strip()
            if not value or value == prompt or value in ui_labels:
                continue
            if len(value) > 100 and not value.startswith(("3 tool calls", "tool calls")):
                return value
        time.sleep(1.0)
    return None


def main():
    mark("driver_start")

    tap_text("Pair", timeout=25)
    mark("tap_pair")

    wait_for(text="New session", timeout=30)
    mark("paired_chat_visible")
    time.sleep(1.2)

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

    # The session is created on Continue; its config options seed the composer.
    await_desc("Model:", timeout=25)
    mark("config_visible")
    time.sleep(0.8)

    # Model: open the sheet and pick.
    tap_desc("Model:", timeout=10, substring=True)
    wait_for(text="Search models", timeout=10)
    mark("model_sheet_open")
    time.sleep(0.9)
    tap_text(MODEL, timeout=10, settle=0.8)
    deadline = time.time() + 8
    while time.time() < deadline and find(dump_root(), text="Search models") is not None:
        time.sleep(0.4)
    mark("model_picked")

    # Mode: Build -> Plan -> Build (show the cycle, end on Build).
    mode_node = await_desc("Mode:")
    mode_x, mode_y = bounds_center(mode_node.get("bounds"))
    adb("shell", "input", "tap", str(mode_x), str(mode_y))
    time.sleep(1.6)
    mark("mode_plan")
    adb("shell", "input", "tap", str(mode_x), str(mode_y))
    time.sleep(1.2)
    if "Build" not in chip_value("Mode:"):
        tap_until_value("Mode:", "Build", tries=3)
    mark("mode_build")

    # Effort: for the demo model, three steps from Default land on High.
    effort_node = await_desc("Thinking:")
    effort_x, effort_y = bounds_center(effort_node.get("bounds"))
    for _ in range(3):
        adb("shell", "input", "tap", str(effort_x), str(effort_y))
        time.sleep(1.3)
    if chip_value("Thinking:") != EFFORT_TARGET:
        tap_until_value("Thinking:", EFFORT_TARGET, tries=4)
    mark("effort_set")
    time.sleep(0.8)

    # Prompt.
    tap_text("Message", timeout=10, settle=0.8)
    adb("shell", "input", "text", PROMPT.replace(" ", "%s"))
    time.sleep(1.2)
    mark("prompt_typed")
    tap_send_button()
    mark("tap_send")

    reply = wait_for_transcript_reply(PROMPT)
    if reply is None:
        mark("reply_timeout")
        print("no transcript reply detected in time", file=sys.stderr)
        return 1
    mark("reply_visible")
    print(f"reply: {reply[:120]}")
    time.sleep(2.5)
    mark("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
