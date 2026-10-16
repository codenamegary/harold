#!/usr/bin/env python3
"""Clip dead space out of the phone capture and remap the timeline.

The scanner waits for the feed to reach the live-QR gate, so the recording
holds a long frozen stretch (viewfinder showing the same frame). This script
measures frame-to-frame motion, finds that dead run inside the scan window,
cuts it out of phone.mp4, and remaps the marks in capture.json so captions
and the terminal stay in sync.

Idempotent: the raw recording is stashed as `phone-raw.mp4` under
`docs/demo/work/capture/` (never committed). Re-running with the stash
present re-detects from raw; without it (fresh clone) the cuts already
recorded in capture.json win and the script is a no-op.
"""
import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PUBLIC = SCRIPT_DIR.parent / "render" / "public"
RAW = SCRIPT_DIR.parent / "work" / "capture" / "phone-raw.mp4"

SAMPLE_FPS = 4
SAMPLE_W, SAMPLE_H = 120, 53
DEAD_DIFF = 1.0  # mean abs gray diff below this = frozen
MIN_DEAD_SEC = 2.0
KEEP_FROZEN_SEC = 2.5  # tail of the freeze kept on screen before the cut
RESUME_BEFORE_SEC = 1.2  # frozen frames kept right before pairing lands


def ffprobe_duration(path):
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "csv=p=0", str(path),
        ],
        text=True,
    )
    return float(out.strip())


def sample_diffs(path):
    """Mean abs gray diff between consecutive frames at SAMPLE_FPS."""
    raw = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-i", str(path),
            "-vf", f"fps={SAMPLE_FPS},scale={SAMPLE_W}:{SAMPLE_H},format=gray",
            "-f", "rawvideo", "-",
        ],
        check=True, capture_output=True,
    ).stdout
    size = SAMPLE_W * SAMPLE_H
    count = len(raw) // size
    frames = [raw[i * size:(i + 1) * size] for i in range(count)]
    diffs = []
    for a, b in zip(frames, frames[1:]):
        total = 0
        for x, y in zip(a, b):
            total += x - y if x > y else y - x
        diffs.append(total / size)
    return diffs


def find_cut(diffs, duration, zone_from, zone_to):
    """Longest frozen run inside the zone -> (cut_from, cut_to) or None."""
    i0 = math.ceil(zone_from * SAMPLE_FPS)
    i1 = min(len(diffs), math.floor(zone_to * SAMPLE_FPS))
    best = None
    run_start = None
    for i in range(i0, i1):
        if diffs[i] < DEAD_DIFF:
            if run_start is None:
                run_start = i
        else:
            if run_start is not None and (i - run_start) / SAMPLE_FPS >= MIN_DEAD_SEC:
                span = (run_start / SAMPLE_FPS, i / SAMPLE_FPS)
                if best is None or span[1] - span[0] > best[1] - best[0]:
                    best = span
            run_start = None
    if run_start is not None and (i1 - run_start) / SAMPLE_FPS >= MIN_DEAD_SEC:
        span = (run_start / SAMPLE_FPS, i1 / SAMPLE_FPS)
        if best is None or span[1] - span[0] > best[1] - best[0]:
            best = span
    if best is None:
        return None
    dead_from, dead_to = best
    cut_from = dead_from + KEEP_FROZEN_SEC
    cut_to = zone_to - RESUME_BEFORE_SEC
    if cut_to - cut_from < 2.0:
        return None
    return cut_from, cut_to


def remap(events, cuts):
    out = []
    for event in events:
        sec = event["sec"]
        shift = 0.0
        inside = False
        for cut in cuts:
            if cut["to"] <= sec:
                shift += cut["to"] - cut["from"]
            elif cut["from"] < sec < cut["to"]:
                inside = True
                break
        out.append({"name": event["name"], "sec": round(sec - shift, 3) if not inside else None})
    if any(e["sec"] is None for e in out):
        sys.exit("cut_dead_space: an event fell inside a cut; widen the resume padding")
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--debug", action="store_true", help="print the motion profile")
    args = parser.parse_args()

    capture_path = PUBLIC / "capture.json"
    data = json.loads(capture_path.read_text())

    if RAW.exists():
        raw_path = RAW
    elif data.get("cuts"):
        print("cut_dead_space: cuts already applied and no raw stash; nothing to do")
        return
    else:
        raw_path = PUBLIC / "phone.mp4"

    raw_events = data.get("rawEvents") or data["events"]
    by_name = {event["name"]: event["sec"] for event in raw_events}
    tap_pair = by_name.get("tap_pair")
    paired = by_name.get("paired_chat_visible")
    if tap_pair is None or paired is None or paired <= tap_pair:
        sys.exit("cut_dead_space: capture.json has no tap_pair/paired_chat_visible window")

    duration = ffprobe_duration(raw_path)
    diffs = sample_diffs(raw_path)
    if args.debug:
        zone = [d for i, d in enumerate(diffs)
                if tap_pair + 1 <= i / SAMPLE_FPS <= paired]
        print(f"motion in scan zone: min {min(zone):.2f} max {max(zone):.2f} "
              f"({len(zone)} samples)")

    cut = find_cut(diffs, duration, tap_pair + 1.0, paired)
    if cut is None:
        print("cut_dead_space: no dead stretch long enough to cut")
        return
    cut_from, cut_to = cut
    cuts = [{"from": round(cut_from, 3), "to": round(cut_to, 3)}]
    removed = cut_to - cut_from
    print(f"cut_dead_space: removing {removed:.1f}s of frozen scan "
          f"(video {cut_from:.1f}-{cut_to:.1f}s)")

    segments = []
    cursor = 0.0
    for cut in cuts:
        if cut["from"] > cursor:
            segments.append((cursor, cut["from"]))
        cursor = cut["to"]
    if cursor < duration:
        segments.append((cursor, duration))

    inputs = []
    filters = []
    labels = []
    for index, (start, end) in enumerate(segments):
        inputs += ["-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(raw_path)]
        filters.append(f"[{index}:v]setpts=PTS-STARTPTS[s{index}]")
        labels.append(f"[s{index}]")
    filters.append("".join(labels) + f"concat=n={len(segments)}:v=1:a=0[out]")

    cut_tmp = PUBLIC / ".phone-cut.mp4"
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y", *inputs,
            "-filter_complex", ";".join(filters), "-map", "[out]",
            "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(cut_tmp),
        ],
        check=True,
    )
    new_duration = ffprobe_duration(cut_tmp)

    data["rawEvents"] = raw_events
    data["cuts"] = cuts
    data["events"] = remap(raw_events, cuts)
    data["durationSec"] = round(new_duration, 3)
    capture_path.write_text(json.dumps(data, indent=2) + "\n")

    if raw_path != RAW:
        raw_path.rename(RAW)
    cut_tmp.replace(PUBLIC / "phone.mp4")
    print(f"cut_dead_space: {duration:.1f}s -> {new_duration:.1f}s, "
          f"{len(data['events'])} events remapped")


if __name__ == "__main__":
    main()
