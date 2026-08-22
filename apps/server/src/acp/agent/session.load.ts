import { AgentMethodDeclaration, CapabilityPath } from "./models"

export const sessionLoadMethod = "session/load"

export const sessionLoadRequires: CapabilityPath = "loadSession"

export const sessionLoadDeclaration: AgentMethodDeclaration = {
  method: sessionLoadMethod,
  requires: sessionLoadRequires,
}
