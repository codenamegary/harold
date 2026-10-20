#!/usr/bin/env python3
"""Build capture.json from the named phone slices.

drive_phone.py records one screenrecord file per action and writes a slice
manifest plus tap marks. This script pulls the metadata together: it probes
and re-encodes each slice into docs/demo/render/public/slices/, attaches the
taps that happened inside each slice, and writes the capture.json Remotion
reads. There is no stitched phone.mp4; the render timeline composes the slices.
"""
import json
import os
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DEMO = SCRIPT_DIR.parent
WORK = Path(os.environ.get("WORK", DEMO / "work" / "capture"))
PUBLIC = Path(os.environ.get("PUBLIC", DEMO / "render" / "public"))
SLICES_IN = WORK / "slices"
SLICES_OUT = PUBLIC / "slices"
MANIFEST = WORK / "slices.json"
MARKS = WORK / "marks.log"


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


def read_taps():
    taps = []
    if not MARKS.exists():
        return taps
    for line in MARKS.read_text().splitlines():
        fields = line.split()
        if len(fields) == 4 and fields[0] == "tap":
            taps.append((float(fields[1]), int(fields[2]), int(fields[3])))
    return taps


def encode(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y", "-i", str(source),
            "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target),
        ],
        check=True,
    )


def main():
    if not MANIFEST.exists() or MANIFEST.stat().st_size == 0:
        raise SystemExit(f"build_capture: no slices recorded in {MANIFEST}")
    manifest = json.loads(MANIFEST.read_text())
    taps = read_taps()
    SLICES_OUT.mkdir(parents=True, exist_ok=True)
    for stale in SLICES_OUT.glob("*.mp4"):
        stale.unlink()

    slices = []
    width = height = None
    for entry in manifest:
        source = SLICES_IN / entry["file"]
        if not source.exists():
            raise SystemExit(f"build_capture: missing slice {source}")
        meta = probe(source)
        still = meta["frames"] <= 1 or meta["duration"] < 0.1
        duration = meta["duration"] if not still else max(0.5, entry["ended"] - entry["started"])
        taps_in_slice = [
            {
                "x": x,
                "y": y,
                "atSec": round(min(duration, max(0.0, ts - entry["started"])), 3),
            }
            for ts, x, y in taps
            if entry["started"] <= ts <= entry["ended"]
        ]
        width = width or meta["width"]
        height = height or meta["height"]
        encode(source, SLICES_OUT / entry["file"])
        slices.append(
            {
                "name": entry["name"],
                "file": f"slices/{entry['file']}",
                "durationSec": round(duration, 3),
                "width": meta["width"],
                "height": meta["height"],
                "still": still,
                "taps": taps_in_slice,
            }
        )

    if not slices:
        raise SystemExit("build_capture: no slices to publish")
    if len({(item["width"], item["height"]) for item in slices}) != 1:
        raise SystemExit("build_capture: slices have mixed dimensions")

    payload = {"width": width, "height": height, "slices": slices}
    (PUBLIC / "capture.json").write_text(json.dumps(payload, indent=2) + "\n")
    (PUBLIC / "phone.mp4").unlink(missing_ok=True)
    print(
        f"build_capture: {len(slices)} slices, "
        f"{sum(item['durationSec'] for item in slices):.1f}s recorded"
    )


if __name__ == "__main__":
    main()
