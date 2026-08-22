import { AgentMethodDeclaration, RequiredCapabilityPath } from "./method"

export const sessionListMethod = "session/list"

export const sessionListRequires: RequiredCapabilityPath = "sessionCapabilities.list"

export const sessionListDeclaration: AgentMethodDeclaration = {
  method: sessionListMethod,
  requires: sessionListRequires,
}
