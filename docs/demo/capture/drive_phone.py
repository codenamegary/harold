#!/usr/bin/env python3
"""Drive the Harold Android app through the SSH demo, keys-only.

The app starts cleared, with no connections. The driver adds the fake SSH
host that capture.sh started, leaves the authentication control on
`Generate key`, reads the public key out of the UIAutomator dump, authorises
that exact key on the fixture, and connects. It then starts a new session on
the cat-screensaver worktree and works one feature from plan to draft PR
against the scripted ACP agent.

The walk is recorded as named slices: one screenrecord file per action, from a
sleep/wake calibration blink through the wait for the UI to settle. Remotion
schedules the slices.

Every mark is append-only with time.monotonic() at 3 dp, in marks.log:

    tap <mono> <x> <y>    one per injected tap (build_capture.py:50 grammar)
    key <mono>            one per injected character
    sync_wake <mono>      sampled just before the WAKEUP keyevent of a blink;
                          every slice writes exactly two rows, the head blink
                          at slice_start and the tail blink at slice_stop
    <name> <mono>         mark() rows: slice_start_<slice>, slice_end_<slice>,
                          keys_done, ...

The tail blink is the frozen-tail defence: screenrecord's encoded timeline
runs 6-9% behind the driver clock under sustained UI-change load on this
emulator, and the two blinks let build_capture.py measure that rate per
slice, map events through it, and cut the published tail at the tail blink.
See capture/README.md for the measured constraint.

Typing is character by character: each character writes its `key` mark, is
injected with its own `input text` call, and then waits KEY_GAP_SEC. The
recorded key timestamps are the ground truth for the on-screen cadence.

Run with `--only <slice[,slice]>` to re-record individual slices: the walk
still drives the app to reach them, records nothing else, and exits once the
requested slices are done. Run with `--self-test` to test the typing escape
helper without a device.
"""
import json
import math
import os
import re
import shlex
import statistics
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from contextlib import contextmanager

SERIAL = os.environ.get("SERIAL", "emulator-5554")
MARKS = os.environ.get("MARKS", "marks.log")
SLICES = os.environ.get("SLICES", "slices.json")
SSH_HOST = os.environ.get("SSH_HOST", "127.0.0.1")
SSH_PORT = os.environ.get("SSH_PORT", "2223")
SSH_USER = os.environ.get("SSH_USER", "gary")
SSH_HOST_NAME = os.environ.get("SSH_HOST_NAME", "Demo host")
HOST_CONTAINER = os.environ.get("HOST_CONTAINER", "harold-demo-host")
WORKTREE = os.environ.get("WORKTREE", "/home/gary/sites/cat-screensaver-worktrees/cat-mode")
SKIP_RECORD = os.environ.get("SKIP_RECORD") == "1"
START = time.monotonic()

# --- Typing cadence ----------------------------------------------------------
#
# Plan §3.2 fixes the gap at 0.03 s. One `input text` round trip per character
# costs more than that on this pipeline, so the achieved interval is
# adb latency + KEY_GAP_SEC. The floor keeps a future edit (or a stray env
# override) from collapsing the cadence into an unmeasurable burst.
KEY_GAP_SEC_PLAN = 0.03
KEY_GAP_FLOOR_SEC = 0.02
KEY_GAP_SEC = max(
    float(os.environ.get("KEY_GAP_SEC", str(KEY_GAP_SEC_PLAN))),
    KEY_GAP_FLOOR_SEC,
)
if KEY_GAP_SEC < KEY_GAP_FLOOR_SEC:
    raise SystemExit("drive_phone.py: KEY_GAP_SEC is below the enforced floor")

# --- Slice sync rhythm -------------------------------------------------------
#
# The screen goes off for SYNC_BLACK_HOLD_SEC, wakes, and only then the slice's
# first action runs. ffmpeg blackdetect finds this run in the raw file; the
# plan's sync math uses its end as the video clock, so the mark is sampled
# before KEYCODE_WAKEUP and does not wait for the keyguard.
#
# The hold is 1.2 s rather than the plan's 0.35 s to keep margin on the
# two-stage screen-off animation: the app window blanks first and SystemUI
# follows about 0.3 s later, so true black (YAVG ~16.2) only appears once both
# are gone. Measured on this emulator: a 0.35 s hold still caught a 0.59 s black
# run, and 1.2 s catches ~1.33 s. The extra time is trimmed off the head, so
# published durations are unaffected.
#
# What actually broke the smoke test was not the hold. The `Copy public key`
# tap used to raise the system clipboard overlay, and that overlay stays lit
# while the display sleeps: the frame measures YAVG ~21.6 with more than 2% of
# its pixels above black, so blackdetect with pic_th=0.98 finds no run at any
# hold length. It failed three recorded slices in a row, and the cause was
# proven by recording the same blink twice: with the overlay fresh, no black
# run; after it expired, exactly one run from 1.311 s to 2.645 s. The copy tap
# is gone, so the blink is clean.
SYNC_BLACK_HOLD_SEC = 1.2
SYNC_WAKE_SETTLE_SEC = 0.6

# A raw window this long cannot be trusted even with the two-blink drift
# correction: at the measured 6-9% timeline slowdown the published beat
# distorts and the drift-rate band in build_capture.py would reject it.
# slice_stop hard-fails past the cap so the beat gets split at the driver
# level, never trimmed by hand.
MAX_RAW_SLICE_SEC = 150.0

# The authenticated screen must never be reached by a password. `tap()` refuses
# these labels outright, whichever helper asks.
FORBIDDEN_TAP_LABELS = {"password", "import key", "import"}

PUBLIC_KEY_HINT = "Append this line to ~/.ssh/authorized_keys"
PUBLIC_KEY_RE = re.compile(
    r"ssh-ed25519\s+[A-Za-z0-9+/]{32,}={0,3}(?:\s+[A-Za-z0-9._@:+-]+)?"
)

PLAN_PROMPT = (
    "Read the attached spec and the photo of Mia. Plan only; do not edit files. "
    "Plan a small cat mode for this screensaver. Do not build yet. Use your "
    "question tool exactly once, for one question only: should cat mode be a "
    "settings toggle or automatic? The options must be exactly Settings toggle "
    "and Automatic. Do not ask about anything else."
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

# Storyboard order (plan §1). The index of a name here is its `NNN` prefix, so
# a single slice re-recorded with --only lands on the same file name as it
# would in a full run.
SLICE_ORDER = [
    "connect_form",
    "connect_key",
    "connect_fill",
    "connect_test",
    "connect_trust",
    "connected",
    "session_menu",
    "new_session",
    "workspace_open",
    "workspace_pick",
    "agent_open",
    "agent_pick",
    "start_session",
    "session_ready",
    "mode_plan",
    "prompt_focus",
    "prompt_type",
    "photo_open",
    "photo_pick",
    "photo_add",
    "file_open",
    "file_pick",
    "send",
    "plan_wait",
    "plan_reply",
    "elicitation_open",
    "elicitation_pick",
    "elicitation_submit",
    "mode_build",
    "build_prompt",
    "build_send",
    "build_wait",
    "build_reply",
    "usage",
    "changes_open",
    "changes_branch",
    "changes_file",
    "changes_back",
    "worktrees_open",
    "worktrees_close",
    "pr_prompt",
    "pr_send",
    "pr_wait",
    "pr_reply",
]

USAGE_TEXT = """
usage: drive_phone.py [--only <slice[,slice]>] [--self-test]

  --only   record only these slices; the walk still drives the app to reach
           them and exits as soon as they are done
  --self-test
           run the typing escape helper tests and exit

slices:
  {slices}
""".format(slices=(", ".join(SLICE_ORDER)))


# --- Marks -------------------------------------------------------------------


def _append(line):
    with open(MARKS, "a") as handle:
        handle.write(line + "\n")


def mark(name):
    now = time.monotonic()
    _append(f"{name} {now:.3f}")
    print(f"[{now - START:6.1f}s] {name}", flush=True)


# --- Typing ------------------------------------------------------------------


def escape_input_chunk(piece):
    """Return one argv token for `adb shell input text` carrying `piece` as-is.

    Single quotes are the only quoting the device shell does not expand, so
    $, `, *, ?, ;, &, |, (, ), <, >, quotes and history characters all pass
    through untouched. A literal apostrophe closes the quote, escapes itself,
    and opens a new quote.
    """
    return "'" + piece.replace("'", "'\\''") + "'"


def input_text_tokens(text):
    """Split a demo string into one `input text` token per character.

    `%s` is the only escape `input text` understands, so a space becomes `%s`
    (still quoted, so the device shell cannot touch it).
    """
    return [escape_input_chunk("%s" if char == " " else char) for char in text]


def _sh_roundtrip(token):
    """Send one token through a POSIX shell and return what the shell produced."""
    result = subprocess.run(
        ["/bin/sh", "-c", "printf '%s' " + token],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout


def self_test():
    cases = [
        SSH_HOST_NAME,
        SSH_USER,
        SSH_PORT,
        SSH_HOST,
        "Plan only; do not edit files.",
        "Mia's cat (plan): don't build? $HOME ~/x *y* & z|w #4 \"q\" [b] {c} 100%",
        "UPPER lower 0123 a-b_c/d.e@f:g+h=i,j",
    ]
    for case in cases:
        tokens = input_text_tokens(case)
        assert len(tokens) == len(case), (case, tokens)
        for char, token in zip(case, tokens):
            expected = "%s" if char == " " else char
            actual = _sh_roundtrip(token)
            assert actual == expected, (case, char, token, actual)
    for char in (" ", "'", '"', "$", "`", "*", "?", ";", "&", "|", "(", ")", "\\", "%"):
        token = input_text_tokens(char)[0]
        assert len(token) >= 3, token
    assert input_text_tokens("") == []
    print(
        f"self-test: escaping OK for {len(cases)} strings, one token per "
        f"character, KEY_GAP_SEC={KEY_GAP_SEC:.3f}s (floor {KEY_GAP_FLOOR_SEC:.3f}s)"
    )


def _report_typing(field, stamps):
    count = len(stamps)
    if count < 2:
        print(f"  typed {field} {count} chars 0.0 cps", flush=True)
        return
    intervals = [later - earlier for earlier, later in zip(stamps, stamps[1:])]
    ordered = sorted(intervals)
    p95 = ordered[min(len(ordered) - 1, math.ceil(0.95 * len(ordered)) - 1)]
    median = statistics.median(intervals)
    elapsed = stamps[-1] - stamps[0]
    cps = (count - 1) / elapsed if elapsed > 0 else 0.0
    print(
        f"  typed {field} {count} chars {cps:.1f} cps "
        f"(key interval median {median:.3f}s p95 {p95:.3f}s)",
        flush=True,
    )


def type_text(text, field="text"):
    """Inject `text` one character at a time, marking each before it goes out."""
    stamps = []
    for token in input_text_tokens(text):
        now = time.monotonic()
        _append(f"key {now:.3f}")
        stamps.append(now)
        adb("shell", "input", "text", token)
        time.sleep(KEY_GAP_SEC)
    mark("keys_done")
    _report_typing(field, stamps)


# --- Slice recording ---------------------------------------------------------

ONLY = []
_current_slice = None
_recorded_slices = []
_recorded_names = set()


class RecordingComplete(Exception):
    def __init__(self, name):
        super().__init__(name)
        self.name = name


def slice_number(name):
    try:
        return SLICE_ORDER.index(name) + 1
    except ValueError:
        raise RuntimeError(f"unknown slice {name!r}; see SLICE_ORDER") from None


def should_record(name):
    return not ONLY or name in ONLY


def write_manifest():
    with open(SLICES, "w") as handle:
        json.dump(_recorded_slices, handle, indent=2)
        handle.write("\n")


def power_state():
    output = adb("shell", "dumpsys", "power").stdout
    for line in output.splitlines():
        line = line.strip()
        if line.startswith("mWakefulness="):
            return line.split("=", 1)[1].strip()
    return ""


def wait_power_state(wanted, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if power_state() in wanted:
            return
        time.sleep(0.1)
    raise RuntimeError(
        f"the emulator never reached power state {'/'.join(wanted)} "
        f"(stuck at {power_state()!r}); the sync blink cannot be trusted"
    )


def sync_mark():
    """Record the calibration blink's clock, then put the app back on screen."""
    sync_wake = time.monotonic()
    adb("shell", "input", "keyevent", "KEYCODE_SLEEP")
    wait_power_state(("Asleep", "Dozing"))
    time.sleep(SYNC_BLACK_HOLD_SEC)
    adb("shell", "input", "keyevent", "KEYCODE_WAKEUP")
    wait_power_state(("Awake",))
    adb("shell", "wm", "dismiss-keyguard")
    time.sleep(SYNC_WAKE_SETTLE_SEC)
    _append(f"sync_wake {sync_wake:.3f}")
    print(
        f"  sync_wake {sync_wake - START:6.1f}s "
        f"(black hold {SYNC_BLACK_HOLD_SEC:.2f}s)",
        flush=True,
    )


def slice_start(name):
    global _current_slice
    if _current_slice is not None:
        raise RuntimeError(f"slice {_current_slice['name']} is still recording")
    index = slice_number(name)
    mark(f"slice_start_{name}")
    if SKIP_RECORD:
        _current_slice = {
            "index": index,
            "name": name,
            "file": "",
            "started": time.monotonic(),
        }
        return
    filename = f"{index:03d}-{name}.mp4"
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
    sync_mark()
    _current_slice = {
        "index": index,
        "name": name,
        "file": filename,
        "remote": remote,
        "started": started,
    }


def slice_stop():
    global _current_slice
    if _current_slice is None:
        return
    current = _current_slice
    mark(f"slice_end_{current['name']}")
    if not SKIP_RECORD:
        # Tail blink. The same sleep/wake as the head blink, inside the same
        # recording: the two sync_wake rows let build_capture.py measure how
        # far the encoder timeline fell behind the driver clock, map events
        # through that rate, and cut the published tail at this blink, so no
        # slice can publish a dead or stale tail (capture/README.md).
        sync_mark()
        current["ended"] = time.monotonic()
        adb("shell", "pkill", "-INT", "screenrecord")
        for _ in range(20):
            running = adb("shell", "pidof", "screenrecord").stdout.strip()
            if not running:
                break
            time.sleep(0.2)
        time.sleep(0.5)
        window = current["ended"] - current["started"]
        if window > MAX_RAW_SLICE_SEC:
            raise RuntimeError(
                f"slice {current['name']} recorded for {window:.1f}s, above the "
                f"{MAX_RAW_SLICE_SEC:.0f}s cap; split the beat into shorter "
                f"slices at the driver level (see capture/README.md)"
            )
    else:
        current["ended"] = time.monotonic()
    _current_slice = None
    if not SKIP_RECORD:
        _recorded_slices.append(current)
        _recorded_names.add(current["name"])
        write_manifest()


def discard_last_recording():
    """Drop the slice that just stopped, so a retry can record it again.

    The raw file is deleted on the device and the manifest entry removed: a
    failed verification must never leave a known-bad take in the manifest.
    """
    if not _recorded_slices:
        return
    entry = _recorded_slices.pop()
    _recorded_names.discard(entry["name"])
    write_manifest()
    adb("shell", "rm", "-f", f"/data/local/tmp/harold-demo-{entry['file']}")


def finish_only_if_done(name):
    if ONLY and set(ONLY) <= _recorded_names:
        raise RecordingComplete(name)


@contextmanager
def recorded(name):
    if not should_record(name):
        yield
        return
    slice_start(name)
    try:
        yield
    finally:
        slice_stop()
    finish_only_if_done(name)


def mark_tap(x, y):
    if _current_slice is None:
        return
    _append(f"tap {time.monotonic():.3f} {x} {y}")


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


def find_label(root, label):
    """The first node whose text or content-desc equals `label`.

    Tested with `is None` on purpose: an ElementTree element with no children
    is falsy, so `find(text=...) or find(desc=...)` silently discarded every
    leaf label (Compose renders segment labels as childless TextViews).
    """
    node = find(root, text=label)
    if node is None:
        node = find(root, desc=label)
    return node


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


def node_label(node):
    return (node.get("text") or node.get("content-desc") or "").strip()


def tap(node, settle=0.6):
    label = node_label(node)
    if label.lower() in FORBIDDEN_TAP_LABELS:
        raise RuntimeError(f"refusing to tap the {label!r} auth segment")
    x, y = bounds_center(node.get("bounds"))
    tap_point(x, y, settle, label or "row")


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


def swipe_up():
    adb("shell", "input", "swipe", "540", "1900", "540", "800", "300")
    time.sleep(0.7)


def scroll_to_top(times=4):
    for _ in range(times):
        adb("shell", "input", "swipe", "540", "800", "540", "1900", "260")
        time.sleep(0.4)


def ensure_text(text, timeout=10.0, max_swipes=6, substring=False):
    for _ in range(max_swipes):
        node = find(dump_root(), text=text, substring=substring)
        if node is not None:
            return node
        swipe_up()
        time.sleep(0.3)
    return wait_for(text=text, substring=substring, timeout=timeout)


def ensure_tappable(text, timeout=10.0, max_swipes=8, substring=False):
    """Scroll until the text node sits inside the safe touch area."""
    for _ in range(max_swipes):
        node = find(dump_root(), text=text, substring=substring)
        if node is not None:
            center = bounds_center(node.get("bounds"))
            if center is not None and 220 <= center[1] <= 2050:
                return node
        swipe_up()
        time.sleep(0.3)
    node = wait_for(text=text, substring=substring, timeout=timeout)
    center = bounds_center(node.get("bounds"))
    if center is not None and center[1] > 2050:
        adb("shell", "input", "swipe", "540", "1900", "540", "1200", "280")
        time.sleep(0.6)
        node = wait_for(text=text, substring=substring, timeout=timeout)
    return node


def edit_text_nodes():
    return [
        node
        for node in dump_root().iter("node")
        if node.get("class") == "android.widget.EditText"
    ]


def clear_edit_text():
    keys = ["KEYCODE_MOVE_END"] + ["KEYCODE_DEL"] * 40
    adb("shell", "input", "keyevent", *keys)
    time.sleep(0.3)


def plan_connect_fields():
    """Resolve the four connection-field tap points before any recording.

    One UIAutomator dump, keyboard closed. The recorded window then replays
    fixed coordinates only: uiautomator dumps are multi-second CPU spikes, and
    keeping them out of recorded windows is the first structural defence
    against the screenrecord drift (capture/README.md).
    """
    scroll_to_top()
    nodes = edit_text_nodes()
    if len(nodes) < 4:
        raise TimeoutError(
            f"expected the 4 connection fields, found {len(nodes)} edit texts"
        )
    fields = [
        (bounds_center(nodes[1].get("bounds")), SSH_HOST, "host"),
        (bounds_center(nodes[2].get("bounds")), SSH_USER, "user"),
        (bounds_center(nodes[3].get("bounds")), SSH_PORT, "port"),
        (bounds_center(nodes[0].get("bounds")), SSH_HOST_NAME, "name"),
    ]
    for point, _, _ in fields:
        if point is None:
            raise RuntimeError("a connection field node has no usable bounds")
    return fields


def fill_connect_fields(fields):
    """Type every field from fixed coordinates: no dumps, no layout queries.

    The form is scrolled back to its top before every tap, so the layout under
    the planned coordinates is the exact state `plan_connect_fields` dumped:
    opening and dismissing the IME shifts the rows, and without the reset the
    later taps land on whatever moved into the old coordinates.
    """
    for (x, y), value, field_name in fields:
        scroll_to_top()
        tap_point(x, y, settle=0.4)
        clear_edit_text()
        type_text(value, field=field_name)
        dismiss_keyboard()


def verify_connect_fields(fields):
    """One dump after the window: every field must hold its expected text.

    The form is scrolled back to its top first, the same state the fields were
    planned in. Off-screen rows can drop out of a UIAutomator dump entirely,
    so a dump at any other scroll position is not comparable. Node order in
    the dump is [name, host, user, port]; `fields` is planned in fill order
    [host, user, port, name]. Returns (verified, actual texts).
    """
    scroll_to_top()
    expected = [None] * 4
    for node_index, field in zip((1, 2, 3, 0), fields):
        expected[node_index] = field[1]
    nodes = edit_text_nodes()
    actual = [(node.get("text") or "").strip() for node in nodes[:4]]
    if len(nodes) < 4:
        return False, actual
    return actual == expected, actual


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


def chip_value(prefix, timeout=15.0):
    text = chip_text(prefix, timeout=timeout)
    after = text.split(":", 1)[1] if ":" in text else text
    return after.split(".")[0].strip()


def tap_until_value(prefix, target, tries=6, settle=1.2):
    for _ in range(tries):
        if chip_value(prefix).lower() == target.lower():
            return True
        node = wait_for(desc=prefix, substring=True)
        x, y = bounds_center(node.get("bounds"))
        tap_point(x, y, settle)
    raise TimeoutError(f"{prefix!r} never reached {target!r} (last: {chip_value(prefix)!r})")


def wait_for_chat(timeout=60.0, require_config=True):
    if require_config:
        wait_for(desc="Model:", substring=True, timeout=timeout)
        wait_for(text="Message", timeout=timeout)
    else:
        wait_for(text="Chat with an agent", timeout=timeout)


def wait_for_session_selector(timeout=60.0):
    wait_for(desc="Select session:", substring=True, timeout=timeout)


def open_session_menu():
    last_error = None
    for _ in range(3):
        tap(wait_for(desc="Select session:", substring=True, timeout=15))
        try:
            wait_for(text="See all sessions", substring=True, timeout=6)
            last_error = None
            break
        except TimeoutError as error:
            last_error = error
            time.sleep(0.5)
    if last_error is not None:
        raise last_error
    wait_for(text="Does KGB use cats?", timeout=45)


def tap_send_button():
    tap(wait_for(desc="Send message", timeout=10), settle=0.5)


def composer_text():
    nodes = edit_text_nodes()
    if not nodes:
        return ""
    return (nodes[0].get("text") or "").strip()


def submit_composer(timeout=20.0):
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


def wait_for_photo_picker(timeout=25.0):
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


def wait_for_file_picker(timeout=25.0):
    return wait_for(text="cat-mode.md", timeout=timeout)


# --- Keys-only connect -------------------------------------------------------


def reset_authorized_keys():
    result = subprocess.run(
        ["docker", "exec", HOST_CONTAINER, "reset-authorized-keys"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"reset-authorized-keys failed: {result.stderr.strip()}")
    print(f"  {result.stdout.strip()}", flush=True)


_authorized_keys_reset = False


def add_authorized_key(key):
    """Clear the key set once per run, then authorise exactly `key`."""
    global _authorized_keys_reset
    if not _authorized_keys_reset:
        reset_authorized_keys()
        _authorized_keys_reset = True
    result = subprocess.run(
        ["docker", "exec", "-i", HOST_CONTAINER, "add-authorized-key"],
        input=key + "\n",
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"add-authorized-key failed for {key!r}: {result.stderr.strip()}"
        )
    print(f"  {result.stdout.strip()} -> {key[:32]}…", flush=True)


def dump_public_key():
    """Read the generated public key out of the live UIAutomator dump.

    The Generate body renders the key in a SelectionContainer, so the dump
    carries the whole string even when the box ellipsises. There is no
    testTagsAsResourceId in the app, so the `ssh_public_key` tag never reaches
    UIAutomator: match the text.
    """
    dump_root()
    xml = adb("exec-out", "cat", "/sdcard/uidump.xml").stdout
    match = PUBLIC_KEY_RE.search(xml)
    if match is None:
        raise RuntimeError(
            "no ssh-ed25519 public key in the UIAutomator dump; the Generate key "
            "body is not on screen"
        )
    return match.group(0).strip()


def segment_checked(root, label):
    """Whether the auth segment labelled `label` is the checked one.

    Compose reports segment selection as `checked=true` on the checkable
    container that wraps the label, never as `selected=true`, so the label's
    ancestors are walked to the nearest checkable node. Returns None when the
    label is not on screen.
    """
    node = find_label(root, label)
    if node is None:
        return None
    parents = {child: parent for parent in root.iter() for child in parent}
    current = node
    while current is not None:
        if current.get("checkable") == "true":
            return current.get("checked") == "true"
        current = parents.get(current)
    return False


def assert_generate_mode(root):
    """Fail unless the Authentication control sits on Generate key."""
    if segment_checked(root, "Password") is True:
        raise RuntimeError(
            "the Password auth segment is selected; this capture is keys-only"
        )
    generate = find_label(root, "Generate key")
    if generate is None:
        generate = find_label(root, "Generate")
    if generate is None:
        raise RuntimeError("the Generate key segment is not on screen")
    if segment_checked(root, "Generate key") is not True:
        raise RuntimeError(
            "the Generate key segment is not selected; this capture is keys-only"
        )
    if find_label(root, "Public key") is None:
        raise RuntimeError("the Public key box is not on screen")
    return generate


def prepare_connect():
    """Walk to the form and authorise the generated key before any recording."""
    wait_for(text="Add connection", timeout=90)
    tap_text("Add connection", timeout=15, settle=0.8)
    wait_for(text="SSH host", timeout=20)
    wait_for(text="Connection", timeout=15)
    ensure_text(PUBLIC_KEY_HINT, timeout=20, max_swipes=8, substring=True)
    assert_generate_mode(dump_root())
    add_authorized_key(dump_public_key())
    mark("key_authorized")
    scroll_to_top()


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
        "Session running…",
    ):
        if find(root, text=label) is not None:
            return True
    return False


def turn_state(root):
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
            if not saw_running and quiet >= 4:
                return "idle"
        time.sleep(1.0)
    raise TimeoutError("agent turn did not settle")


def wait_for_usage(timeout=25.0):
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


def host_exec(command):
    return subprocess.run(
        ["docker", "exec", "-u", "gary", HOST_CONTAINER, "bash", "-lc", command],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )


def verify_build_state():
    branch = host_exec(f"git -C {shlex.quote(WORKTREE)} rev-parse --abbrev-ref HEAD").stdout.strip()
    if branch != "feat/cat-mode":
        raise RuntimeError(f"the build is on {branch!r}, not feat/cat-mode")
    count = host_exec(
        f"git -C {shlex.quote(WORKTREE)} rev-list --count main..HEAD"
    ).stdout.strip()
    if not count.isdigit() or int(count) < 1:
        raise RuntimeError("the build did not commit on feat/cat-mode")
    dirty = host_exec(f"git -C {shlex.quote(WORKTREE)} status --porcelain").stdout.strip()
    if dirty:
        raise RuntimeError(f"the build left uncommitted changes:\n{dirty}")
    print(f"  build committed {count} change(s) on feat/cat-mode", flush=True)


def verify_pr_state():
    pr = host_exec("cat \"$HOME/.harold-demo/pull-request.json\"")
    if pr.returncode != 0 or '"draft":true' not in pr.stdout:
        raise RuntimeError(f"no fake draft PR recorded: {pr.stdout} {pr.stderr}")


def answer_question():
    root = dump_root()
    if not has_question(root):
        raise RuntimeError("the question card is missing")
    tap_text("Answer", timeout=10)
    wait_for(text="Settings toggle", timeout=10)
    if find(dump_root(), text="Question 1 of") is not None:
        raise RuntimeError("the agent asked more than one question")


def open_changes():
    tap_desc("Changes", timeout=15, substring=True)
    wait_for(text="No uncommitted changes", timeout=30)


def open_worktrees():
    tap(wait_for(desc="Switch worktree", substring=True, timeout=15))
    wait_for(text="feat/cat-mode", timeout=15)
    wait_for(text="main", timeout=15)


def close_worktrees():
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(1.0)


def leave_changes():
    tap_desc("Go back from changes", timeout=10)
    wait_for_chat(timeout=30)


def run_walk():
    # ── Connect: the form, the generated key, the fields, test, trust, chat.
    #    Nothing is recorded before connect_form: the Add-connection tap and the
    #    key authorisation happen in this pre-roll.
    prepare_connect()

    with recorded("connect_form"):
        scroll_to_top(times=2)
        # At the very top of the form the Authentication segments sit just
        # below the fold (the header lands at y=2206 in a 2337-tall viewport).
        # One scroll keeps the Connection rows on screen and brings the
        # `Generate key` segment and the Public key box up with them, which is
        # the frame the beat needs: form rows plus Generate key lit.
        ensure_tappable("Generate key", timeout=10)
        assert_generate_mode(dump_root())
        mark("auth_mode_generate")
        time.sleep(1.6)

    with recorded("connect_key"):
        ensure_text(PUBLIC_KEY_HINT, timeout=10, max_swipes=4, substring=True)
        add_authorized_key(dump_public_key())
        mark("public_key_authorized")
        # No `Copy public key` tap here on purpose. The beat only needs the
        # public key box and the authorized_keys hint on screen, and the system
        # clipboard overlay the tap raises survives into the next slice's sync
        # blink, where it hides the calibration black run (see
        # SYNC_BLACK_HOLD_SEC). Copying also covered the form with a chip for
        # the rest of the connect act.
        time.sleep(2.0)

    # One dump per attempt plans all four taps; the window itself is pure
    # input (scroll, tap, clear, per-character typing, keyboard back), and
    # the verification dump happens after it. On a mismatch the whole slice
    # is re-recorded, so a known-bad take never reaches the manifest.
    actual = []
    for attempt in range(1, 3):
        connect_fields = plan_connect_fields()
        slice_start("connect_fill")
        try:
            fill_connect_fields(connect_fields)
            mark("host_fields_filled")
            # The scroll keeps the beat's last frames moving toward the
            # `Test connection` button the next slice taps.
            swipe_up()
        finally:
            slice_stop()
        verified, actual = verify_connect_fields(connect_fields)
        if verified:
            break
        print(
            f"  connect_fill attempt {attempt} did not verify; "
            f"fields hold {actual}",
            flush=True,
        )
        mark("connect_fill_retry")
        discard_last_recording()
    else:
        raise RuntimeError(
            f"could not enter the connection fields (last: {actual})"
        )
    finish_only_if_done("connect_fill")

    with recorded("connect_test"):
        tap(ensure_tappable("Test connection", timeout=10), settle=0)
        wait_for(text="Host key fingerprint", timeout=60)
        ensure_text("SHA256:", timeout=10, max_swipes=4, substring=True)
        mark("fingerprint_visible")
        time.sleep(2.0)

    with recorded("connect_trust"):
        tap(ensure_tappable("I trust this host key", timeout=10), settle=0.5)
        tap(ensure_tappable("Save SSH host", timeout=10), settle=0)
        wait_for_session_selector(timeout=90)
        mark("host_saved")

    with recorded("connected"):
        wait_for_chat(timeout=60, require_config=False)
        mark("chat_visible")
        time.sleep(3.0)

    # ── Session menu, then New session on the cat-screensaver worktree.
    with recorded("session_menu"):
        open_session_menu()
        mark("session_history_visible")
        time.sleep(1.2)

    with recorded("new_session"):
        tap(wait_for(text="New session", timeout=10), settle=0.8)
        wait_for(text="Start Session", timeout=15)
        mark("new_session_screen")

    with recorded("workspace_open"):
        tap_text("moonlit-garden", timeout=15)
        wait_for(text="cat-screensaver", timeout=15)
        time.sleep(0.8)

    with recorded("workspace_pick"):
        tap_text("cat-screensaver", timeout=10, prefer="largest")
        mark("workspace_picked")
        time.sleep(1.2)

    with recorded("agent_open"):
        tap_text("Claude Agent", timeout=20)
        wait_for(text="OpenCode", timeout=15)
        time.sleep(0.8)

    with recorded("agent_pick"):
        tap_text("OpenCode", timeout=10)
        mark("agent_picked")
        time.sleep(0.8)

    with recorded("start_session"):
        tap_text("Start Session", timeout=10, settle=0)
        mark("tap_start_session")
        time.sleep(1.0)

    with recorded("session_ready"):
        wait_for_chat(timeout=90)
        wait_for(text="New session", timeout=30)
        time.sleep(1.0)

    # ── Plan: switch to Plan, type the prompt, attach the spec and photo.
    with recorded("mode_plan"):
        mark("mode_plan")
        wait_for(desc="Mode:", substring=True, timeout=30)
        tap_until_value("Mode:", "Plan", tries=3)
        time.sleep(1.0)

    with recorded("prompt_focus"):
        mark("prompt_start")
        tap_text("Message", timeout=10, settle=0.8)

    with recorded("prompt_type"):
        type_text(PLAN_PROMPT, field="plan_prompt")
        mark("prompt_typed")
        time.sleep(2.0)

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
        if state != "question":
            raise RuntimeError(f"plan turn ended as {state!r} without a question card")
        mark("question_asked")

    with recorded("plan_reply"):
        mark("plan_reply_visible")
        time.sleep(3.0)
        if not has_question(dump_root()):
            raise RuntimeError("the question card disappeared before plan_reply")

    with recorded("elicitation_open"):
        answer_question()
        mark("elicitation_sheet_open")

    with recorded("elicitation_pick"):
        tap_text("Settings toggle", timeout=10, substring=True)
        mark("settings_toggle_picked")
        time.sleep(0.8)

    with recorded("elicitation_submit"):
        tap_text("Submit", timeout=10)
        if wait_for_turn() != "idle":
            raise RuntimeError("the agent asked another question after submit")
        mark("answer_submitted")

    # ── Build: switch to Build and send the implementation prompt.
    with recorded("mode_build"):
        mark("mode_build")
        tap_until_value("Mode:", "Build", tries=3)
        time.sleep(1.0)

    with recorded("build_prompt"):
        tap_text("Message", timeout=10, settle=0.8)
        type_text(BUILD_PROMPT, field="build_prompt")
        mark("build_prompt_typed")
        time.sleep(2.0)

    with recorded("build_send"):
        submit_composer()
        mark("tap_build_send")
        time.sleep(3.0)

    with recorded("build_wait"):
        state = wait_for_turn()
        if state != "idle":
            raise RuntimeError(f"build turn ended as {state!r}")
        verify_build_state()
        mark("build_finished")

    with recorded("build_reply"):
        mark("build_reply_visible")
        time.sleep(3.5)

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
        if find(dump_root(), text="catMode", substring=True) is None:
            raise RuntimeError("the settings diff does not show catMode")
        mark("settings_diff_visible")
        time.sleep(1.0)

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
        type_text(PR_PROMPT, field="pr_prompt")
        time.sleep(1.5)
        submit_composer()
        mark("tap_pr_send")
        time.sleep(3.0)

    with recorded("pr_wait"):
        state = wait_for_turn()
        if state != "idle":
            raise RuntimeError(f"PR turn ended as {state!r}")
        verify_pr_state()
        mark("pr_finished")

    scroll_chat_to_bottom()

    with recorded("pr_reply"):
        url = wait_for_pr_url(timeout=30)
        print(f"  PR URL in chat: {url}", flush=True)
        mark("pr_url_visible")
        time.sleep(3.0)


def parse_argv(argv):
    """Parse --only / --self-test / --help. Only names are validated here."""
    only = []
    index = 0
    while index < len(argv):
        argument = argv[index]
        if argument == "--only":
            index += 1
            if index >= len(argv):
                raise SystemExit("drive_phone.py: --only needs a slice name")
            value = argv[index]
        elif argument.startswith("--only="):
            value = argument.split("=", 1)[1]
        elif argument in ("-h", "--help"):
            print(USAGE_TEXT.strip())
            raise SystemExit(0)
        elif argument == "--self-test":
            self_test()
            raise SystemExit(0)
        else:
            raise SystemExit(f"drive_phone.py: unknown argument {argument!r}")
        names = [name.strip() for name in value.split(",") if name.strip()]
        if not names:
            raise SystemExit("drive_phone.py: --only needs at least one slice name")
        unknown = [name for name in names if name not in SLICE_ORDER]
        if unknown:
            raise SystemExit(
                "drive_phone.py: unknown slice(s) "
                + ", ".join(unknown)
                + "; run --help for the list"
            )
        for name in names:
            if name not in only:
                only.append(name)
        index += 1
    return only


def main(argv):
    global ONLY
    ONLY = parse_argv(argv)
    if ONLY:
        print(f"  --only {','.join(ONLY)} (everything else is walked unrecorded)", flush=True)
    mark("driver_start")
    try:
        run_walk()
    except RecordingComplete as complete:
        print(f"  --only satisfied after slice {complete.name}", flush=True)
        mark("only_complete")
        return 0
    time.sleep(0.5)
    mark("done")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
