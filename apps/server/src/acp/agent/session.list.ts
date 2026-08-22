import { AgentMethodDeclaration, CapabilityPath } from "./models"

export const sessionListMethod = "session/list"

export const sessionListRequires: CapabilityPath = "sessionCapabilities.list"

export const sessionListDeclaration: AgentMethodDeclaration = {
  method: sessionListMethod,
  requires: sessionListRequires,
}
