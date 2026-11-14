import { Img, staticFile } from "remotion"
import type { PhoneLayout } from "./camera"
import type { AngelNow } from "./opening"

// The wings and halo that live behind the phone during the SSH lift. They are
// drawn inside the phone's pose transform, before the handset body, so the
// phone itself hides the roots and the bottom of the halo.
//
// The wing asset is one left wing: the root is at the bottom right and the tip
// is at the top left. The right wing is the same image mirrored.

const HALO_ASPECT = 1698 / 926
const WING_ASPECT = 1536 / 1024

/** Halo size against the phone frame, and how far its bottom sits behind the phone. */
const HALO_WIDTH_FACTOR = 1.24
const HALO_OVERLAP = 0.62

/** Wing size against the phone frame, and where each root sits inside it. */
const WING_WIDTH_FACTOR = 1.44
const WING_ROOT_X = 0.23
const WING_ROOT_Y = 0.374

/** A small wing at rest stays inside the phone width and never peeks out. */
const WING_START_SCALE = 0.12

/** Folded straight down behind the phone, then out through 80 degrees to 10. */
const WING_TUCK_DEG = 90
const WING_OPEN_DEG = 10

const Wing: React.FC<{
  layout: PhoneLayout
  spread: number
  side: "left" | "right"
}> = ({ layout, spread, side }) => {
  const sign = side === "left" ? -1 : 1
  const width = layout.frameWidth * WING_WIDTH_FACTOR
  const height = width / WING_ASPECT
  const rootX = layout.frameWidth / 2 + sign * layout.frameWidth * WING_ROOT_X
  const rootY = layout.frameHeight * WING_ROOT_Y
  const rotation = sign * (WING_TUCK_DEG + (WING_OPEN_DEG - WING_TUCK_DEG) * spread)
  const scale = WING_START_SCALE + (1 - WING_START_SCALE) * spread
  const driftX = sign * spread * layout.frameWidth * 0.08
  const driftY = -spread * layout.frameHeight * 0.03
  return (
    <div
      style={{
        position: "absolute",
        left: side === "left" ? rootX - width : rootX,
        top: rootY - height,
        width,
        height,
        transformOrigin: side === "left" ? "100% 100%" : "0% 100%",
        transform: `translate(${driftX}px, ${driftY}px) rotate(${rotation}deg) scale(${scale})`,
        // The scale already keeps a folded wing hidden. The fade only softens
        // the first few frames while it grows past the phone's edge.
        opacity: Math.min(1, spread * 3),
        filter: "drop-shadow(0 28px 48px rgba(0,0,0,0.5))",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: side === "right" ? "scaleX(-1)" : undefined,
        }}
      >
        <Img
          src={staticFile("angel/wing.png")}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>
    </div>
  )
}

const Halo: React.FC<{ layout: PhoneLayout; angel: AngelNow }> = ({ layout, angel }) => {
  const width = layout.frameWidth * HALO_WIDTH_FACTOR
  const height = width / HALO_ASPECT
  // It starts small behind the phone face and rises as it grows.
  const rise = (1 - angel.halo) * layout.frameHeight * 0.32
  return (
    <div
      style={{
        position: "absolute",
        left: (layout.frameWidth - width) / 2,
        top: -height * HALO_OVERLAP + rise + angel.float,
        width,
        height,
        opacity: angel.halo,
        transform: `scale(${0.45 + 0.55 * angel.halo})`,
        transformOrigin: "50% 100%",
        filter: "drop-shadow(0 0 26px rgba(255, 190, 70, 0.55))",
      }}
    >
      <Img
        src={staticFile("angel/halo.png")}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  )
}

export const AngelDecor: React.FC<{ layout: PhoneLayout; angel: AngelNow }> = ({
  layout,
  angel,
}) => (
  <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
    <Halo layout={layout} angel={angel} />
    <Wing layout={layout} spread={angel.spread} side="left" />
    <Wing layout={layout} spread={angel.spread} side="right" />
  </div>
)
