import { useCurrentFrame, useVideoConfig } from "remotion"
import { monoFamily, sansFamily } from "./fonts"
import { Mark } from "./mark"
import { qrModules, qrSize } from "./qr-matrix"
import { promptSegs, type TermItem, type TermSeg } from "./terminal-data"
import { body, dim, lime, lineSoft, panel, termBg } from "./theme"

const FONT_SIZE = 22
const LINE_H = 32
const CHAR_W = FONT_SIZE * 0.6
const BAR_H = 48
const PAD_X = 32
const PAD_Y = 24

// The QR is drawn as squares from the decoded module grid. Three quiet
// modules on each side keep it readable by a phone camera.
const QR_MODULE = 7
const QR_QUIET = 3
const QR_BOX = (qrSize + QR_QUIET * 2) * QR_MODULE

type Visible =
  | { kind: "command"; typed: string; typing: boolean; height: number }
  | { kind: "output"; segs: TermSeg[]; height: number }
  | { kind: "qr"; rows: number; height: number }

const Seg: React.FC<{ seg: TermSeg }> = ({ seg }) => (
  <span
    style={{
      color: seg.color ?? body,
      fontWeight: seg.bold ? 600 : 400,
      whiteSpace: "pre",
    }}
  >
    {seg.text}
  </span>
)

const Prompt: React.FC = () => (
  <>
    {promptSegs.map((seg, index) => (
      <Seg key={index} seg={seg} />
    ))}
  </>
)

const Cursor: React.FC<{ frame: number; fps: number; blink: boolean }> = ({
  frame,
  fps,
  blink,
}) => {
  const on = blink ? Math.floor(frame / (0.53 * fps)) % 2 === 0 : true
  if (!on) {
    return null
  }
  return (
    <span
      style={{
        display: "inline-block",
        width: CHAR_W,
        height: FONT_SIZE,
        background: lime,
        verticalAlign: "text-bottom",
        marginBottom: -2,
      }}
    />
  )
}

const QR_GAP = 4

// White box grows with the revealed rows; the bottom quiet zone lands last.
const qrBoxHeight = (rows: number): number =>
  (QR_QUIET + Math.min(rows, qrSize)) * QR_MODULE + (rows >= qrSize ? QR_QUIET * QR_MODULE : 0)

const qrHeight = (rows: number): number => qrBoxHeight(rows) + QR_GAP * 2

// Revealed one module row at a time, the way the CLI prints it line by line.
const Qr: React.FC<{ rows: number }> = ({ rows }) => {
  const height = qrBoxHeight(rows)
  return (
    <svg
      width={QR_BOX}
      height={height}
      viewBox={`0 0 ${QR_BOX} ${height}`}
      style={{ display: "block", marginTop: QR_GAP, marginBottom: QR_GAP }}
    >
      <rect width={QR_BOX} height={height} rx={6} fill="#FFFFFF" />
      {qrModules
        .slice(0, rows)
        .map((row, y) =>
          row.map((dark, x) =>
            dark ? (
              <rect
                key={`${x}-${y}`}
                x={(x + QR_QUIET) * QR_MODULE}
                y={(y + QR_QUIET) * QR_MODULE}
                width={QR_MODULE}
                height={QR_MODULE}
                fill="#0A0C0E"
              />
            ) : null,
          ),
        )}
    </svg>
  )
}

/**
 * The terminal window. Positioned entirely by its parent (the stage animates
 * it between the close-up, the receded edge, and the split-screen half);
 * `contentZoom` magnifies the transcript onto its last lines, pinned to the
 * bottom, for the pairing scene.
 */
export const Terminal: React.FC<{
  items: TermItem[]
  contentZoom: number
  boxHeight: number
}> = ({ items, contentZoom, boxHeight }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const sec = frame / fps

  const visible: Visible[] = []
  for (const item of items) {
    if (sec < item.at) {
      break
    }
    if (item.kind === "command") {
      const chars = Math.min(item.text.length, Math.floor((sec - item.at) * item.cps))
      visible.push({
        kind: "command",
        typed: item.text.slice(0, chars),
        typing: chars < item.text.length,
        height: LINE_H,
      })
      continue
    }
    if (item.kind === "output") {
      visible.push({ kind: "output", segs: item.segs, height: LINE_H })
      continue
    }
    const rows = Math.max(0, Math.min(qrSize, Math.floor((sec - item.at) / item.rowDelay) + 1))
    if (rows > 0) {
      visible.push({ kind: "qr", rows, height: qrHeight(rows) })
    }
  }

  const contentH = visible.reduce((total, item) => total + item.height, 0)
  const innerH = boxHeight - BAR_H - PAD_Y * 2
  // At zoom 1 a terminal scrolls: the content pins to the bottom once it
  // outgrows the window. Zoomed, the bottom edge itself is the anchor, so the
  // last line stays put while the history overflows the top.
  const zoomed = contentZoom > 1.001
  const shift = zoomed ? 0 : Math.max(0, contentH - innerH)
  const last = visible[visible.length - 1]
  const cursor =
    last !== undefined && last.kind === "command" ? (
      <Cursor frame={frame} fps={fps} blink={!last.typing} />
    ) : null

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 16,
        background: termBg,
        fontFamily: monoFamily,
        fontSize: FONT_SIZE,
        border: `1px solid ${lineSoft}`,
        boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 40px 90px rgba(0,0,0,0.6)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: BAR_H,
          background: panel,
          borderBottom: `1px solid ${lineSoft}`,
          display: "flex",
          alignItems: "center",
          padding: `0 20px`,
          position: "relative",
          flex: "none",
        }}
      >
        <div style={{ display: "flex", gap: 9 }}>
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              style={{ width: 13, height: 13, borderRadius: 7, background: "#2B323D" }}
            />
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 10,
            fontFamily: sansFamily,
            fontSize: 15,
            fontWeight: 500,
            color: dim,
            pointerEvents: "none",
          }}
        >
          <Mark size={16} />
          codenamegary@harold: ~
        </div>
      </div>
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          padding: `${PAD_Y}px ${PAD_X}px`,
          position: "relative",
        }}
      >
        <div
          style={{
            translate: `0px ${-shift}px`,
            scale: zoomed ? `${contentZoom}` : undefined,
            transformOrigin: "50% 100%",
          }}
        >
          {visible.map((item, index) => {
            if (item.kind === "command") {
              return (
                <div key={index} style={{ height: LINE_H, lineHeight: `${LINE_H}px` }}>
                  <Prompt />
                  <Seg seg={{ text: item.typed, color: body }} />
                  {index === visible.length - 1 ? cursor : null}
                </div>
              )
            }
            if (item.kind === "output") {
              return (
                <div key={index} style={{ height: LINE_H, lineHeight: `${LINE_H}px` }}>
                  {item.segs.map((seg, segIndex) => (
                    <Seg key={segIndex} seg={seg} />
                  ))}
                </div>
              )
            }
            return <Qr key={index} rows={item.rows} />
          })}
        </div>
      </div>
    </div>
  )
}
