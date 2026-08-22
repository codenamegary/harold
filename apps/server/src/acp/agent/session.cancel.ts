import { AgentMethodDeclaration } from "./models"

export const sessionCancelMethod = "session/cancel"

export const sessionCancelRequires = null

export const sessionCancelDeclaration: AgentMethodDeclaration = {
  method: sessionCancelMethod,
  requires: sessionCancelRequires,
}
