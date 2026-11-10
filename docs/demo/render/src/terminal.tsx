import { useCurrentFrame, useVideoConfig } from "remotion"
import { monoFamily, sansFamily } from "./fonts"
import { Mark } from "./mark"
import { promptSegs, type TermItem, type TermSeg } from "./terminal-data"
import { body, dim, lime, lineSoft, panel, termBg } from "./theme"

// Sized so the entire transcript fits the stage window without a single
// scroll step: lines print downward and nothing ever moves.
const FONT_SIZE = 19
const LINE_H = 25
const CHAR_W = FONT_SIZE * 0.6
const BAR_H = 44
const PAD_X = 24
const PAD_Y = 18

type Visible =
  | { kind: "command"; typed: string; typing: boolean; height: number }
  | { kind: "output"; segs: TermSeg[]; height: number }

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

/**
 * The terminal window. Positioned entirely by its parent (the stage zooms it
 * for the close-up and slides it out after the SSH setup); the transcript itself is
 * top-anchored and never scrolls.
 */
export const Terminal: React.FC<{ items: TermItem[] }> = ({ items }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const sec = frame / fps

  const visible: Visible[] = []
  for (const item of items) {
    if (sec < item.at) {
      break
    }
    if (item.kind === "command") {
      const typeAt = item.typeAt ?? item.at
      const chars = Math.min(
        item.text.length,
        Math.max(0, Math.floor((sec - typeAt) * item.cps)),
      )
      visible.push({
        kind: "command",
        typed: item.text.slice(0, chars),
        typing: sec >= typeAt && chars < item.text.length,
        height: LINE_H,
      })
      continue
    }
    visible.push({ kind: "output", segs: item.segs, height: LINE_H })
  }

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
            fontSize: 14,
            fontWeight: 500,
            color: dim,
            pointerEvents: "none",
          }}
        >
          <Mark size={15} />
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
          return (
            <div key={index} style={{ height: LINE_H, lineHeight: `${LINE_H}px` }}>
              {item.segs.map((seg, segIndex) => (
                <Seg key={segIndex} seg={seg} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
