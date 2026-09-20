import { AgentMethodDeclaration, AgentMethodName, CapabilityPath } from "./method"
import { sessionCancelDeclaration } from "./session.cancel"
import { sessionCloseDeclaration } from "./session.close"
import { sessionListDeclaration } from "./session.list"
import { sessionLoadDeclaration } from "./session.load"
import { sessionNewDeclaration } from "./session.new"
import { sessionPromptDeclaration } from "./session.prompt"
import { sessionSetConfigOptionDeclaration } from "./session.set.config.option"

export type AgentMethodDeclarationReader = {
  list: () => ReadonlyArray<AgentMethodDeclaration>
  methodsRequiring: (path: CapabilityPath) => ReadonlyArray<AgentMethodName>
}

export type AgentMethodDeclarations = AgentMethodDeclarationReader & {
  register: (declaration: AgentMethodDeclaration) => void
}

export const createAgentMethodDeclarations = (
  initial: ReadonlyArray<AgentMethodDeclaration>,
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

export const agentMethodDeclarations: AgentMethodDeclarationReader = createAgentMethodDeclarations([
  sessionNewDeclaration,
  sessionPromptDeclaration,
  sessionSetConfigOptionDeclaration,
  sessionCancelDeclaration,
  sessionLoadDeclaration,
  sessionListDeclaration,
  sessionCloseDeclaration,
])
