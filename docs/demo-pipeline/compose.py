#!/usr/bin/env python3
"""Compose the Harold README demo video from the terminal + phone captures.

Layout:
  0. title card
  1. terminal full-frame      (serve -> status -> pair -> QR)
  2. split screen             (terminal left, phone right: scan -> pair)
  3. phone full-frame         (new session -> selectors -> prompt -> reply)

Jump cuts:
  --term-cut-start/--term-cut-end drop dead time from the terminal segment
  --cut-start/--cut-end drop dead time from the split (both panes together)

Timing anchors are visual (seconds within each source clip):
  --t-qr    terminal clip: frame where the pairing QR appears
  --t-dp    terminal clip: frame where "Device paired." appears
  --t-chat  phone clip:    frame where the scanner -> chat transition lands
"""
import argparse
import json
import subprocess
import sys

FRAME = "yuv420p"
BG = "0x080A0D"
LIME = "0xB6F36B"
MUTED = "0x8C96A5"


def probe_duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "json", path],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(out.stdout)["format"]["duration"])


def terminal_chunk(index, start, end):
    return (
        f"[1:v]setpts=PTS-STARTPTS,trim={start}:{end},setpts=PTS-STARTPTS,"
        f"scale=1920:982,pad=1920:1080:0:49:color={BG},setsar=1,fps=30[t{index}]"
    )


def split_chunk(index, term_start, term_end, phone_start, phone_end):
    length = term_end - term_start
    return (
        f"[1:v]setpts=PTS-STARTPTS,trim={term_start}:{term_end},setpts=PTS-STARTPTS,"
        f"scale=1300:665,setsar=1,fps=30[tm{index}];"
        f"[2:v]setpts=PTS-STARTPTS,trim={phone_start}:{phone_end},setpts=PTS-STARTPTS,"
        f"scale=607:1080,setsar=1,fps=30[ph{index}];"
        f"[0:v]trim=0:{length},setpts=PTS-STARTPTS,format={FRAME}[sbg{index}];"
        f"[sbg{index}][tm{index}]overlay=10:207:format=auto[s{index}a];"
        f"[s{index}a][ph{index}]overlay=1313:0:format=auto"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--terminal", default="/tmp/opencode/media/terminal-pair.mp4")
    parser.add_argument("--phone", default="/tmp/opencode/media/phone-cfr.mp4")
    parser.add_argument("--out", default="/tmp/opencode/media/harold-demo.mp4")
    parser.add_argument("--card-seconds", type=float, default=2.5)
    parser.add_argument("--terminal-start", type=float, default=0.4)
    parser.add_argument("--t-qr", type=float, required=True)
    parser.add_argument("--t-dp", type=float, required=True)
    parser.add_argument("--t-chat", type=float, required=True)
    parser.add_argument("--split-lead", type=float, default=1.0)
    parser.add_argument("--dp-extra", type=float, default=3.0)
    parser.add_argument("--term-cut-start", type=float, default=None)
    parser.add_argument("--term-cut-end", type=float, default=None)
    parser.add_argument("--cut-start", type=float, default=None)
    parser.add_argument("--cut-end", type=float, default=None)
    parser.add_argument("--phone-speed", type=float, default=1.0,
                        help="playback speed for the phone segment")
    parser.add_argument("--tail", type=float, default=1.0)
    parser.add_argument("--hold-end", type=float, default=0.0,
                        help="seconds to freeze the final frame of the phone segment")
    parser.add_argument("--crf", default="20")
    args = parser.parse_args()

    term_duration = probe_duration(args.terminal)
    phone_duration = probe_duration(args.phone)

    t0 = args.t_qr + args.split_lead
    t1 = args.t_dp + args.dp_extra
    span = t1 - t0
    p0 = args.t_chat - args.t_dp - 0.5 + t0
    if p0 < 0:
        print(f"warning: phone split offset {p0:.2f}s < 0", file=sys.stderr)
        p0 = 0.0
    seg_c_start = p0 + span
    seg_c_end = min(phone_duration - args.tail, seg_c_start + 75.0)

    print(f"terminal duration {term_duration:.2f}s  phone {phone_duration:.2f}s")
    print(f"card          0 .. {args.card_seconds}")
    if args.term_cut_start is not None and args.term_cut_end is not None:
        print(f"term seg      {args.terminal_start}..{args.term_cut_start} + "
              f"{args.term_cut_end}..{t0:.2f}")
    else:
        print(f"term seg      {args.terminal_start} .. {t0:.2f}")
    print(f"split         term {t0:.2f}..{t1:.2f}  phone {p0:.2f}..{seg_c_start:.2f}")
    if args.cut_start is not None and args.cut_end is not None:
        print(f"split cut     drops {args.cut_start:.2f}..{args.cut_end:.2f} of the split")
    phone_play = (seg_c_end - seg_c_start) / args.phone_speed
    print(f"seg C (phone) {seg_c_start:.2f} .. {seg_c_end:.2f} "
          f"at {args.phone_speed:g}x -> {phone_play:.1f}s")

    font_bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    font_book = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

    parts = [
        f"[0:v]trim=0:{args.card_seconds},setpts=PTS-STARTPTS,"
        f"drawtext=fontfile={font_bold}:text='Harold':fontcolor={LIME}:fontsize=120:"
        f"x=(w-text_w)/2:y=(h-text_h)/2-60,"
        f"drawtext=fontfile={font_book}:text='Hark! The Harold Agents Sing':"
        f"fontcolor={MUTED}:fontsize=40:x=(w-text_w)/2:y=(h-text_h)/2+70,"
        f"format={FRAME},fps=30[card]",
    ]

    seg_a_labels = []
    if args.term_cut_start is not None and args.term_cut_end is not None:
        parts.append(terminal_chunk(0, args.terminal_start, args.term_cut_start))
        parts.append(terminal_chunk(1, args.term_cut_end, t0))
        seg_a_labels = ["[t0]", "[t1]"]
    else:
        parts.append(terminal_chunk(0, args.terminal_start, t0))
        seg_a_labels = ["[t0]"]

    split_labels = []
    if args.cut_start is None or args.cut_end is None:
        parts.append(split_chunk(0, t0, t1, p0, seg_c_start) + "[segb]")
        split_labels = ["[segb]"]
    else:
        parts.append(split_chunk(0, t0, t0 + args.cut_start,
                                 p0, p0 + args.cut_start) + "[segb0]")
        parts.append(split_chunk(1, t0 + args.cut_end, t1,
                                 p0 + args.cut_end, seg_c_start) + "[segb1]")
        split_labels = ["[segb0]", "[segb1]"]

    hold = f",tpad=stop_mode=clone:stop_duration={args.hold_end}" if args.hold_end > 0 else ""
    parts.append(
        f"[2:v]setpts=PTS-STARTPTS,trim={seg_c_start}:{seg_c_end},"
        f"setpts=(PTS-STARTPTS)/{args.phone_speed},"
        f"scale=-2:1080,pad=1920:1080:(ow-iw)/2:0:color={BG},setsar=1,fps=30{hold}[segc]"
    )

    concat_inputs = "[card]" + "".join(seg_a_labels + split_labels) + "[segc]"
    # card + terminal chunks + split chunks + segc
    concat_count = 1 + len(seg_a_labels) + len(split_labels) + 1
    parts.append(f"{concat_inputs}concat=n={concat_count}:v=1:a=0,format={FRAME}[outv]")

    filter_complex = ";".join(parts)

    command = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"color=c={BG}:s=1920x1080:r=30:d=300",
        "-i", args.terminal,
        "-i", args.phone,
        "-filter_complex", filter_complex,
        "-map", "[outv]",
        "-c:v", "libx264", "-crf", args.crf, "-preset", "medium",
        "-pix_fmt", FRAME, "-movflags", "+faststart",
        args.out,
    ]
    print("running ffmpeg...")
    subprocess.run(command, check=True)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
