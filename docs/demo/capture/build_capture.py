#!/usr/bin/env python3
"""Build capture.json v2 from the named phone slices.

drive_phone.py records one screenrecord file per action, starts every file with
a sleep/wake calibration blink, ends it with a second blink, and writes timed
marks to marks.log. This script measures both blinks, derives the driver-clock
to video-clock mapping from them, trims the head blink off, cuts the tail at
the tail blink, re-encodes to CFR 60, and writes the capture.json Remotion
reads. There is no stitched phone.mp4; the render timeline composes the slices.

Clock contract (plan section 2.3, amended for encoder drift), GUARD = 0.05:

    trimSec       = v_end_1 + GUARD                (head blink)
    tailSec       = v_black_start_2                (tail blink cut)
    driftRate     = (v_end_2 - v_end_1) / (T_wake_2 - T_wake_1)
    atSec(T)      = (T - T_wake_1) * driftRate - GUARD
    syncOffsetSec = v_end_1 + started - T_wake_1   (diagnostic, in (0, 1.5))

`screenrecord` on this emulator encodes a timeline that runs 6-9% slower than
the driver's monotonic clock under sustained UI-change load, independent of
resolution, bitrate, or uiautomator dumps (measured; see capture/README.md).
The two blinks turn that drift into a measured per-slice rate instead of a
failure: events map through the rate, and the published file ends at the tail
blink, so a slice can never publish a dead tail. A rate outside (0.80, 1.05)
fails the build with the slice named.

Nothing is clamped, guessed, or defaulted. A slice that does not produce
exactly two calibration blinks, four agreeing detector edges, an in-range
offset, an in-range drift rate, in-range event times, closed key runs, and a
tail whose picture is still moving at every event it must show fails the
whole build. Typing speed is whatever the capture recorded.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DEMO = SCRIPT_DIR.parent
WORK = Path(os.environ.get("WORK", DEMO / "work" / "capture"))
PUBLIC = Path(os.environ.get("PUBLIC", DEMO / "render" / "public"))
SLICES_IN = WORK / "slices"
SLICES_OUT = PUBLIC / "slices"
MANIFEST = WORK / "slices.json"
MARKS = WORK / "marks.log"

# --- Sync contract -----------------------------------------------------------
#
# GUARD is the plan's 0.05 s: trim ends GUARD past the wake frame, so the first
# published frame is post-wake even if the trim lands between source frames.
GUARD_SEC = 0.05
# syncOffsetSec is the raw-video time that corresponds to the driver's `started`
# stamp. It measures how far the encoder was behind the driver at the head
# blink, including the VFR stall while the display was off. Outside this window
# the blink cannot be trusted (plan section 2.3, assertion 3).
SYNC_OFFSET_MIN_SEC = 0.0
SYNC_OFFSET_MAX_SEC = 1.5
# The two detectors must agree on all four edges of the two runs.
EDGE_TOLERANCE_SEC = 0.08
# Each blink is >= 1.2 s of display-off in the driver; anything shorter in the
# video is not a calibration blink.
MIN_BLACK_SEC = 0.15
# The head blink is the first thing in the file. A run later than this is not it.
MAX_BLACK_START_SEC = 6.0
# A published slice with less than this is not usable as a shot.
MIN_PUBLISHED_SEC = 0.3

# --- What counts as black ----------------------------------------------------
#
# A calibration blink is the display switching off, so both detectors must see
# near-black, not merely dark. Harold records in the emulator's dark theme and
# its scrims sit only a few luma above true black, so a loose test calls ordinary
# UI black. Measured per frame on the 15 recorded slices in work/capture/slices
# (ffmpeg 6.1.1, signalstats YAVG / YLOW / YHIGH):
#
#   true black blink frame      YAVG 16.15 .. 16.17   YLOW 16   YHIGH 16
#   008-new_session scrim       YAVG 26.64 .. 29.20   YLOW 24   YHIGH 29 .. 40
#   013-changes scrim           YAVG 26.10 .. 29.92   YLOW 24   YHIGH 28 .. 40
#   010-question scrim          YAVG 29.10 .. 39.39   YLOW 24   YHIGH 40
#   014-worktrees list screen   YAVG 29.10 .. 29.35   YLOW 24   YHIGH 30
#
# The closest known non-black frame is the lit system clipboard overlay that
# drive_phone.py documents at YAVG ~21.6: it stays lit while the display sleeps
# and blackdetect sees no run there. So the separation measured on this capture
# is 16.17 (true black) / 21.6 (lit overlay) / 26.10 (darkest real UI).
# BLACK_YAVG_MAX = 20.0 sits inside the first gap: 3.8 above the brightest true
# black frame measured and 1.6 below the closest known non-black frame.
#
# A mean cannot tell a dark UI from a black frame on its own, so a frame must
# also prove coverage. signalstats YHIGH is the 90th percentile of luma, so
# YHIGH <= BLACK_YHIGH_MAX means at least 90% of the picture is at or below that
# luma. True black passes at 16; a scrim carrying text or icons fails at 28+.
BLACK_YAVG_MAX = 20.0
BLACK_YHIGH_MAX = 20.0
LUMA_FILTER = "signalstats,metadata=print:file=-"
# blackdetect is the second, independent detector. It calls a frame black only
# when pic_th (98%) of its pixels are under one luma value. Measured on ffmpeg
# 6.1.1, that luma is 16 + 255 * pix_th for limited range, so the old
# pix_th = 0.10 meant 41.5 - lighter than every dark-theme UI frame in this
# capture, which is why blackdetect reported the 013 scrim as a blink.
# pix_th = 0.0176 is luma 20.5, the same near-black boundary as the sampler.
BLACKDETECT_PIXEL_LUMA_MAX = 20.5
BLACKDETECT_PIX_TH = (BLACKDETECT_PIXEL_LUMA_MAX - 16.0) / 255.0
BLACKDETECT_FILTER = (
    f"blackdetect=d=0.10:pic_th=0.98:pix_th={BLACKDETECT_PIX_TH:.4f}"
)
# --- Encoder drift -----------------------------------------------------------
#
# Measured on this emulator (agent_server_api34, swiftshader_indirect,
# WSL2): the screenrecord timeline falls behind the driver clock by roughly
# 6-9% of the window under sustained UI-change load. Resolution (540x1200
# vs 1080x2400), bitrate (6M vs 12M), and uiautomator dumps inside the window
# did not remove it. The tail blink measures the rate per slice; these bounds
# are the mechanical ceiling. A slice outside them must be shortened, not
# nudged by hand.
SYNC_DRIFT_MIN_RATE = 0.80
SYNC_DRIFT_MAX_RATE = 1.05
MIN_DRIFT_WINDOW_SEC = 0.5
# --- Frozen tail -------------------------------------------------------------
#
# Even with the clock corrected, stale frames can sit in the encoder queue:
# the tail of a slice can replay old content while later taps and keys map
# into it. signalstats YDIF (mean luma delta vs the previous frame) separates
# the two on the published CFR file: a held frame re-encodes to YDIF = 0 and
# real UI motion measures >= 1. The guard fails a slice when its last event
# maps more than FROZEN_TAIL_MAX_SEC past the last moving picture.
FREEZE_YDIF_MIN = 0.35
FROZEN_TAIL_MAX_SEC = 1.0
YDIF_FILTER = "signalstats,metadata=print:key=lavfi.signalstats.YDIF:file=-"
# Bookkeeping marks (slice_start_*/slice_end_*) are not on-screen semantics:
# they are excluded from the frozen-tail check.
BOOKKEEPING_MARK = re.compile(r"^slice_(start|end)_")

# CFR 60 so Remotion's frame-index seeks (Freeze + OffthreadVideo) are exact on
# what used to be VFR screenrecord output (plan section 3.1).
FRAME_RATE = 60
FRAME_SEC = 1.0 / FRAME_RATE
CRF = 20
ENCODE_PRESET = "veryfast"

FLOAT_DIGITS = 3
AT_SEC_EPSILON_SEC = 1e-9

BLACKDETECT_LINE = re.compile(
    r"black_start:(?P<start>[0-9.]+)\s+"
    r"black_end:(?P<end>[0-9.]+)\s+"
    r"black_duration:(?P<duration>[0-9.]+)"
)
PTS_TIME_LINE = re.compile(r"pts_time:\s*(?P<time>[0-9]+(?:\.[0-9]+)?)")
YAVG_LINE = re.compile(r"lavfi\.signalstats\.YAVG=(?P<value>[0-9.]+)")
YDIF_LINE = re.compile(r"lavfi\.signalstats\.YDIF=(?P<value>[0-9.]+)")
LUMA_METRIC_LINE = re.compile(
    r"lavfi\.signalstats\.(?P<key>YAVG|YLOW|YHIGH|YMIN|YMAX)="
    r"(?P<value>[0-9.]+)"
)


class BuildError(Exception):
    """The capture cannot be trusted; stop instead of guessing."""


@dataclass(frozen=True)
class Event:
    """One marks.log row."""

    kind: str  # tap | key | sync_wake | mark
    at: float
    name: str | None = None
    x: int | None = None
    y: int | None = None

    def describe(self) -> str:
        if self.kind == "tap":
            return f"tap at {self.at:.3f} ({self.x},{self.y})"
        if self.kind == "key":
            return f"key at {self.at:.3f}"
        if self.kind == "sync_wake":
            return f"sync_wake at {self.at:.3f}"
        return f"mark {self.name} at {self.at:.3f}"


@dataclass(frozen=True)
class SyncEdges:
    """The two blinks, located by two independent detectors, in raw seconds."""

    head_start: float
    head_end: float
    tail_start: float
    tail_end: float
    luma_head_start: float
    luma_head_end: float
    luma_tail_start: float
    luma_tail_end: float


@dataclass(frozen=True)
class SyncMeasurement:
    """The per-slice clock mapping."""

    trim_sec: float
    sync_offset_sec: float
    v_end: float
    drift_rate: float
    tail_cut_sec: float


# --- Probing -----------------------------------------------------------------


def probe(path):
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,duration,nb_frames:format=duration",
            "-of", "json", str(path),
        ],
        text=True,
    )
    meta = json.loads(out)
    stream = meta["streams"][0]
    duration = meta.get("format", {}).get("duration") or stream.get("duration") or 0
    frames = stream.get("nb_frames") or 0
    try:
        frames = int(frames)
    except ValueError:
        frames = 0
    return {
        "duration": float(duration),
        "frames": frames,
        "width": int(stream["width"]),
        "height": int(stream["height"]),
    }


# --- marks.log ---------------------------------------------------------------


def read_events(path=MARKS):
    """Parse every marks.log row, preserving file order.

    Grammar (drive_phone.py): `tap <mono> <x> <y>`, `key <mono>`,
    `sync_wake <mono>`, `<name> <mono>`. Unknown or malformed rows are skipped,
    exactly as the old tap-only reader did, so a stray line cannot shift the
    clock.
    """
    events = []
    path = Path(path)
    if not path.exists():
        return events
    for line in path.read_text().splitlines():
        fields = line.split()
        if not fields:
            continue
        if fields[0] == "tap" and len(fields) == 4:
            events.append(
                Event("tap", float(fields[1]), None, int(fields[2]), int(fields[3]))
            )
        elif fields[0] == "key" and len(fields) == 2:
            events.append(Event("key", float(fields[1])))
        elif fields[0] == "sync_wake" and len(fields) == 2:
            events.append(Event("sync_wake", float(fields[1])))
        elif len(fields) == 2:
            events.append(Event("mark", float(fields[1]), fields[0]))
    return events


def taps_of(events):
    """Only the taps, with their device-pixel coordinates untouched."""
    return [(event.at, event.x, event.y) for event in events if event.kind == "tap"]


def read_taps(path=MARKS):
    """Back-compat shim: the tap rows of marks.log."""
    return taps_of(read_events(path))


def check_key_runs(events):
    """Every `key` run must be closed by a `keys_done` mark, in file order."""
    open_run = None
    for event in events:
        if event.kind == "key":
            if open_run is None:
                open_run = event.at
            continue
        if open_run is None:
            continue
        if event.kind == "mark" and event.name == "keys_done":
            open_run = None
            continue
        raise BuildError(
            f"key run starting at {open_run:.3f} is not closed by a keys_done "
            f"mark (found {event.describe()})"
        )
    if open_run is not None:
        raise BuildError(
            f"key run starting at {open_run:.3f} is not closed by a keys_done mark"
        )


# --- Detection ---------------------------------------------------------------


def run_ffmpeg(arguments):
    result = subprocess.run(
        ["ffmpeg", *arguments], capture_output=True, text=True
    )
    if result.returncode != 0:
        tail = "\n".join(result.stderr.strip().splitlines()[-3:])
        raise BuildError(f"ffmpeg {' '.join(arguments[:2])} failed: {tail}")
    return result


def parse_blackdetect(text):
    return [
        (float(match.group("start")), float(match.group("end")))
        for match in BLACKDETECT_LINE.finditer(text)
    ]


def parse_metric(text, line_regex):
    """Pair each pts_time with the metric value printed after it."""
    samples = []
    current = None
    for line in text.splitlines():
        time_match = PTS_TIME_LINE.search(line)
        if time_match is not None:
            current = float(time_match.group("time"))
            continue
        value_match = line_regex.search(line)
        if value_match is not None and current is not None:
            samples.append((current, float(value_match.group("value"))))
            current = None
    return samples


def parse_luma(text):
    return parse_metric(text, YAVG_LINE)


def parse_luma_frames(text):
    """Per-frame luma metrics, paired by pts_time, in file order.

    `metadata=print` writes a `pts_time:` header per frame followed by one
    `lavfi.signalstats.KEY=value` line per printed key, so a frame becomes
    `{YAVG: ..., YHIGH: ...}` and the black predicate can look at the mean and
    the 90th percentile of the same frame.
    """
    frames = []
    current_time = None
    current = None
    for line in text.splitlines():
        time_match = PTS_TIME_LINE.search(line)
        if time_match is not None:
            if current is not None:
                frames.append((current_time, current))
            current_time = float(time_match.group("time"))
            current = {}
            continue
        value_match = LUMA_METRIC_LINE.search(line)
        if value_match is not None and current is not None:
            current[value_match.group("key")] = float(value_match.group("value"))
    if current is not None:
        frames.append((current_time, current))
    return frames


def parse_ydif(text):
    return parse_metric(text, YDIF_LINE)


def detect_black_intervals(path):
    result = run_ffmpeg(
        ["-hide_banner", "-nostats", "-i", str(path), "-an",
         "-vf", BLACKDETECT_FILTER, "-f", "null", "-"]
    )
    return parse_blackdetect(result.stderr)


def frame_is_black(metrics):
    """True only for a genuinely near-black frame: low mean *and* high coverage.

    A mean alone cannot separate dark-theme UI from black: the 008 scrim has
    YAVG 26.6 and the 013 scrim 26.1 in a dark theme. Requiring YHIGH (the 90th
    percentile of luma) to be under BLACK_YHIGH_MAX adds the coverage condition,
    so a frame with a scrim, text, or icons in it cannot pass no matter how low
    its mean is.
    """
    yavg = metrics.get("YAVG")
    yhigh = metrics.get("YHIGH")
    if yavg is None or yhigh is None:
        return False
    return yavg <= BLACK_YAVG_MAX and yhigh <= BLACK_YHIGH_MAX


def detect_luma_frames(path):
    result = run_ffmpeg(
        ["-hide_banner", "-nostats", "-i", str(path), "-an",
         "-vf", LUMA_FILTER, "-f", "null", "-"]
    )
    frames = parse_luma_frames(result.stdout or result.stderr)
    if not frames:
        raise BuildError(f"{Path(path).name}: signalstats produced no luma samples")
    return frames


def detect_luma_samples(path):
    """Back-compat shim: the (time, YAVG) pair of every frame."""
    samples = [
        (time, metrics["YAVG"])
        for time, metrics in detect_luma_frames(path)
        if "YAVG" in metrics
    ]
    if not samples:
        raise BuildError(f"{Path(path).name}: signalstats produced no YAVG samples")
    return samples


def detect_luma_runs(path):
    """Group the near-black frames into maximal black runs."""
    runs = []
    current = None
    for time, metrics in detect_luma_frames(path):
        if frame_is_black(metrics):
            if current is None:
                current = [time, time]
            else:
                current[1] = time
        elif current is not None:
            runs.append((current[0], current[1]))
            current = None
    if current is not None:
        runs.append((current[0], current[1]))
    if not runs:
        raise BuildError(
            f"{Path(path).name}: signalstats found no black frames "
            f"(YAVG <= {BLACK_YAVG_MAX:.0f} with YHIGH <= "
            f"{BLACK_YHIGH_MAX:.0f})"
        )
    return runs


def detect_luma_edges(path):
    """Back-compat shim: the first black run's edges."""
    start, end = detect_luma_runs(path)[0]
    return start, end


def detect_motion_samples(path):
    result = run_ffmpeg(
        ["-hide_banner", "-nostats", "-i", str(path), "-an",
         "-vf", YDIF_FILTER, "-f", "null", "-"]
    )
    samples = parse_ydif(result.stdout) or parse_ydif(result.stderr)
    if not samples:
        raise BuildError(f"{Path(path).name}: signalstats produced no YDIF samples")
    return samples


def last_moving_pts(path):
    """The PTS of the last frame whose picture moved, or 0.0 if none did."""
    moving = [
        time for time, ydif in detect_motion_samples(path)
        if ydif >= FREEZE_YDIF_MIN
    ]
    return max(moving) if moving else 0.0


def format_runs(runs):
    return ", ".join(f"[{start:.3f}, {end:.3f}]" for start, end in runs) or "none"


def short_run_note(runs):
    """Explain a black run that is real but too short to be a calibration blink."""
    short = [run for run in runs if run[1] - run[0] < MIN_BLACK_SEC]
    if not short:
        return ""
    return (
        f" - {format_runs(short)} lasts under the {MIN_BLACK_SEC:.2f}s "
        f"calibration minimum, so the encoder did not record the display-off "
        f"window as black"
    )


def sampler_view(intervals, path):
    """The frame sampler's runs, for a message about a wrong blackdetect count."""
    try:
        luma_runs = detect_luma_runs(path)
    except BuildError:
        return ""
    if luma_runs == intervals:
        return ""
    return (
        f"; the frame sampler sees {format_runs(luma_runs)}"
        f"{short_run_note(luma_runs)}"
    )


def locate_sync_edges(path):
    """Locate the head and tail calibration blinks; cross-check with YAVG.

    Both detectors must mean the same thing by black (near-black, see
    BLACK_YAVG_MAX) and must agree on the run count *and* on all four edges.
    Any disagreement fails the slice: it means one detector saw something the
    other did not, and the clock derived from it cannot be trusted.
    """
    name = Path(path).name
    intervals = detect_black_intervals(path)
    if len(intervals) != 2:
        raise BuildError(
            f"{name}: expected exactly two black calibration runs (head blink "
            f"and tail blink), found {len(intervals)}"
            + (f": {format_runs(intervals)}" if intervals else "")
            + sampler_view(intervals, path)
        )
    luma_runs = detect_luma_runs(path)
    if len(luma_runs) != len(intervals):
        raise BuildError(
            f"{name}: the two black detectors found different black runs "
            f"(blackdetect {format_runs(intervals)}, frame sampler "
            f"{format_runs(luma_runs)}{short_run_note(luma_runs)})"
        )
    head_start, head_end = intervals[0]
    tail_start, tail_end = intervals[1]
    if tail_start <= head_end:
        raise BuildError(
            f"{name}: the tail blink at {tail_start:.3f}s is not after the "
            f"head blink at {head_end:.3f}s"
        )
    (luma_head_start, luma_head_end), (luma_tail_start, luma_tail_end) = luma_runs
    return SyncEdges(
        head_start, head_end, tail_start, tail_end,
        luma_head_start, luma_head_end, luma_tail_start, luma_tail_end,
    )


def measure_sync(source, started, t_wake_head, t_wake_tail, edges_provider=None):
    """Derive trimSec, syncOffsetSec, driftRate and the tail cut, or fail."""
    provider = edges_provider or locate_sync_edges
    edges = provider(source)
    name = Path(source).name

    head_sec = edges.head_end - edges.head_start
    if head_sec < MIN_BLACK_SEC:
        raise BuildError(
            f"{name}: head blink black run is {head_sec:.3f}s, below the "
            f"{MIN_BLACK_SEC:.2f}s calibration minimum"
        )
    if edges.head_start > MAX_BLACK_START_SEC:
        raise BuildError(
            f"{name}: head blink black run starts at {edges.head_start:.3f}s, "
            f"not within the first {MAX_BLACK_START_SEC:.1f}s"
        )
    tail_sec = edges.tail_end - edges.tail_start
    if tail_sec < MIN_BLACK_SEC:
        raise BuildError(
            f"{name}: tail blink black run is {tail_sec:.3f}s, below the "
            f"{MIN_BLACK_SEC:.2f}s calibration minimum"
        )
    for label, detected, luma in (
        ("head start", edges.head_start, edges.luma_head_start),
        ("head end", edges.head_end, edges.luma_head_end),
        ("tail start", edges.tail_start, edges.luma_tail_start),
        ("tail end", edges.tail_end, edges.luma_tail_end),
    ):
        drift = abs(detected - luma)
        if drift > EDGE_TOLERANCE_SEC:
            raise BuildError(
                f"{name}: detectors disagree on the black {label} "
                f"by {drift:.3f}s (blackdetect {detected:.3f}, "
                f"signalstats {luma:.3f}, limit {EDGE_TOLERANCE_SEC:.2f}s)"
            )

    v_end = edges.head_end
    trim_sec = v_end + GUARD_SEC
    sync_offset_sec = v_end + started - t_wake_head
    if not (SYNC_OFFSET_MIN_SEC < sync_offset_sec < SYNC_OFFSET_MAX_SEC):
        raise BuildError(
            f"{name}: syncOffsetSec {sync_offset_sec:.3f}s is outside "
            f"({SYNC_OFFSET_MIN_SEC}, {SYNC_OFFSET_MAX_SEC})"
        )

    window = t_wake_tail - t_wake_head
    if window < MIN_DRIFT_WINDOW_SEC:
        raise BuildError(
            f"{name}: the two sync_wake marks are {window:.3f}s apart, below "
            f"the {MIN_DRIFT_WINDOW_SEC:.1f}s drift window"
        )
    drift_rate = (edges.tail_end - edges.head_end) / window
    if not (SYNC_DRIFT_MIN_RATE < drift_rate < SYNC_DRIFT_MAX_RATE):
        raise BuildError(
            f"{name}: encoder drift rate {drift_rate:.3f} video-s per driver-s "
            f"is outside ({SYNC_DRIFT_MIN_RATE}, {SYNC_DRIFT_MAX_RATE}); the "
            f"window ran too long under load - shorten or split the slice "
            f"(see capture/README.md)"
        )
    return SyncMeasurement(trim_sec, sync_offset_sec, v_end, drift_rate, edges.tail_start)


def assert_tail_motion(name, target, max_event_at, max_event_desc):
    """Fail when the published picture stops moving before its last event."""
    if max_event_at is None:
        return
    last_change = last_moving_pts(target)
    gap = max_event_at - last_change
    if gap > FROZEN_TAIL_MAX_SEC:
        raise BuildError(
            f"slice {name}: frozen tail: the last moving picture is at "
            f"{last_change:.3f}s but {max_event_desc} maps to "
            f"{max_event_at:.3f}s - {gap:.3f}s of tail past the last visible "
            f"change (limit {FROZEN_TAIL_MAX_SEC:.2f}s). The encoder stalled "
            f"or replayed stale frames; re-record this slice"
        )


# --- Encode ------------------------------------------------------------------


def encode(source, target, trim_sec, max_sec=None):
    """Trim the head with output seeking, cut the tail, re-encode to CFR 60."""
    target.parent.mkdir(parents=True, exist_ok=True)
    arguments = [
        "-v", "error", "-y", "-i", str(source),
        "-ss", f"{trim_sec:.6f}",
    ]
    if max_sec is not None:
        arguments += ["-t", f"{max_sec:.6f}"]
    arguments += [
        "-an", "-c:v", "libx264", "-preset", ENCODE_PRESET, "-crf", str(CRF),
        "-pix_fmt", "yuv420p", "-fps_mode", "cfr", "-r", str(FRAME_RATE),
        "-movflags", "+faststart", str(target),
    ]
    run_ffmpeg(arguments)


# --- Build -------------------------------------------------------------------


def round_sec(value):
    rounded = round(value, FLOAT_DIGITS)
    return 0.0 if rounded == 0 else rounded


def build(work=WORK, public=PUBLIC, *, edges_provider=None, verbose=True):
    """Build capture.json and return the payload."""
    work = Path(work)
    public = Path(public)
    slices_in = work / "slices"
    slices_out = public / "slices"
    manifest_path = work / "slices.json"
    marks_path = work / "marks.log"

    if not manifest_path.exists() or manifest_path.stat().st_size == 0:
        raise BuildError(f"no slices recorded in {manifest_path}")
    manifest = json.loads(manifest_path.read_text())
    events = read_events(marks_path)
    check_key_runs(events)

    # Only drop published files this manifest no longer names. A failed build
    # must never wipe the previous good capture.
    planned = {entry["file"] for entry in manifest}
    slices_out.mkdir(parents=True, exist_ok=True)
    for stale in slices_out.glob("*.mp4"):
        if stale.name not in planned:
            stale.unlink()

    slices = []
    typing = []
    width = height = None
    for entry in manifest:
        name = entry["name"]
        source = slices_in / entry["file"]
        if not source.exists():
            raise BuildError(f"missing slice {source}")
        started = float(entry["started"])
        ended = float(entry["ended"])
        raw = probe(source)

        wake_times = sorted(
            event.at
            for event in events
            if event.kind == "sync_wake" and started <= event.at <= ended
        )
        if len(wake_times) != 2:
            raise BuildError(
                f"slice {name}: expected exactly two sync_wake marks between "
                f"{started:.3f} and {ended:.3f} (head and tail blink), "
                f"found {len(wake_times)}"
            )
        t_wake_head, t_wake_tail = wake_times

        sync = measure_sync(
            source, started, t_wake_head, t_wake_tail, edges_provider=edges_provider
        )
        target = slices_out / entry["file"]
        tail_window = sync.tail_cut_sec - sync.trim_sec
        if tail_window < MIN_PUBLISHED_SEC:
            raise BuildError(
                f"slice {name}: the tail blink leaves only {tail_window:.3f}s "
                f"of published material below the {MIN_PUBLISHED_SEC:.1f}s minimum"
            )
        encode(source, target, sync.trim_sec, max_sec=tail_window)
        published = probe(target)
        duration_sec = published["duration"]
        if duration_sec < MIN_PUBLISHED_SEC:
            raise BuildError(
                f"slice {name}: published duration {duration_sec:.3f}s is below "
                f"the {MIN_PUBLISHED_SEC:.1f}s minimum after trimming "
                f"{sync.trim_sec:.3f}s off {raw['duration']:.3f}s"
            )
        possible = raw["duration"] - sync.trim_sec
        if duration_sec > possible + FRAME_SEC:
            raise BuildError(
                f"slice {name}: published duration {duration_sec:.3f}s exceeds the "
                f"raw remainder {possible:.3f}s; the head trim did not land"
            )
        if duration_sec > tail_window + 2 * FRAME_SEC:
            raise BuildError(
                f"slice {name}: published duration {duration_sec:.3f}s exceeds "
                f"the tail-blink cut {tail_window:.3f}s; the tail cut did not land"
            )

        def at_sec(ts):
            return round_sec((ts - t_wake_head) * sync.drift_rate - GUARD_SEC)

        # sync_wake marks are the clocks themselves, not payload events.
        in_slice = [
            event
            for event in events
            if event.kind != "sync_wake" and started <= event.at <= ended
        ]
        timings = {}
        for event in in_slice:
            value = at_sec(event.at)
            if not (0.0 <= value <= duration_sec + AT_SEC_EPSILON_SEC):
                raise BuildError(
                    f"slice {name}: {event.describe()} maps to atSec {value} "
                    f"outside [0, {duration_sec:.3f}]"
                )
            timings[id(event)] = value

        taps = [
            {"x": event.x, "y": event.y, "atSec": timings[id(event)]}
            for event in in_slice
            if event.kind == "tap"
        ]
        keys = [
            {"atSec": timings[id(event)]}
            for event in in_slice
            if event.kind == "key"
        ]
        marks = [
            {"name": event.name, "atSec": timings[id(event)]}
            for event in in_slice
            if event.kind == "mark"
        ]
        _assert_increasing(name, "keys", [item["atSec"] for item in keys])
        _assert_increasing(name, "marks", [item["atSec"] for item in marks])

        # The frozen-tail guard: the picture must still be moving at every
        # on-screen event this slice has to show. slice_start_/slice_end_
        # marks are bookkeeping and never appear as picture changes.
        semantic = [
            (timings[id(event)], event.describe())
            for event in in_slice
            if event.kind in ("tap", "key")
            or (event.kind == "mark" and not BOOKKEEPING_MARK.match(event.name or ""))
        ]
        if semantic:
            max_at, max_desc = max(semantic, key=lambda item: item[0])
            assert_tail_motion(name, target, max_at, max_desc)

        if keys:
            typing.append(_typing_row(name, keys, duration_sec))

        width = width or published["width"]
        height = height or published["height"]
        slices.append(
            {
                "name": name,
                "file": f"slices/{entry['file']}",
                "durationSec": duration_sec,
                "trimSec": round_sec(sync.trim_sec),
                "syncOffsetSec": round_sec(sync.sync_offset_sec),
                "driftRate": round(sync.drift_rate, FLOAT_DIGITS),
                "width": published["width"],
                "height": published["height"],
                "still": published["frames"] <= 1 or duration_sec < 0.1,
                "taps": taps,
                "keys": keys,
                "marks": marks,
            }
        )
        if verbose:
            print(
                f"  {name:<22} raw {raw['duration']:6.3f}s  trim "
                f"{sync.trim_sec:5.3f}s  published {duration_sec:6.3f}s  offset "
                f"{sync.sync_offset_sec:5.3f}s  drift {sync.drift_rate:5.3f}  "
                f"taps {len(taps):2d}  keys {len(keys):3d}",
                flush=True,
            )

    if not slices:
        raise BuildError("no slices to publish")
    if len({(item["width"], item["height"]) for item in slices}) != 1:
        raise BuildError("slices have mixed dimensions")

    payload = {
        "width": width,
        "height": height,
        "slices": [
            {
                **item,
                "durationSec": round_sec(item["durationSec"]),
            }
            for item in slices
        ],
    }
    (public / "capture.json").write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n"
    )
    (public / "phone.mp4").unlink(missing_ok=True)

    if verbose:
        _print_summary(payload, typing)
    return payload


def _assert_increasing(name, label, values):
    for previous, current in zip(values, values[1:]):
        if current < previous:
            raise BuildError(
                f"slice {name}: {label} atSec goes backwards ({previous} then {current})"
            )


def _typing_row(name, keys, duration_sec):
    count = len(keys)
    window = keys[-1]["atSec"] - keys[0]["atSec"]
    cadence = (count - 1) / window if window > 0 else 0.0
    return {
        "name": name,
        "chars": count,
        "windowSec": round_sec(window),
        "cadenceCps": cadence,
        "sliceSec": round_sec(duration_sec),
    }


def _print_summary(payload, typing):
    print(
        f"build_capture: {len(payload['slices'])} slices, "
        f"{sum(item['durationSec'] for item in payload['slices']):.1f}s published",
        flush=True,
    )
    if not typing:
        return
    print("build_capture: typing", flush=True)
    for row in typing:
        print(
            f"  {row['name']:<22} {row['chars']:3d} chars in "
            f"{row['windowSec']:6.2f}s  {row['cadenceCps']:4.1f} cps",
            flush=True,
        )
    print(
        f"  total {sum(row['chars'] for row in typing)} keys across "
        f"{len(typing)} typing slices",
        flush=True,
    )


def main():
    try:
        build()
    except BuildError as error:
        print(f"build_capture: {error}", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
