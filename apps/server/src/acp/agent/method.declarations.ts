import { AgentMethodDeclaration, AgentMethodName, CapabilityPath } from "./models"
import { sessionCancelDeclaration } from "./session.cancel"
import { sessionCloseDeclaration } from "./session.close"
import { sessionListDeclaration } from "./session.list"
import { sessionLoadDeclaration } from "./session.load"
import { sessionNewDeclaration } from "./session.new"
import { sessionPromptDeclaration } from "./session.prompt"

export type AgentMethodDeclarations = {
  register: (declaration: AgentMethodDeclaration) => void
  list: () => ReadonlyArray<AgentMethodDeclaration>
  methodsRequiring: (path: CapabilityPath) => ReadonlyArray<AgentMethodName>
}

export const createAgentMethodDeclarations = (
  initial: ReadonlyArray<AgentMethodDeclaration> = [],
): AgentMethodDeclarations => {
  const declarations = new Map<AgentMethodName, AgentMethodDeclaration>(
    initial.map((declaration) => [declaration.method, declaration]),
  )

  return {
    register: (declaration) => {
      declarations.set(declaration.method, declaration)
    },
    list: () => [...declarations.values()],
    methodsRequiring: (path) =>
      [...declarations.values()]
        .filter((declaration) => declaration.requires === path)
        .map((declaration) => declaration.method),
  }
}

export const agentMethodDeclarations = createAgentMethodDeclarations([
  sessionNewDeclaration,
  sessionPromptDeclaration,
  sessionCancelDeclaration,
  sessionLoadDeclaration,
  sessionListDeclaration,
  sessionCloseDeclaration,
])
