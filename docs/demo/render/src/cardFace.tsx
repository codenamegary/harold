import { sansFamily } from "./fonts"
import { ink, lime, paper } from "./theme"

// The shared white caption card surface. Phone cards, stage cards, and the
// slash caption all use the same paper, lime edge, and rule.
export const CardFace: React.FC<{
  title: string
  width: number
  height: number
  fontSize: number
  ruleIn: number
  shadow?: string
}> = ({ title, width, height, fontSize, ruleIn, shadow }) => (
  <div
    style={{
      width,
      height,
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      padding: "26px 36px 26px 38px",
      borderRadius: 16,
      background: paper,
      border: "1px solid rgba(8,10,13,0.12)",
      borderLeft: `5px solid ${lime}`,
      boxShadow: shadow ?? "0 24px 60px rgba(0,0,0,0.5)",
      color: ink,
    }}
  >
    <div
      style={{
        fontFamily: sansFamily,
        fontSize,
        fontWeight: 600,
        lineHeight: 1.05,
        letterSpacing: "-0.02em",
        textWrap: "balance",
      }}
    >
      {title}
    </div>
    <div
      style={{
        marginTop: 14,
        width: 80,
        height: 4,
        borderRadius: 2,
        background: lime,
        scale: `${ruleIn} 1`,
        transformOrigin: "left center",
      }}
    />
  </div>
)
