import { describe, expect, test } from "bun:test"
import {
  agentMethodDeclarations,
  createAgentMethodDeclarations,
} from "./method.declarations"
import { agentMethodNames, requiredCapabilityPaths } from "./models"
import { sessionCancelRequires } from "./session.cancel"
import { sessionCloseRequires } from "./session.close"
import { sessionListRequires } from "./session.list"
import { sessionLoadRequires } from "./session.load"
import { sessionNewRequires } from "./session.new"
import { sessionPromptRequires } from "./session.prompt"

describe("agent method declarations", () => {
  test("every ACP session method the host calls is declared", () => {
    const declared = agentMethodDeclarations.list().map((declaration) => declaration.method)

    expect([...declared].sort()).toEqual([...agentMethodNames].sort())
  })

  test("baseline methods require no capability", () => {
    expect(sessionNewRequires).toBeNull()
    expect(sessionPromptRequires).toBeNull()
    expect(sessionCancelRequires).toBeNull()
  })

  test("optional methods name their v1 capability path", () => {
    expect(sessionLoadRequires).toBe("loadSession")
    expect(sessionListRequires).toBe("sessionCapabilities.list")
    expect(sessionCloseRequires).toBe("sessionCapabilities.close")
  })

  test("reverse lookup answers which methods require a capability path", () => {
    expect(agentMethodDeclarations.methodsRequiring(sessionLoadRequires)).toEqual(["session/load"])
    expect(agentMethodDeclarations.methodsRequiring(sessionListRequires)).toEqual(["session/list"])
    expect(agentMethodDeclarations.methodsRequiring(sessionCloseRequires)).toEqual([
      "session/close",
    ])
  })

  test("every declared requirement appears in the reverse lookup for its own path", () => {
    const required = agentMethodDeclarations
      .list()
      .flatMap((declaration) =>
        declaration.requires === null
          ? []
          : [{ method: declaration.method, requires: declaration.requires }],
      )

    expect(required.length).toBe(3)
    required.forEach(({ method, requires }) => {
      expect(agentMethodDeclarations.methodsRequiring(requires)).toContain(method)
    })
  })

  test("baseline methods never come back from a reverse lookup", () => {
    const baselineMethods = ["session/new", "session/prompt", "session/cancel"]

    requiredCapabilityPaths.forEach((path) => {
      const methods = agentMethodDeclarations.methodsRequiring(path)

      baselineMethods.forEach((baselineMethod) => {
        expect(methods).not.toContain(baselineMethod)
      })
    })
  })

  test("a capability path no method requires has no methods", () => {
    expect(agentMethodDeclarations.methodsRequiring("sessionCapabilities.fork")).toEqual([])
    expect(agentMethodDeclarations.methodsRequiring("promptCapabilities.image")).toEqual([])
  })

  test("two methods requiring the same path both come back", () => {
    const declarations = createAgentMethodDeclarations([
      { method: "session/list", requires: "sessionCapabilities.list" },
      { method: "session/close", requires: "sessionCapabilities.list" },
    ])

    expect(declarations.methodsRequiring("sessionCapabilities.list")).toEqual([
      "session/list",
      "session/close",
    ])
  })

  test("registering a method again replaces its declaration", () => {
    const declarations = createAgentMethodDeclarations([
      { method: "session/load", requires: "loadSession" },
    ])

    declarations.register({ method: "session/load", requires: null })

    expect(declarations.methodsRequiring("loadSession")).toEqual([])
    expect(declarations.list()).toEqual([{ method: "session/load", requires: null }])
  })
})
