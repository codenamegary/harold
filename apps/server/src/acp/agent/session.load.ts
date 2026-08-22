import { AgentMethodDeclaration, RequiredCapabilityPath } from "./method"

export const sessionLoadMethod = "session/load"

export const sessionLoadRequires: RequiredCapabilityPath = "loadSession"

export const sessionLoadDeclaration: AgentMethodDeclaration = {
  method: sessionLoadMethod,
  requires: sessionLoadRequires,
}
