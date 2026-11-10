#!/usr/bin/env python3
"""Check the Google Play store assets and listing copy.

Uses only the Python standard library so CI needs no package install.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
STORE_ROOT = REPO_ROOT / "docs" / "store-android"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
MEGABYTE = 1024 * 1024

failures: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        failures.append(message)


def file_size(name: str, max_bytes: int) -> int:
    path = STORE_ROOT / name
    check(path.is_file(), f"{name} exists")
    if not path.is_file():
        return 0
    size = path.stat().st_size
    check(size > 0, f"{name} is not empty")
    check(size <= max_bytes, f"{name} is at most {max_bytes // MEGABYTE} MB")
    return size


def read_png(name: str) -> tuple[int, int, int]:
    path = STORE_ROOT / name
    check(path.is_file(), f"{name} exists")
    if not path.is_file():
        return 0, 0, -1
    data = path.read_bytes()
    check(data.startswith(PNG_SIGNATURE), f"{name} is a PNG")
    if len(data) < 26:
        return 0, 0, -1
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    return width, height, data[25]


def section(text: str, heading: str) -> str:
    start = text.find(heading)
    check(start >= 0, f"{heading} exists")
    if start < 0:
        return ""
    body_start = start + len(heading)
    end = text.find("\n## ", body_start)
    return text[body_start : end if end >= 0 else None].strip()


def check_icon() -> None:
    name = "app-icon-512x512.png"
    file_size(name, MEGABYTE)
    width, height, color_type = read_png(name)
    check(width == 512, f"{name} is 512 px wide")
    check(height == 512, f"{name} is 512 px high")
    # Play applies the launcher mask itself, so the source icon must be opaque.
    check(color_type not in (4, 6), f"{name} has no alpha channel")


def check_feature_graphic() -> None:
    name = "feature-graphic-1024x500.png"
    file_size(name, 15 * MEGABYTE)
    width, height, _ = read_png(name)
    check(width == 1024, f"{name} is 1024 px wide")
    check(height == 500, f"{name} is 500 px high")


def check_screenshots() -> None:
    files = sorted(STORE_ROOT.glob("phone-*.png"))
    check(2 <= len(files) <= 8, "there are 2 to 8 phone screenshots")
    for path in files:
        name = path.name
        file_size(name, 8 * MEGABYTE)
        width, height, _ = read_png(name)
        check(320 <= width <= 3840, f"{name} width is in the Play range")
        check(320 <= height <= 3840, f"{name} height is in the Play range")
        check(
            width * 16 == height * 9 or width * 9 == height * 16,
            f"{name} is 16:9 or 9:16",
        )


def check_video() -> None:
    video_name = "foreground-service-demo.mp4"
    size = file_size(video_name, 20 * MEGABYTE)
    check(size > 100_000, f"{video_name} is a real recording")
    path = STORE_ROOT / video_name
    if path.is_file():
        with path.open("rb") as video:
            header = video.read(8)
        check(header[4:8] == b"ftyp", f"{video_name} is an MP4")
    readme = (STORE_ROOT / "README.md").read_text()
    listing = (STORE_ROOT / "store-listing.md").read_text()
    for doc_name, text in (("README.md", readme), ("store-listing.md", listing)):
        check(video_name in text, f"{doc_name} references the demo video")


def check_review_access() -> None:
    readme = (STORE_ROOT / "README.md").read_text()
    listing = (STORE_ROOT / "store-listing.md").read_text()
    app_access = section(listing, "## App access for review")
    for name, text in (("README.md", readme), ("app access section", app_access)):
        check("SSH" in text, f"{name} describes connecting over SSH")


def check_listing_copy() -> None:
    listing = (STORE_ROOT / "store-listing.md").read_text()
    for heading in ("App name", "Short description", "Full description"):
        check(heading in listing, f"store listing has a {heading} heading")
    fields = (
        ("## App name (30 characters max)", 30),
        ("## Short description (80 characters max)", 80),
        ("## Full description (4,000 characters max)", 4000),
    )
    for heading, limit in fields:
        value = section(listing, heading)
        check(0 < len(value) <= limit, f"{heading} is 1 to {limit} characters")


def main() -> int:
    for check_fn in (
        check_icon,
        check_feature_graphic,
        check_screenshots,
        check_video,
        check_review_access,
        check_listing_copy,
    ):
        check_fn()
    if failures:
        print("store assets: fail", file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        return 1
    print("store assets: pass")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
