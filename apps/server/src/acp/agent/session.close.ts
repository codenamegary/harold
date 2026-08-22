import { AgentMethodDeclaration, CapabilityPath } from "./models"

export const sessionCloseMethod = "session/close"

export const sessionCloseRequires: CapabilityPath = "sessionCapabilities.close"

export const sessionCloseDeclaration: AgentMethodDeclaration = {
  method: sessionCloseMethod,
  requires: sessionCloseRequires,
}
