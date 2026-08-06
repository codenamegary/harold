import { SessionState } from "contracts/http/session"
import { StatusDotVariant } from "../design-system/StatusDot"

const statusDotVariantBySessionState: Partial<Record<SessionState, StatusDotVariant>> = {
  idle: "online",
  running: "warning",
  "awaiting-permission": "warning",
  offline: "offline",
  error: "offline",
}

export const sessionStatusDotVariant = (
  sessionState: SessionState,
): StatusDotVariant | null => statusDotVariantBySessionState[sessionState] ?? null
