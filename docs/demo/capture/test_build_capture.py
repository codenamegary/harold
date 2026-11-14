#!/usr/bin/env python3
"""Prove the capture sync math and the schema v2 shape without a device.

Every test builds a synthetic slice with ffmpeg (a bright pre-roll, a black
head-blink at a known time, moving content, then a black tail-blink), writes a
synthetic marks.log with two sync_wake rows and slices.json, and runs the real
builder: real blackdetect, real signalstats cross-check, real head trim, real
tail cut, real CFR 60 re-encode, real frozen-tail motion guard. No adb, no
emulator, no captured footage.

Run from anywhere:

    python3 -m unittest discover -s docs/demo/capture -p 'test_build_capture.py' -v
    python3 docs/demo/capture/test_build_capture.py
"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_capture  # noqa: E402

WIDTH = 320
HEIGHT = 640
SOURCE_FPS = 30
FRAME_TOLERANCE = 1.0 / SOURCE_FPS

PRE_SEC = 1.2
BLACK_SEC = 0.4
POST_SEC = 2.4
TAIL_BLACK_SEC = 0.4
TAIL_WHITE_SEC = 0.3
V_END = PRE_SEC + BLACK_SEC  # 1.6, head blink's black_end
TAIL_START = PRE_SEC + BLACK_SEC + POST_SEC  # 4.0, tail blink's black_start
RAW_SEC = TAIL_START + TAIL_BLACK_SEC + TAIL_WHITE_SEC  # 4.7
TRIM_SEC = V_END + build_capture.GUARD_SEC  # 1.65
PUBLISHED_SEC = TAIL_START - TRIM_SEC  # 2.35, the tail cut lands here

T_WAKE = 100.0
T_WAKE_2 = 102.8
STARTED = 99.4
ENDED = 103.0
SYNC_OFFSET_SEC = V_END + STARTED - T_WAKE  # 1.0
# k = (tail_end - head_end) / (T_wake_2 - T_wake) = (4.4 - 1.6) / 2.8 = 1.0

TAP_ROWS = [
    ("tap", 100.250, 540, 1610),
    ("tap", 100.900, 120, 240),
]
DEFAULT_LOG = f"""\
sync_wake {T_WAKE:.3f}
tap 100.250 540 1610
key 100.450
key 100.550
key 100.650
key 100.750
keys_done 100.800
tap 100.900 120 240
public_key_authorized 100.950
sync_wake {T_WAKE_2:.3f}
"""


def at_sec(ts):
    """Hand-computed published time: (T - T_wake) * k - GUARD, k = 1."""
    return (ts - T_WAKE) - build_capture.GUARD_SEC


def make_video(path, segments):
    """Concat lavfi segments into one CFR 30 screenrecord stand-in."""
    args = ["ffmpeg", "-v", "error", "-y"]
    for segment in segments:
        args += ["-f", "lavfi", "-i", segment]
    labels = "".join(f"[{index}:v]" for index in range(len(segments)))
    args += [
        "-filter_complex",
        f"{labels}concat=n={len(segments)}:v=1:a=0,format=yuv420p",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20",
        "-pix_fmt", "yuv420p", str(path),
    ]
    subprocess.run(args, check=True, capture_output=True)


def standard_segments(pre=PRE_SEC, black=BLACK_SEC, post=POST_SEC,
                      tail_black=TAIL_BLACK_SEC, tail_white=TAIL_WHITE_SEC):
    """Head blink, moving content, tail blink, and a post-wake sliver."""
    return [
        f"color=c=white:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={pre}",
        f"color=c=black:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={black}",
        f"testsrc2=s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={post}",
        f"color=c=black:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={tail_black}",
        f"color=c=white:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={tail_white}",
    ]


class Fixture:
    """A throwaway work/ + public/ pair holding one synthetic slice."""

    def __init__(self, root: Path):
        self.root = root
        self.work = root / "work"
        self.public = root / "public"
        (self.work / "slices").mkdir(parents=True, exist_ok=True)
        self.public.mkdir(parents=True, exist_ok=True)

    def add_slice(self, segments=None, *, log=DEFAULT_LOG, started=STARTED,
                  ended=ENDED, name="demo_slice", filename="001-demo_slice.mp4"):
        make_video(self.work / "slices" / filename, segments or standard_segments())
        (self.work / "marks.log").write_text(log)
        manifest = [
            {
                "index": 1,
                "name": name,
                "file": filename,
                "started": started,
                "ended": ended,
            }
        ]
        (self.work / "slices.json").write_text(json.dumps(manifest, indent=2) + "\n")

    def build(self, **kwargs):
        return build_capture.build(self.work, self.public, verbose=False, **kwargs)

    def capture(self):
        return json.loads((self.public / "capture.json").read_text())

    def capture_bytes(self):
        return (self.public / "capture.json").read_bytes()


class SyncMathTest(unittest.TestCase):
    def setUp(self):
        self._temp = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp.cleanup)
        self.fixture = Fixture(Path(self._temp.name))
        self.fixture.add_slice()

    def test_offsets_trim_and_duration(self):
        payload = self.fixture.build()
        slice_ = payload["slices"][0]

        self.assertAlmostEqual(slice_["trimSec"], TRIM_SEC, delta=FRAME_TOLERANCE)
        self.assertAlmostEqual(
            slice_["syncOffsetSec"], SYNC_OFFSET_SEC, delta=FRAME_TOLERANCE
        )
        self.assertAlmostEqual(
            slice_["durationSec"], PUBLISHED_SEC, delta=FRAME_TOLERANCE
        )
        self.assertAlmostEqual(slice_["driftRate"], 1.0, delta=FRAME_TOLERANCE)
        self.assertFalse(slice_["still"])
        self.assertEqual((slice_["width"], slice_["height"]), (WIDTH, HEIGHT))
        self.assertEqual(payload["width"], WIDTH)
        self.assertEqual(payload["height"], HEIGHT)
        self.assertEqual(slice_["file"], "slices/001-demo_slice.mp4")
        self.assertEqual(slice_["name"], "demo_slice")

    def test_every_at_sec_matches_the_hand_computed_clock(self):
        slice_ = self.fixture.build()["slices"][0]

        self.assertEqual(len(slice_["taps"]), 2)
        self.assert_times(
            [tap["atSec"] for tap in slice_["taps"]],
            [at_sec(100.250), at_sec(100.900)],
        )
        self.assert_times(
            [key["atSec"] for key in slice_["keys"]],
            [at_sec(ts) for ts in (100.450, 100.550, 100.650, 100.750)],
        )
        self.assertEqual(
            [mark["name"] for mark in slice_["marks"]],
            ["keys_done", "public_key_authorized"],
        )
        self.assert_times(
            [mark["atSec"] for mark in slice_["marks"]],
            [at_sec(100.800), at_sec(100.950)],
        )
        for value in [tap["atSec"] for tap in slice_["taps"]] + [
            key["atSec"] for key in slice_["keys"]
        ] + [mark["atSec"] for mark in slice_["marks"]]:
            self.assertGreaterEqual(value, 0.0)
            self.assertLessEqual(value, slice_["durationSec"] + 1e-9)
            self.assertAlmostEqual(
                value, round(value, build_capture.FLOAT_DIGITS), places=9
            )

    def assert_times(self, actual, expected):
        self.assertEqual(len(actual), len(expected))
        for got, want in zip(actual, expected):
            self.assertAlmostEqual(got, want, places=build_capture.FLOAT_DIGITS)

    def test_published_first_frame_is_post_wake_and_tail_is_cut(self):
        self.fixture.build()
        published = self.fixture.public / "slices" / "001-demo_slice.mp4"
        raw = self.fixture.work / "slices" / "001-demo_slice.mp4"
        self.assertTrue(published.exists())
        published_meta = build_capture.probe(published)
        raw_meta = build_capture.probe(raw)
        self.assertEqual(published_meta["width"], raw_meta["width"])
        # The published file ends at the tail blink's black start.
        self.assertAlmostEqual(
            published_meta["duration"], PUBLISHED_SEC, delta=FRAME_TOLERANCE
        )
        # The head trim really removed trimSec, within one source frame.
        self.assertAlmostEqual(
            raw_meta["duration"] - published_meta["duration"],
            RAW_SEC - TAIL_START + TRIM_SEC,
            delta=FRAME_TOLERANCE,
        )
        # The raw file has exactly the calibration blinks ...
        raw_luma_start, _ = build_capture.detect_luma_edges(raw)
        self.assertAlmostEqual(
            raw_luma_start, PRE_SEC, delta=FRAME_TOLERANCE
        )
        # ... and the published file has none: both blinks are cut off.
        with self.assertRaises(build_capture.BuildError) as caught:
            build_capture.detect_luma_edges(published)
        self.assertIn("no black frames", str(caught.exception))

    def test_output_is_byte_identical_on_rebuild(self):
        self.fixture.build()
        first = self.fixture.capture_bytes()
        self.fixture.build()
        second = self.fixture.capture_bytes()
        self.assertEqual(first, second)

    def test_read_taps_still_yields_only_taps_with_device_pixels(self):
        marks = self.fixture.work / "marks.log"
        events = build_capture.read_events(marks)
        self.assertEqual([event.kind for event in events].count("key"), 4)
        self.assertEqual(
            build_capture.read_taps(marks),
            [(100.250, 540, 1610), (100.900, 120, 240)],
        )
        self.assertEqual(
            [event.kind for event in events if event.kind == "tap"], ["tap", "tap"]
        )

    def test_typing_summary_reports_the_cadence(self):
        self.fixture.build()
        keys = self.fixture.capture()["slices"][0]["keys"]
        window = keys[-1]["atSec"] - keys[0]["atSec"]
        self.assertAlmostEqual(window, 0.300, places=3)
        cadence = (len(keys) - 1) / window
        self.assertGreater(cadence, 0)

    def test_healthy_tail_passes_with_a_late_event(self):
        self.fixture.add_slice(
            standard_segments(),
            log=DEFAULT_LOG + f"tap {T_WAKE + 2.300:.3f} 10 10\n",
        )
        # The last event maps to 2.25s; the picture moves until the tail cut
        # at 2.35s. No frozen tail, and the build must not raise.
        payload = self.fixture.build()
        self.assertEqual(len(payload["slices"]), 1)


class HardFailTest(unittest.TestCase):
    def setUp(self):
        self._temp = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp.cleanup)
        self.fixture = Fixture(Path(self._temp.name))

    def test_no_black_run_fails(self):
        self.fixture.add_slice(
            [
                f"color=c=white:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={PRE_SEC}",
                f"testsrc2=s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={POST_SEC}",
            ]
        )
        with self.assertRaises(build_capture.BuildError) as caught:
            self.fixture.build()
        self.assertIn("exactly two black calibration runs", str(caught.exception))
        self.assertIn("found 0", str(caught.exception))

    def test_three_black_runs_fail(self):
        self.fixture.add_slice(
            [
                f"color=c=white:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={PRE_SEC}",
                f"color=c=black:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={BLACK_SEC}",
                f"testsrc2=s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d=0.6",
                f"color=c=black:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={BLACK_SEC}",
                f"testsrc2=s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d=0.6",
                f"color=c=black:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={BLACK_SEC}",
                f"color=c=white:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d=0.3",
            ]
        )
        with self.assertRaises(build_capture.BuildError) as caught:
            self.fixture.build()
        self.assertIn("found 3", str(caught.exception))

    def test_head_black_run_too_short_fails(self):
        self.fixture.add_slice(standard_segments(black=0.12))
        with self.assertRaises(build_capture.BuildError) as caught:
            self.fixture.build()
        self.assertIn("calibration minimum", str(caught.exception))

    def test_tail_black_run_too_short_fails(self):
        self.fixture.add_slice(standard_segments(tail_black=0.12))
        with self.assertRaises(build_capture.BuildError) as caught:
            self.fixture.build()
        self.assertIn("tail blink black run", str(caught.exception))

    def test_detector_disagreement_fails(self):
        self.fixture.add_slice()

        def disagreeing_edges(_path):
            return build_capture.SyncEdges(
                head_start=PRE_SEC,
                head_end=V_END,
                tail_start=TAIL_START,
                tail_end=TAIL_START + TAIL_BLACK_SEC,
                luma_head_start=PRE_SEC,
                luma_head_end=V_END,
                luma_tail_start=TAIL_START,
                luma_tail_end=TAIL_START + TAIL_BLACK_SEC + 0.30,
            )

        with self.assertRaises(build_capture.BuildError) as caught:
            self.fixture.build(edges_provider=disagreeing_edges)
        self.assertIn("detectors disagree", str(caught.exception))

    def test_sync_offset_below_zero_fails(self):
        self.fixture.add_slice(started=T_WAKE - 3.0)
        with self.assertRaises(build_capture.BuildError) as caught:
            self.fixture.build()
        self.assertIn("syncOffsetSec", str(caught.exception))

    def test_sync_offset_above_range_fails(self):
        self.fixture.add_slice(started=T_WAKE)
        with self.assertRaises(build_capture.BuildError) as caught:
            self.fixture.build()
        self.assertIn("outside", str(caught.exception))

    def test_drift_below_floor_fails(self):
        # The tail blink arrives 0.8s of video after the head blink's wake,
        # but the driver clock says 2.8s: the timeline ran at 0.71x speed.
        self.fixture.add_slice(
            [
                f"color=c=white:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={PRE_SEC}",
                f"color=c=black:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={BLACK_SEC}",
                f"testsrc2=s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d=1.6",
                f"color=c=black:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={TAIL_BLACK_SEC}",
                f"color=c=white:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d=0.3",
            ]
        )
        with self.assertRaises(build_capture.BuildError) as caught:
            self.fixture.build()
        message = str(caught.exception)
        self.assertIn("drift rate", message)
        self.assertIn("shorten or split", message)

    def test_drift_above_ceiling_fails(self):
        # The tail blink arrives 3.8s of video after the head blink's wake
        # against 2.8s of driver clock: the timeline claims to outpace wall.
        self.fixture.add_slice(
            [
                f"color=c=white:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={PRE_SEC}",
                f"color=c=black:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={BLACK_SEC}",
                f"testsrc2=s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d=3.4",
                f"color=c=black:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={TAIL_BLACK_SEC}",
                f"color=c=white:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d=0.3",
            ]
        )
        with self.assertRaises(build_capture.BuildError) as caught:
            self.fixture.build()
        self.assertIn("drift rate", str(caught.exception))

    def test_unclosed_key_run_fails(self):
        self.fixture.add_slice(
            log=f"""\
sync_wake {T_WAKE:.3f}
key 100.450
key 100.550
public_key_authorized 100.950
sync_wake {T_WAKE_2:.3f}
"""
        )
        with self.assertRaises(build_capture.BuildError) as caught:
            self.fixture.build()
        self.assertIn("not closed by a keys_done", str(caught.exception))

    def test_missing_sync_wake_fails(self):
        self.fixture.add_slice(
            log="""\
tap 100.250 540 1610
"""
        )
        with self.assertRaises(build_capture.BuildError) as caught:
            self.fixture.build()
        self.assertIn("exactly two sync_wake", str(caught.exception))

    def test_single_sync_wake_fails(self):
        # One wake means the tail blink never happened: the drift rate is
        # unmeasurable and the tail cut has no anchor.
        self.fixture.add_slice(log=DEFAULT_LOG.rsplit("sync_wake", 1)[0])
        with self.assertRaises(build_capture.BuildError) as caught:
            self.fixture.build()
        self.assertIn("exactly two sync_wake", str(caught.exception))

    def test_at_sec_out_of_range_fails(self):
        self.fixture.add_slice(
            log=DEFAULT_LOG + "late_mark 103.200\n",
            ended=103.300,
        )
        with self.assertRaises(build_capture.BuildError) as caught:
            self.fixture.build()
        self.assertIn("outside [0,", str(caught.exception))

    def test_failed_build_keeps_the_previous_published_file(self):
        published = self.fixture.public / "slices" / "001-demo_slice.mp4"
        published.parent.mkdir(parents=True, exist_ok=True)
        published.write_bytes(b"previous good slice")
        self.fixture.add_slice(standard_segments(black=0.12))
        with self.assertRaises(build_capture.BuildError):
            self.fixture.build()
        self.assertEqual(published.read_bytes(), b"previous good slice")

    def test_fast_typing_is_kept(self):
        self.fixture.add_slice(
            log=f"""\
sync_wake {T_WAKE:.3f}
key 100.450
key 100.470
key 100.490
key 100.510
keys_done 100.560
sync_wake {T_WAKE_2:.3f}
"""
        )
        payload = self.fixture.build()
        self.assertEqual(len(payload["slices"][0]["keys"]), 4)

    def test_frozen_tail_fails_with_slice_name_and_gap(self):
        # Moving content stops at raw 2.6s; a static colour holds until the
        # tail blink. A tap mapping to 2.85s sits 1.90s past the last moving
        # picture and must be rejected, naming the slice and the gap.
        segments = [
            f"color=c=white:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={PRE_SEC}",
            f"color=c=black:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={BLACK_SEC}",
            f"testsrc2=s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d=1.0",
            f"color=c=0x202020:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d=2.0",
            f"color=c=black:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={TAIL_BLACK_SEC}",
            f"color=c=white:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d=0.3",
        ]
        self.fixture.add_slice(
            segments,
            log=(
                f"sync_wake {T_WAKE:.3f}\n"
                f"tap 102.900 10 10\n"
                f"sync_wake 103.400\n"
            ),
            ended=103.6,
        )
        with self.assertRaises(build_capture.BuildError) as caught:
            self.fixture.build()
        message = str(caught.exception)
        self.assertIn("frozen tail", message)
        self.assertIn("demo_slice", message)
        self.assertIn("1.9", message)


SCRIM_HEX = "0x0d0d0d"  # RGB 13/13/13 encodes to YAVG 27: dark, and not black


class BlackFrameDefinitionTest(unittest.TestCase):
    """Dark theme UI is dark, not black.

    Regression for the 008-new_session build failure. Its scrim measures YAVG
    26.64 (the 013 changes scrim 26.10, the 010 question scrim 29.10) and the
    old test - mean luma <= 32, blackdetect pix_th = 0.10 - called all of them
    black, so the frame sampler located a blink where blackdetect saw the UI.
    """

    def setUp(self):
        self._temp = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp.cleanup)
        self.fixture = Fixture(Path(self._temp.name))

    def scrim_segments(self):
        """Blink, moving UI, a dark scrim, moving UI, blink, post-wake sliver.

        The scrim sits alone between moving picture at 1.6..2.4s and
        3.4..4.0s, so a detector that reads it as black reports a third run
        instead of silently merging it into a blink.
        """
        return [
            f"color=c=white:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={PRE_SEC}",
            f"color=c=black:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={BLACK_SEC}",
            f"testsrc2=s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d=0.8",
            f"color=c={SCRIM_HEX}:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d=1.0",
            f"testsrc2=s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d=0.6",
            f"color=c=black:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={TAIL_BLACK_SEC}",
            f"color=c=white:s={WIDTH}x{HEIGHT}:r={SOURCE_FPS}:d={TAIL_WHITE_SEC}",
        ]

    def test_dark_scrim_is_not_a_black_blink(self):
        self.fixture.add_slice(self.scrim_segments())
        raw = self.fixture.work / "slices" / "001-demo_slice.mp4"

        # YAVG 27 for a whole second is the scrim, not the display going off.
        runs = build_capture.detect_luma_runs(raw)
        self.assertEqual(len(runs), 2, f"the scrim was read as a blink: {runs}")
        (head_start, head_end), (tail_start, tail_end) = runs
        self.assertAlmostEqual(head_start, PRE_SEC, delta=FRAME_TOLERANCE)
        self.assertAlmostEqual(head_end, V_END, delta=FRAME_TOLERANCE)
        self.assertAlmostEqual(tail_start, TAIL_START, delta=FRAME_TOLERANCE)
        self.assertAlmostEqual(
            tail_end, TAIL_START + TAIL_BLACK_SEC, delta=FRAME_TOLERANCE
        )

        # blackdetect must not see the scrim either, so both detectors agree.
        self.assertEqual(
            len(build_capture.detect_black_intervals(raw)),
            2,
            f"blackdetect read the scrim as a blink: {raw}",
        )

        slice_ = self.fixture.build()["slices"][0]
        # The head trim lands on the true blink's end, not on the scrim's.
        self.assertAlmostEqual(slice_["trimSec"], TRIM_SEC, delta=FRAME_TOLERANCE)
        self.assertAlmostEqual(
            slice_["durationSec"], PUBLISHED_SEC, delta=FRAME_TOLERANCE
        )

    def test_frame_black_requires_coverage_not_only_a_low_mean(self):
        self.assertTrue(build_capture.frame_is_black({"YAVG": 16.16, "YHIGH": 16.0}))
        # The 008/013 scrim: a low mean with lit pixels in it.
        self.assertFalse(
            build_capture.frame_is_black({"YAVG": 26.64, "YHIGH": 29.0})
        )
        # A low mean cannot rescue a frame whose top decile is bright.
        self.assertFalse(build_capture.frame_is_black({"YAVG": 19.0, "YHIGH": 64.0}))
        self.assertFalse(build_capture.frame_is_black({}))


class ParserTest(unittest.TestCase):
    def test_blackdetect_lines(self):
        text = (
            "[blackdetect @ 0x55] black_start:1.2 black_end:1.6 "
            "black_duration:0.4\n"
            "[blackdetect @ 0x55] black_start:3.0 black_end:3.4 "
            "black_duration:0.4\n"
        )
        self.assertEqual(
            build_capture.parse_blackdetect(text), [(1.2, 1.6), (3.0, 3.4)]
        )

    def test_luma_samples(self):
        text = (
            "frame:0    pts:0       pts_time:0\n"
            "lavfi.signalstats.YAVG=235.000000\n"
            "frame:1    pts:1       pts_time:0.033333\n"
            "lavfi.signalstats.YAVG=16.000000\n"
        )
        self.assertEqual(
            build_capture.parse_luma(text), [(0.0, 235.0), (0.033333, 16.0)]
        )

    def test_ydif_samples(self):
        text = (
            "frame:0    pts:0       pts_time:0\n"
            "lavfi.signalstats.YDIF=0.000000\n"
            "frame:1    pts:1       pts_time:0.033333\n"
            "lavfi.signalstats.YDIF=2.412019\n"
        )
        self.assertEqual(
            build_capture.parse_ydif(text), [(0.0, 0.0), (0.033333, 2.412019)]
        )

    def test_last_moving_pts_ignores_frozen_frames(self):
        samples = [(0.0, 0.0), (0.5, 2.4), (1.0, 0.0), (1.5, 0.1), (2.0, 0.0)]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "unused"
            original = build_capture.detect_motion_samples
            build_capture.detect_motion_samples = lambda _path: samples
            try:
                self.assertEqual(build_capture.last_moving_pts(path), 0.5)
            finally:
                build_capture.detect_motion_samples = original

    def test_read_events_grammar(self):
        with tempfile.TemporaryDirectory() as directory:
            marks = Path(directory) / "marks.log"
            marks.write_text(
                "slice_start_demo 1.000\n"
                "sync_wake 1.500\n"
                "tap 1.600 540 1610\n"
                "key 1.700\n"
                "keys_done 1.800\n"
                "sync_wake 3.500\n"
                "slice_end_demo 3.900\n"
            )
            events = build_capture.read_events(marks)
        self.assertEqual(
            [event.kind for event in events],
            ["mark", "sync_wake", "tap", "key", "mark", "sync_wake", "mark"],
        )
        self.assertEqual(build_capture.taps_of(events), [(1.600, 540, 1610)])


if __name__ == "__main__":
    unittest.main(verbosity=2)
