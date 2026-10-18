#!/usr/bin/env python3
"""Stitch the segmented capture into one phone.mp4 and remap the timeline.

drive_phone.py records in segments: screenrecord runs only while something is
happening on screen, and the pure waits (the scanner decoding the QR, the
agent streaming a reply, session-creation spinners) happen with recording
off. This script pairs up the rec_start/rec_end marks, probes each segment,
concatenates them, and rewrites capture.json onto the stitched timeline.

Each segment is anchored to its rec_end mark: screenrecord finalizes within
a fraction of a second of SIGINT, so the segment covers
[rec_end - duration, rec_end] of wall time (the encoder's startup latency
only ever eats into the head, which rec_start's settle already keeps clear).
Marks inside a window map into their segment; marks fired in an unrecorded
gap clamp to the start of the next segment - whatever happened while
recording was off is visible right where the next segment picks up.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PUBLIC = SCRIPT_DIR.parent / "render" / "public"
SEGMENTS = SCRIPT_DIR.parent / "work" / "capture" / "segments"
MARKS = SCRIPT_DIR.parent / "work" / "capture" / "marks.log"


def probe(path):
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,duration:format=duration",
            "-of", "json", str(path),
        ],
        text=True,
    )
    meta = json.loads(out)
    stream = meta["streams"][0]
    duration = meta.get("format", {}).get("duration") or stream.get("duration") or 0
    return {
        "duration": float(duration),
        "width": int(stream["width"]),
        "height": int(stream["height"]),
    }


def hold_frame(path, duration, out):
    """Extend a single-frame recording to the wall time it was on screen.

    screenrecord sometimes finalizes a short, static segment with one frame
    and no duration. Loop that frame as a PNG instead of asking ffmpeg to
    stream-loop a zero-duration video, which never finishes.
    """
    frame = out.with_suffix(".png")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(path), "-frames:v", "1", str(frame)],
        check=True,
    )
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y",
            "-loop", "1", "-i", str(frame),
            "-t", f"{duration:.3f}", "-r", "30", "-an",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
            "-pix_fmt", "yuv420p", str(out),
        ],
        check=True,
    )
    frame.unlink(missing_ok=True)


def read_marks():
    marks = []
    for line in MARKS.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        name, ts = line.rsplit(" ", 1)
        marks.append((name, float(ts)))
    marks.sort(key=lambda mark: mark[1])
    return marks


def main():
    marks = read_marks()
    zero = marks[0][1]  # driver_start defines t=0

    # Pair up rec_start_NNN / rec_end_NNN.
    opens = {}
    windows = []  # (index, wall_from, wall_to) in seconds since zero
    for name, ts in marks:
        if match := re.fullmatch(r"rec_start_(\d+)", name):
            index = int(match.group(1))
            if index in opens:
                sys.exit(f"stitch_segments: duplicate rec_start_{match.group(1)}")
            opens[index] = ts
        elif match := re.fullmatch(r"rec_end_(\d+)", name):
            index = int(match.group(1))
            if index not in opens:
                sys.exit(f"stitch_segments: rec_end_{index:03d} without rec_start")
            windows.append((index, opens.pop(index) - zero, ts - zero))
    if opens:
        sys.exit(f"stitch_segments: rec_start without rec_end: {sorted(opens)}")
    if not windows:
        sys.exit("stitch_segments: no rec_start/rec_end pairs in marks.log")
    windows.sort()

    # Probe segments and lay them end to end.
    # layout: (wall_from, wall_to, video_from, duration, offset) where
    # video_from is the wall time at the segment's video second 0 and offset
    # is the segment's start on the stitched timeline.
    layout = []
    held = []
    offset = 0.0
    for index, wall_from, wall_to in windows:
        path = SEGMENTS / f"harold-demo-{index:03d}.mp4"
        if not path.exists():
            sys.exit(f"stitch_segments: missing segment {path}")
        duration = probe(path)["duration"]
        if duration < 0.1:
            # A static short scene can finalize as one frame with no
            # duration. Hold that frame for the wall time it was recorded.
            duration = wall_to - wall_from
            fixed = SEGMENTS / f"harold-demo-{index:03d}-held.mp4"
            hold_frame(path, duration, fixed)
            held.append(fixed)
            path = fixed
        layout.append((wall_from, wall_to, wall_to - duration, duration, offset, path))
        offset += duration
    total = offset

    def map_wall(t):
        """Wall time (seconds since driver_start) -> stitched video time."""
        for wall_from, wall_to, video_from, duration, seg_offset, _ in layout:
            if wall_from > t:
                return seg_offset  # fired in a gap: next segment picks it up
            if t <= wall_to:
                within = min(duration, max(0.0, t - video_from))
                return seg_offset + within
        return total

    events = []
    for name, ts in marks:
        if name == "driver_start" or re.fullmatch(r"rec_(start|end)_\d+", name):
            continue
        events.append({"name": name, "sec": round(map_wall(ts - zero), 3)})

    # Clamping can only produce ties, but keep the timeline strictly sane.
    events.sort(key=lambda event: event["sec"])
    running = 0.0
    for event in events:
        running = max(running, event["sec"])
        event["sec"] = round(running, 3)

    # Concat: every segment shares encoder settings; re-encode for a clean,
    # faststart output instead of trusting stream-copy timestamps.
    concat_list = PUBLIC / ".phone-concat.txt"
    concat_list.write_text(
        "".join(f"file '{path.resolve()}'\n" for *_, path in layout)
    )
    out = PUBLIC / "phone.mp4"
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y",
            "-f", "concat", "-safe", "0", "-i", str(concat_list),
            "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out),
        ],
        check=True,
    )
    concat_list.unlink()
    for path in held:
        path.unlink(missing_ok=True)

    meta = probe(out)
    raw_events = [
        {"name": name, "sec": round(ts - zero, 3)}
        for name, ts in marks
        if name != "driver_start"
    ]
    # Unrecorded wall ranges, for provenance.
    cuts = []
    cursor = 0.0
    for wall_from, wall_to, *_ in layout:
        if wall_from > cursor:
            cuts.append({"from": round(cursor, 3), "to": round(wall_from, 3)})
        cursor = wall_to

    payload = {
        "durationSec": round(meta["duration"], 3),
        "width": meta["width"],
        "height": meta["height"],
        "events": events,
        "rawEvents": raw_events,
        "cuts": cuts,
    }
    (PUBLIC / "capture.json").write_text(json.dumps(payload, indent=2) + "\n")

    unrecorded = sum(cut["to"] - cut["from"] for cut in cuts)
    print(
        f"stitch_segments: {len(layout)} segments, "
        f"{windows[-1][2]:.1f}s wall -> {meta['duration']:.1f}s video, "
        f"{unrecorded:.1f}s unrecorded, {len(events)} events"
    )


if __name__ == "__main__":
    main()
