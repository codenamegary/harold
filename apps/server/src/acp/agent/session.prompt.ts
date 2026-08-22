import { AgentMethodDeclaration } from "./method"

export const sessionPromptMethod = "session/prompt"

export const sessionPromptRequires = null

export const sessionPromptDeclaration: AgentMethodDeclaration = {
  method: sessionPromptMethod,
  requires: sessionPromptRequires,
}
