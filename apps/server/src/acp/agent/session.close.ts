import { AgentMethodDeclaration, RequiredCapabilityPath } from "./models"

export const sessionCloseMethod = "session/close"

export const sessionCloseRequires: RequiredCapabilityPath = "sessionCapabilities.close"

export const sessionCloseDeclaration: AgentMethodDeclaration = {
  method: sessionCloseMethod,
  requires: sessionCloseRequires,
}
