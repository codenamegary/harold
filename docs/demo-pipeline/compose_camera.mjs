#!/usr/bin/env node
/**
 * Build the emulator camera feed from the staged clip.
 *
 * The videofile camera stretches whatever file it gets onto its native 4:3
 * streams (preview 1280x960, analysis 640x480), and the app rotates the
 * preview 90 degrees clockwise (sensor orientation 90). So the source is
 * probed, rotated 90 degrees counter-clockwise, and cover-cropped onto a
 * 1280x960 canvas: the viewfinder shows the scene upright, filling the
 * frame, with no aspect distortion.
 *
 * With a QR argument, the live pairing QR is overlaid on the tracked panel
 * position - but only after QR_AFTER_SECONDS of feed time. The first 40
 * seconds play the clip untouched: the warm pass (25s of wall clock) scans
 * that inert footage and finds nothing, so it burns no pairing code (codes
 * are single-use) and triggers no decode-failure retry loop. The recorded
 * run reaches the QR region and pairs on camera. The tracker expects the
 * original 1920x1080 clip; the panel settles after its opening drift, and
 * the overlay uses that settled box.
 *
 * Usage: node compose_camera.mjs <source.mp4> [qr.png] <out.mp4>
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const args = process.argv.slice(2)
let source, qrPath, outPath
if (args.length === 2) {
  ;[source, outPath] = args
} else if (args.length === 3) {
  ;[source, qrPath, outPath] = args
} else {
  console.error("usage: compose_camera.mjs <source.mp4> [qr.png] <out.mp4>")
  process.exit(2)
}

const W = 1920
const H = 1080
const FPS = 30
const DET_W = 480
const DET_H = 270
const SCALE = W / DET_W
const WHITE = 200
const TAIL_SECONDS = 120

// The camera canvas: videofile frames are stretched onto the native 4:3
// streams, so the file must already be 4:3 or the preview squashes.
const CAM_W = 1280
const CAM_H = 960
const GEOMETRY = `transpose=2,scale=${CAM_W}:${CAM_H}:force_original_aspect_ratio=increase,crop=${CAM_W}:${CAM_H}`
const ENCODE = [
  "-an",
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "18",
  "-profile:v",
  "main",
  "-level",
  "4.0",
  "-pix_fmt",
  "yuv420p",
]
const TAIL = `tpad=stop_mode=clone:stop_duration=${TAIL_SECONDS}`

// Feed seconds before the live QR appears. The warm pass scans for 25s of
// wall clock, so playback never reaches this during warm.
const QR_AFTER_SECONDS = 40

const runFfmpeg = (args) => {
  const result = spawnSync("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] })
  if (result.status !== 0) {
    console.error(`compose_camera: ffmpeg failed: ffmpeg ${args.join(" ")}`)
    process.exit(1)
  }
}

const probe = spawnSync(
  "ffprobe",
  [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    source,
  ],
  { encoding: "utf8" },
)
const [srcW, srcH] = (probe.stdout ?? "").trim().split(",").map(Number)
if (probe.status !== 0 || !srcW || !srcH) {
  console.error("compose_camera: could not probe source dimensions")
  process.exit(1)
}

// QR-free sources of any aspect take the straight geometry pass.
if (!qrPath) {
  runFfmpeg([
    "-v",
    "error",
    "-y",
    "-i",
    source,
    "-vf",
    `${GEOMETRY},${TAIL}`,
    ...ENCODE,
    "-movflags",
    "+faststart",
    outPath,
  ])
  console.log(`compose_camera: ${srcW}x${srcH} -> ${CAM_W}x${CAM_H} -> ${outPath}`)
  process.exit(0)
}

if (srcW !== W || srcH !== H) {
  console.error(`compose_camera: QR paste expects a ${W}x${H} source, got '${srcW}x${srcH}'`)
  process.exit(1)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "harold-camera-"))
try {
  const grayPath = path.join(tmp, "gray.raw")
  runFfmpeg([
    "-v",
    "error",
    "-y",
    "-i",
    source,
    "-vf",
    `scale=${DET_W}:${DET_H}`,
    "-pix_fmt",
    "gray",
    "-f",
    "rawvideo",
    grayPath,
  ])

  const grayBytes = DET_W * DET_H
  const gray = fs.readFileSync(grayPath)
  const frameCount = Math.floor(gray.length / grayBytes)

  // Largest square-ish white blob near the middle of the frame = QR panel.
  const detectPanel = (frame) => {
    const mask = new Uint8Array(grayBytes)
    for (let i = 0; i < grayBytes; i++) mask[i] = frame[i] > WHITE ? 1 : 0
    const seen = new Uint8Array(grayBytes)
    let best = null
    for (let i = 0; i < grayBytes; i++) {
      if (!mask[i] || seen[i]) continue
      const stack = [i]
      seen[i] = 1
      let area = 0
      let x1 = DET_W
      let y1 = DET_H
      let x2 = 0
      let y2 = 0
      while (stack.length) {
        const p = stack.pop()
        area++
        const x = p % DET_W
        const y = (p / DET_W) | 0
        if (x < x1) x1 = x
        if (x > x2) x2 = x
        if (y < y1) y1 = y
        if (y > y2) y2 = y
        if (x > 0 && mask[p - 1] && !seen[p - 1]) {
          seen[p - 1] = 1
          stack.push(p - 1)
        }
        if (x < DET_W - 1 && mask[p + 1] && !seen[p + 1]) {
          seen[p + 1] = 1
          stack.push(p + 1)
        }
        if (y > 0 && mask[p - DET_W] && !seen[p - DET_W]) {
          seen[p - DET_W] = 1
          stack.push(p - DET_W)
        }
        if (y < DET_H - 1 && mask[p + DET_W] && !seen[p + DET_W]) {
          seen[p + DET_W] = 1
          stack.push(p + DET_W)
        }
      }
      const w = x2 - x1 + 1
      const h = y2 - y1 + 1
      const aspect = w / h
      if (area < 2000 || aspect < 0.8 || aspect > 1.3) continue
      if (!best || area > best.area) best = { area, x1, y1, x2, y2 }
    }
    if (!best) return null
    return [
      Math.max(0, best.x1 * SCALE),
      Math.max(0, best.y1 * SCALE),
      Math.min(W, (best.x2 + 1) * SCALE),
      Math.min(H, (best.y2 + 1) * SCALE),
    ]
  }

  let lastBox = null
  for (let f = 0; f < frameCount; f++) {
    const box = detectPanel(gray.subarray(f * grayBytes, (f + 1) * grayBytes)) ?? lastBox
    if (box) lastBox = box
  }
  if (!lastBox) {
    console.error("compose_camera: QR panel not found in source")
    process.exit(1)
  }

  // Source box -> canvas coords. transpose=2 (90 CCW) maps source (x, y)
  // to rotated (y, W - x), then the cover scale k widens the rotated frame
  // to CAM_W, then the crop takes the middle CAM_H band.
  const k = CAM_W / srcH
  const cropY = (srcW * k - CAM_H) / 2
  const [sx1, sy1, sx2, sy2] = lastBox
  const box = [
    Math.round(sy1 * k),
    Math.round((srcW - sx2) * k - cropY),
    Math.round(sy2 * k),
    Math.round((srcW - sx1) * k - cropY),
  ]
  const bw = Math.max(8, box[2] - box[0])
  const bh = Math.max(8, box[3] - box[1])
  console.error(`compose_camera: panel at ${box.join(",")} (${bw}x${bh})`)

  const totalSeconds = Math.ceil(frameCount / FPS + TAIL_SECONDS) + 1
  runFfmpeg([
    "-v",
    "error",
    "-y",
    "-i",
    source,
    "-loop",
    "1",
    "-t",
    String(totalSeconds),
    "-i",
    qrPath,
    "-filter_complex",
    `[0:v]${GEOMETRY},${TAIL}[base];` +
      `[1:v]scale=${bw}:${bh}[qr];` +
      `[base][qr]overlay=${box[0]}:${box[1]}:enable='gte(t,${QR_AFTER_SECONDS})':shortest=1[vout]`,
    "-map",
    "[vout]",
    "-shortest",
    ...ENCODE,
    "-movflags",
    "+faststart",
    outPath,
  ])
  console.log(`compose_camera: ${frameCount} frames -> ${outPath}`)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
