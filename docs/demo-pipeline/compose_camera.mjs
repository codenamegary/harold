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
 * With a QR argument, the live pairing QR is first pasted over the QR panel
 * on screen before the geometry pass. The panel drifts through the opening
 * seconds of the clip, so the white panel is tracked per frame (connected
 * component search) and the QR is drawn into it; that path expects the
 * original 1920x1080 clip.
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
  const rawIn = path.join(tmp, "in.rgb")
  const rawOut = path.join(tmp, "out.rgb")
  const grayPath = path.join(tmp, "gray.raw")
  const qrRaw = path.join(tmp, "qr.rgba")

  runFfmpeg(["-v", "error", "-y", "-i", source, "-f", "rawvideo", "-pix_fmt", "rgb24", rawIn])
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
  runFfmpeg(["-v", "error", "-y", "-i", qrPath, "-f", "rawvideo", "-pix_fmt", "rgba", qrRaw])

  const frameBytes = W * H * 3
  const grayBytes = DET_W * DET_H
  const gray = fs.readFileSync(grayPath)
  const qr = fs.readFileSync(qrRaw)
  const qrSize = Math.round(Math.sqrt(qr.length / 4))
  const frameCount = Math.floor(fs.statSync(rawIn).size / frameBytes)

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

  const inFd = fs.openSync(rawIn, "r")
  const outFd = fs.openSync(rawOut, "w")
  const inFrame = Buffer.allocUnsafe(frameBytes)
  const outFrame = Buffer.allocUnsafe(frameBytes)
  let lastBox = null

  for (let f = 0; f < frameCount; f++) {
    fs.readSync(inFd, inFrame, 0, frameBytes, f * frameBytes)
    const box = detectPanel(gray.subarray(f * grayBytes, (f + 1) * grayBytes)) ?? lastBox
    if (box) lastBox = box
    inFrame.copy(outFrame)
    if (box) {
      const [x1, y1, x2, y2] = box
      const w = x2 - x1
      const h = y2 - y1
      // Erase the staged QR, then paste the live one inside the panel.
      for (let y = Math.max(0, y1 - 2); y < Math.min(H, y2 + 2); y++) {
        outFrame.fill(255, (y * W + Math.max(0, x1 - 2)) * 3, (y * W + Math.min(W, x2 + 2)) * 3)
      }
      const inset = Math.max(2, Math.round(Math.min(w, h) * 0.03))
      const dstW = w - 2 * inset
      const dstH = h - 2 * inset
      const xMap = new Int32Array(dstW)
      for (let x = 0; x < dstW; x++)
        xMap[x] = Math.min(qrSize - 1, Math.floor(((x1 + inset + x - x1) * qrSize) / dstW))
      for (let y = 0; y < dstH; y++) {
        const sy = Math.min(qrSize - 1, Math.floor((y * qrSize) / dstH))
        const srcRow = sy * qrSize * 4
        const dstRow = ((y1 + inset + y) * W + (x1 + inset)) * 3
        for (let x = 0; x < dstW; x++) {
          const s = srcRow + xMap[x] * 4
          const d = dstRow + x * 3
          outFrame[d] = qr[s]
          outFrame[d + 1] = qr[s + 1]
          outFrame[d + 2] = qr[s + 2]
        }
      }
    }
    fs.writeSync(outFd, outFrame, 0, frameBytes)
    if (f % 60 === 0) console.error(`compose_camera: frame ${f}/${frameCount}`)
  }
  fs.closeSync(inFd)
  fs.closeSync(outFd)

  // Rotate the composite onto the camera's 4:3 canvas (counter-clockwise,
  // so the emulator's 90-degree clockwise preview lands upright), then
  // freeze the last frame for the tail.
  runFfmpeg([
    "-v",
    "error",
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    `${W}x${H}`,
    "-r",
    String(FPS),
    "-i",
    rawOut,
    "-vf",
    `${GEOMETRY},${TAIL}`,
    ...ENCODE,
    "-movflags",
    "+faststart",
    outPath,
  ])
  console.log(`compose_camera: ${frameCount} frames -> ${outPath}`)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
