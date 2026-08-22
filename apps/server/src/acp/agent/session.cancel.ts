import { AgentMethodDeclaration } from "./method"

export const sessionCancelMethod = "session/cancel"

export const sessionCancelRequires = null

export const sessionCancelDeclaration: AgentMethodDeclaration = {
  method: sessionCancelMethod,
  requires: sessionCancelRequires,
}
