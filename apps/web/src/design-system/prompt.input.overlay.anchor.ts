export type OverlayBox = {
  left: number
  top: number
  bottom: number
}

/**
 * Place the overlay above `anchor` (the first painted span of the active
 * token), in the host's padding box. `gap` is the space between the overlay
 * bottom and the span top.
 */
export const overlayAnchor = (
  host: OverlayBox,
  anchor: OverlayBox,
  gap: number,
): { left: number; bottom: number } => ({
  left: anchor.left - host.left,
  bottom: host.bottom - anchor.top + gap,
})
