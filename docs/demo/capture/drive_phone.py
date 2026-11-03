#!/usr/bin/env python3
"""Drive the Harold Android app through the demo flow.

Assumes the app was just cleared and is showing the unpaired screen. The back
camera plays the composed QR clip, so the first Harold pairs by camera.

The story starts from the paired chat. The driver opens the session menu, starts
a new session on the cat-screensaver feature worktree, plans the feature in Plan
mode with the spec and a cat photo attached, answers the agent's question,
builds, reviews the branch diff and worktrees, and asks for a draft PR.

The walk is recorded as named slices: one screenrecord file per action, from
the tap through the wait for the UI to settle. Remotion schedules the slices.

`--warm` is a manual camera warm-up for debugging. Do not point a warm scan at
a live pairing QR; codes are single-use.
"""
import json
import os
import re
import shlex
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from contextlib import contextmanager

SERIAL = os.environ.get("SERIAL", "emulator-5554")
MARKS = os.environ.get("MARKS", "marks.log")
SLICES = os.environ.get("SLICES", "slices.json")
WARM_SECONDS = float(os.environ.get("WARM_SECONDS", "25"))
MENU_READY_TITLE = os.environ.get("MENU_READY_TITLE", "Does KGB use cats?")
HAROLD_ROOT = os.environ.get("HAROLD_ROOT")
INSTANCE1_WORKSPACES = os.environ.get(
    "INSTANCE1_WORKSPACES", os.path.expanduser("~/harold-demo-workspaces/3847")
)
CAT_SCREENSAVER_WORKTREE = os.environ.get(
    "CAT_SCREENSAVER_WORKTREE",
    os.path.expanduser("~/cat-screensaver-worktrees/cat-mode"),
)
DEMO_REPO = os.environ.get("DEMO_REPO", "codenamegary/cat-screensaver")
SKIP_RECORD = os.environ.get("SKIP_RECORD") == "1"
START = time.monotonic()

PLAN_PROMPT = (
    "Read the attached spec and the photo of Mia. Plan only; do not edit files. "
    "Plan a small cat mode for this screensaver. Do not build yet. Use your "
    "question tool exactly once, for one question only: should cat mode be a "
    "settings toggle or automatic? The options must be exactly Settings toggle "
    "and Automatic. Do not ask about anything else."
)
PLAN_NUDGE = (
    "Use your question tool exactly once, for one question only: should cat "
    "mode be a settings toggle or automatic? The options must be exactly "
    "Settings toggle and Automatic. Do not ask about anything else."
)
BUILD_PROMPT = (
    "Settings toggle. Implement only the plan now. Put the toggle in "
    "src/settings.js, put the cat behavior in src/cat-mode.js, add tests, and "
    "commit every change on feat/cat-mode so the worktree is clean. Do not add "
    "unrelated features and do not open a PR."
)
PR_PROMPT = (
    "Push feat/cat-mode and open a draft PR against main with gh. End with "
    "the PR URL."
)


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


def chip_text(prefix, timeout=15.0):
    node = wait_for(desc=prefix, substring=True, timeout=timeout)
    return node.get("content-desc") or ""


def select_deepseek_model():
    current = chip_text("Model:")
    if "deepseek" in current.lower() and "flash" in current.lower():
        print(f"  model already {current}", flush=True)
        return
    print(f"  switching model from {current}", flush=True)
    mark("model_select_start")
    tap_desc("Model:", timeout=10, substring=True)
    wait_for(text="Search models", timeout=10)
    tap_text("Search models", timeout=5, settle=0.5)
    type_text("deepseek")
    time.sleep(1.2)
    tap_text("DeepSeek V4.1 Flash", timeout=15, substring=True, settle=0.8)
    wait_until_missing("Search models", timeout=10)
    selected = chip_text("Model:")
    if "deepseek" not in selected.lower() or "flash" not in selected.lower():
        raise RuntimeError(f"model did not switch to deepseek flash (got {selected!r})")
    print(f"  model selected: {selected}", flush=True)
    mark("model_select_done")


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
    # that is never the header title so the history beat does not land on a
    # loading state.
    wait_for(text=MENU_READY_TITLE, timeout=30)


def back_to_chat(tries=5):
    for _ in range(tries):
        root = dump_root()
        if find(root, desc="More chat options") is not None:
            return
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
        time.sleep(0.8)
    raise TimeoutError("could not return to the chat screen")


def tap_send_button():
    tap(wait_for(desc="Send message", timeout=10), settle=0.5)


def composer_text():
    nodes = edit_text_nodes()
    if not nodes:
        return ""
    return (nodes[0].get("text") or "").strip()


def submit_composer(timeout=20.0):
    """Tap Send until the composer clears or a turn starts."""
    for attempt in range(3):
        tap_send_button()
        deadline = time.time() + 5
        while time.time() < deadline:
            if not composer_text():
                return
            if find(dump_root(), desc="Cancel run") is not None:
                return
            time.sleep(0.5)
        print(f"  send did not take (attempt {attempt + 1}); retrying", flush=True)
        mark("send_retry")
        time.sleep(1.0)
    raise RuntimeError("the composer did not submit after three tries")


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
    return wait_for(text="cat-mode.md", timeout=timeout)


# --- Agent turn state --------------------------------------------------------


def has_question(root):
    return find(root, text="Answer") is not None


def has_permission(root):
    for node in root.iter("node"):
        if "Permission required for" in (node.get("text") or ""):
            return True
    return False


def is_running(root):
    if find(root, desc="Cancel run") is not None:
        return True
    for label in (
        "Replying",
        "Thinking",
        "Working",
        "Waiting for answer",
        "Waiting for permission",
    ):
        if find(root, text=label) is not None:
            return True
    return False


def turn_state(root):
    """Return question, permission, running, or idle. Question wins."""
    if has_question(root):
        return "question"
    if has_permission(root):
        return "permission"
    if is_running(root):
        return "running"
    return "idle"


def answer_permission(root):
    nodes = find_all(root, desc="Permission option:", substring=True)
    if not nodes:
        return False
    tap(nodes[0], settle=0.3)
    return True


def wait_for_turn(timeout=300.0):
    """Wait for a turn to settle. Permission requests are answered silently."""
    start = time.time()
    saw_running = False
    quiet = 0
    while time.time() - start < timeout:
        root = dump_root()
        state = turn_state(root)
        if state == "question":
            return "question"
        if state == "permission":
            if not answer_permission(root):
                raise RuntimeError("permission panel has no permission option")
            mark("permission_answered")
            saw_running = True
            quiet = 0
            time.sleep(0.8)
            continue
        if state == "running":
            saw_running = True
            quiet = 0
        else:
            quiet += 1
            if saw_running and quiet >= 3:
                return "idle"
            # A fast turn can finish before the cancel button paints. Give it
            # a short grace before accepting idle.
            if not saw_running and quiet >= 4:
                return "idle"
        time.sleep(1.0)
    raise TimeoutError("agent turn did not settle")


def wait_for_usage(timeout=20.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        for node in dump_root().iter("node"):
            value = (node.get("text") or "").strip()
            if re.search(r"\([0-9]+%\)", value) and "$" in value:
                return value
        time.sleep(0.5)
    raise TimeoutError("context usage line never appeared")


def scroll_chat_to_bottom(max_swipes=12):
    for _ in range(max_swipes):
        root = dump_root()
        if find(root, text="Jump to latest") is None:
            return
        scrolled = False
        for node in root.iter("node"):
            if node.get("scrollable") != "true":
                continue
            bounds = node.get("bounds") or ""
            match = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds)
            if match is None:
                continue
            x1, y1, x2, y2 = (int(value) for value in match.groups())
            x = (x1 + x2) // 2
            adb(
                "shell", "input", "swipe",
                str(x), str(y1 + int((y2 - y1) * 0.8)),
                str(x), str(y1 + int((y2 - y1) * 0.2)),
                "220",
            )
            scrolled = True
            break
        if not scrolled:
            return
        time.sleep(0.5)


def find_pr_url(root):
    for node in root.iter("node"):
        for key in ("text", "content-desc"):
            value = node.get(key) or ""
            match = re.search(r"https://github\.com/[^\s]*/pull/[0-9]+", value)
            if match:
                return match.group(0)
    joined = " ".join(
        (node.get("text") or "") + " " + (node.get("content-desc") or "")
        for node in root.iter("node")
    )
    match = re.search(r"https://github\.com/[^\s]*/pull/[0-9]+", joined)
    return match.group(0) if match else None


def wait_for_pr_url(timeout=30.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        url = find_pr_url(dump_root())
        if url is not None:
            return url
        scroll_chat_to_bottom(max_swipes=1)
        time.sleep(0.5)
    raise TimeoutError("the PR URL never appeared in the chat")


def verify_remote_pr():
    result = subprocess.run(
        [
            "gh", "pr", "list", "--repo", DEMO_REPO,
            "--head", "feat/cat-mode", "--state", "open",
            "--json", "number,isDraft,url",
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"gh pr list failed: {result.stderr.strip()}")
    pull_requests = json.loads(result.stdout or "[]")
    drafts = [pull for pull in pull_requests if pull.get("isDraft")]
    if not drafts:
        raise RuntimeError(f"no open draft PR for feat/cat-mode: {pull_requests}")
    print(f"  draft PR: {drafts[0]['url']}", flush=True)
    return drafts[0]["url"]


def nudge_for_question():
    print("  no question card after the plan; sending the nudge", flush=True)
    mark("plan_nudge")
    tap_edit_text(0, settle=0.6)
    type_text(PLAN_NUDGE)
    time.sleep(0.8)
    submit_composer()


def git_status():
    if not CAT_SCREENSAVER_WORKTREE:
        return ""
    result = subprocess.run(
        ["git", "-C", CAT_SCREENSAVER_WORKTREE, "status", "--porcelain"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"git status failed: {result.stderr.strip()}")
    return result.stdout.strip()


def reset_plan_edits():
    if not CAT_SCREENSAVER_WORKTREE:
        return
    dirty = git_status()
    if not dirty:
        return
    print(f"  plan turn left changes; resetting:\n{dirty}", flush=True)
    mark("plan_edits_reset")
    subprocess.run(
        ["git", "-C", CAT_SCREENSAVER_WORKTREE, "reset", "--hard", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    subprocess.run(
        ["git", "-C", CAT_SCREENSAVER_WORKTREE, "clean", "-fd"],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )


def verify_build_commit():
    if not CAT_SCREENSAVER_WORKTREE:
        return
    branch = subprocess.run(
        ["git", "-C", CAT_SCREENSAVER_WORKTREE, "rev-parse", "--abbrev-ref", "HEAD"],
        capture_output=True,
        text=True,
        timeout=30,
    ).stdout.strip()
    if branch != "feat/cat-mode":
        raise RuntimeError(f"the build is on {branch!r}, not feat/cat-mode")
    count = subprocess.run(
        ["git", "-C", CAT_SCREENSAVER_WORKTREE, "rev-list", "--count", "origin/main..HEAD"],
        capture_output=True,
        text=True,
        timeout=30,
    ).stdout.strip()
    if not count.isdigit() or int(count) < 1:
        raise RuntimeError("the build did not commit on feat/cat-mode")
    dirty = git_status()
    if dirty:
        raise RuntimeError(f"the build left uncommitted changes:\n{dirty}")
    print(f"  build committed {count} change(s) on feat/cat-mode", flush=True)


def question_count(root):
    for node in root.iter("node"):
        match = re.search(r"Question 1 of (\d+)", node.get("text") or "")
        if match:
            return int(match.group(1))
    return 1


def open_changes():
    tap_desc("Changes", timeout=15, substring=True)
    wait_for(text="No uncommitted changes", timeout=30)


def open_worktrees():
    tap_text("Worktree", timeout=15)
    wait_for(text="feat/cat-mode", timeout=15)
    wait_for(text="main", timeout=15)


def close_worktrees():
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(1.0)


def leave_changes():
    tap_desc("Go back from changes", timeout=10)
    wait_for_chat(timeout=30)


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
        time.sleep(1.0)
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

    # ── Session menu, then New session on the cat-screensaver worktree.
    with recorded("session_menu_open"):
        open_session_menu()
        time.sleep(1.2)
        mark("session_history_visible")

    with recorded("new_session"):
        tap_text("New session", timeout=10, prefer="smallest")
        wait_for(text="Choose a workspace and agent to start the session.", timeout=15)
        mark("new_session_screen")

    with recorded("workspace_open"):
        tap_edit_text(0)
        wait_for(text="New workspace", timeout=10)
        wait_for(text="cat-screensaver", timeout=15)
        wait_for(text=CAT_SCREENSAVER_WORKTREE, timeout=15)
        time.sleep(0.8)

    with recorded("workspace_pick"):
        tap_text("cat-screensaver", timeout=10, prefer="largest")
        wait_for(text="OpenCode", timeout=15)
        time.sleep(0.6)
        mark("workspace_picked")

    with recorded("continue"):
        tap_text("Continue", timeout=10)
        wait_for(desc="Model:", substring=True, timeout=60)
        mark("tap_continue")

    with recorded("session_create_wait"):
        wait_for(text="Message", timeout=60)
        time.sleep(1.0)

    # Pin the new session to DeepSeek Flash. This happens before the story
    # recording starts; the model picker is not a scene in the cut.
    select_deepseek_model()

    # ── Plan: switch to Plan, type the prompt, attach the spec and photo.
    with recorded("mode_plan"):
        mark("mode_plan")
        tap_until_value("Mode:", "Plan", tries=3)
        time.sleep(1.0)

    with recorded("prompt_focus"):
        mark("prompt_start")
        tap_text("Message", timeout=10, settle=0.8)

    with recorded("prompt_type"):
        type_text(PLAN_PROMPT)
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
        wait_for(desc="Remove cat-mode.md", timeout=10)
        mark("file_attached")
        time.sleep(1.0)

    with recorded("send"):
        submit_composer()
        mark("tap_send")
        time.sleep(4.0)

    with recorded("plan_wait"):
        state = wait_for_turn()
        if state == "idle":
            nudge_for_question()
            state = wait_for_turn()
        if state != "question":
            raise RuntimeError(f"plan turn ended as {state!r} without a question card")
        mark("question_asked")

    with recorded("plan_reply"):
        time.sleep(3.0)
        if not has_question(dump_root()):
            raise RuntimeError("the question card disappeared before plan_reply")
        mark("plan_reply_visible")

    with recorded("elicitation_open"):
        tap_text("Answer", timeout=10)
        wait_for(text="Decline", timeout=10)
        if question_count(dump_root()) != 1:
            raise RuntimeError("the agent asked more than one question")
        mark("elicitation_sheet_open")

    with recorded("elicitation_pick"):
        tap_text("Settings toggle", timeout=10, substring=True)
        time.sleep(0.8)
        mark("settings_toggle_picked")

    with recorded("elicitation_submit"):
        for _ in range(4):
            if find(dump_root(), text="Submit") is not None:
                break
            tap_text("Next", timeout=5)
            time.sleep(0.6)
        tap_text("Submit", timeout=10)
        if wait_for_turn() != "idle":
            raise RuntimeError("the agent asked another question after submit")
        mark("answer_submitted")

    reset_plan_edits()

    # ── Build: switch to Build and send the implementation prompt.
    with recorded("mode_build"):
        mark("mode_build")
        tap_until_value("Mode:", "Build", tries=3)
        time.sleep(1.0)

    with recorded("build_prompt"):
        tap_text("Message", timeout=10, settle=0.8)
        type_text(BUILD_PROMPT)
        time.sleep(2.0)
        mark("build_prompt_typed")

    with recorded("build_send"):
        submit_composer()
        mark("tap_build_send")
        time.sleep(3.0)

    with recorded("build_wait"):
        state = wait_for_turn()
        if state != "idle":
            raise RuntimeError(f"build turn ended as {state!r}")
        verify_build_commit()
        mark("build_finished")

    with recorded("build_reply"):
        time.sleep(3.0)
        mark("build_reply_visible")

    with recorded("usage"):
        usage = wait_for_usage()
        print(f"  usage line: {usage}", flush=True)
        mark("usage_visible")
        time.sleep(3.0)

    # ── Changes: clean uncommitted view, branch review, settings diff.
    with recorded("changes_open"):
        open_changes()
        mark("changes_clean")

    with recorded("changes_branch"):
        tap_text("Against main", timeout=10, substring=True)
        wait_for(text="settings.js", timeout=20)
        mark("branch_scope")

    with recorded("changes_file"):
        tap_text("settings.js", timeout=10, substring=True)
        wait_for(text="Branch changes", timeout=20)
        time.sleep(1.0)
        if find(dump_root(), text="catMode", substring=True) is None:
            raise RuntimeError("the settings diff does not show catMode")
        mark("settings_diff_visible")

    with recorded("changes_back"):
        tap_desc("Go back to changes", timeout=10)
        wait_for(text="settings.js", timeout=15)
        mark("changes_list_again")

    with recorded("worktrees_open"):
        open_worktrees()
        mark("worktree_sheet_open")

    with recorded("worktrees_close"):
        close_worktrees()
        mark("worktree_sheet_closed")

    leave_changes()

    # ── PR: ask for a draft PR and hold on the URL in the reply.
    with recorded("pr_prompt"):
        tap_text("Message", timeout=10, settle=0.8)
        mark("pr_prompt_focus")

    with recorded("pr_send"):
        type_text(PR_PROMPT)
        time.sleep(1.5)
        submit_composer()
        mark("tap_pr_send")
        time.sleep(3.0)

    with recorded("pr_wait"):
        state = wait_for_turn()
        if state != "idle":
            raise RuntimeError(f"PR turn ended as {state!r}")
        mark("pr_finished")

    scroll_chat_to_bottom()

    with recorded("pr_reply"):
        url = wait_for_pr_url(timeout=30)
        print(f"  PR URL in chat: {url}", flush=True)
        mark("pr_url_visible")
        verify_remote_pr()
        time.sleep(3.0)

    time.sleep(0.5)
    mark("done")
    return 0


if __name__ == "__main__":
    if "--warm" in sys.argv:
        sys.exit(warm())
    sys.exit(main())
