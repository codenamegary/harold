import { SessionBindingRegistry } from "../client/session.binding.registry"

export const requireBoundSession = (
  sessionBindings: SessionBindingRegistry,
  acpSessionId: string,
):
  | {
      ok: true
      binding: NonNullable<ReturnType<SessionBindingRegistry["getBinding"]>>
    }
  | { ok: false; reason: string } => {
  const binding = sessionBindings.getBinding(acpSessionId)
  if (binding === undefined) {
    return { ok: false, reason: "Session is not bound" }
  }

  return { ok: true, binding }
}
