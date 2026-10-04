import { describe, expect, test } from "bun:test"
import { Workspace } from "contracts/http/workspace"
import {
  WorkspaceColors,
  renderAmbiguousWorkspaceReference,
  renderRegisterWorkspaceError,
  renderWorkspaceAdded,
  renderWorkspaceList,
  renderWorkspaceReferenceNotFound,
  renderWorkspaceRemoved,
} from "./workspace.render"

const identityColors: WorkspaceColors = {
  green: (text) => text,
  yellow: (text) => text,
  red: (text) => text,
  dim: (text) => text,
}

const workspace = (overrides: Partial<Workspace>): Workspace => ({
  id: "ws_01J8XYZ000000000000000000",
  name: "harold",
  path: "/srv/harold",
  state: "available",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastUsedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
})

describe("renderWorkspaceList", () => {
  test("renders a table with short id, name, path, and state", () => {
    const output = renderWorkspaceList({
      workspaces: [
        workspace({ id: "ws_01J8XYZ000000000000000000", name: "harold", path: "/srv/harold" }),
        workspace({
          id: "ws_01J8ZZZ111111111111111111",
          name: "a-very-long-workspace-name",
          path: "/srv/nested/deeper/other",
          state: "missing",
        }),
      ],
      colors: identityColors,
    })

    const lines = output.split("\n")

    expect(lines[0]).toContain("ID")
    expect(lines[0]).toContain("NAME")
    expect(lines[0]).toContain("PATH")
    expect(lines[0]).toContain("STATE")
    expect(lines[1]).toContain("ws_01J8XYZ0")
    expect(lines[1]).not.toContain("ws_01J8XYZ000000000000000000")
    expect(lines[1]).toContain("harold")
    expect(lines[1]).toContain("/srv/harold")
    expect(lines[1]).toContain("available")
    expect(lines[2]).toContain("a-very-long-workspace-name")
    expect(lines[2]).toContain("/srv/nested/deeper/other")
    expect(lines[2]).toContain("missing")
    expect(lines[3]).toBe("")
    expect(lines[4]).toBe("2 workspaces")
  })

  test("aligns columns across rows", () => {
    const output = renderWorkspaceList({
      workspaces: [
        workspace({ name: "harold", path: "/srv/harold" }),
        workspace({ name: "a-very-long-workspace-name", path: "/srv/other" }),
      ],
      colors: identityColors,
    })

    const [header, first, second] = output.split("\n").slice(0, 3)

    expect(header.indexOf("NAME")).toBe(first.indexOf("harold"))
    expect(header.indexOf("NAME")).toBe(second.indexOf("a-very-long-workspace-name"))
    expect(header.indexOf("PATH")).toBe(first.indexOf("/srv/harold"))
    expect(header.indexOf("PATH")).toBe(second.indexOf("/srv/other"))
    expect(header.indexOf("STATE")).toBe(first.indexOf("available"))
    expect(header.indexOf("STATE")).toBe(second.indexOf("available"))
  })

  test("renders the empty state", () => {
    const output = renderWorkspaceList({ workspaces: [], colors: identityColors })

    expect(output).toBe("No workspaces registered yet.")
  })

  test("colors the state column", () => {
    const output = renderWorkspaceList({
      workspaces: [
        workspace({ state: "available" }),
        workspace({ id: "ws_01J8ZZZ111111111111111111", state: "missing" }),
        workspace({ id: "ws_01J8ZZZ222222222222222222", state: "unavailable" }),
      ],
      colors: {
        ...identityColors,
        green: (text) => `<green>${text}</green>`,
        yellow: (text) => `<yellow>${text}</yellow>`,
        red: (text) => `<red>${text}</red>`,
      },
    })

    expect(output).toContain("<green>available</green>")
    expect(output).toContain("<yellow>missing</yellow>")
    expect(output).toContain("<red>unavailable</red>")
  })
})

describe("renderWorkspaceAdded", () => {
  test("names the workspace, its path, and its full id", () => {
    const output = renderWorkspaceAdded(workspace())

    expect(output).toContain("Added workspace harold (/srv/harold)")
    expect(output).toContain("ws_01J8XYZ000000000000000000")
  })
})

describe("renderWorkspaceRemoved", () => {
  test("names the workspace and its path", () => {
    const output = renderWorkspaceRemoved(workspace())

    expect(output).toBe("Removed workspace harold (/srv/harold).")
  })
})

describe("renderRegisterWorkspaceError", () => {
  test("explains a missing directory", () => {
    const output = renderRegisterWorkspaceError({
      error: { kind: "path", error: { kind: "missing" } },
      path: "/srv/gone",
    })

    expect(output).toBe("No directory at /srv/gone.")
  })

  test("explains a path that is not a directory", () => {
    const output = renderRegisterWorkspaceError({
      error: { kind: "path", error: { kind: "not_directory" } },
      path: "/srv/file.txt",
    })

    expect(output).toBe("/srv/file.txt is not a directory.")
  })

  test("explains an unreadable directory", () => {
    const output = renderRegisterWorkspaceError({
      error: { kind: "path", error: { kind: "unreadable" } },
      path: "/srv/locked",
    })

    expect(output).toBe("/srv/locked is not readable.")
  })

  test("explains an outside allowed root rejection", () => {
    const output = renderRegisterWorkspaceError({
      error: { kind: "outside_allowed_root" },
      path: "/srv/harold",
    })

    expect(output).toContain("outside the allowed roots")
    expect(output).toContain("allowedRoots")
  })

  test("explains a duplicate registration", () => {
    const output = renderRegisterWorkspaceError({
      error: { kind: "duplicate_path" },
      path: "/srv/harold",
    })

    expect(output).toBe("A workspace is already registered at /srv/harold.")
  })
})

describe("renderWorkspaceReferenceNotFound", () => {
  test("echoes the reference and points at the list command", () => {
    const output = renderWorkspaceReferenceNotFound("harold")

    expect(output).toContain('No workspace matches "harold".')
    expect(output).toContain("harold workspace list")
  })
})

describe("renderAmbiguousWorkspaceReference", () => {
  test("lists the matching candidates", () => {
    const output = renderAmbiguousWorkspaceReference({
      reference: "harold",
      workspaces: [
        workspace({ id: "ws_01J8XYZ000000000000000000", path: "/srv/harold" }),
        workspace({ id: "ws_01J8ZZZ111111111111111111", path: "/srv/other/harold" }),
      ],
    })

    expect(output).toContain('More than one workspace is named "harold"')
    expect(output).toContain("/srv/harold")
    expect(output).toContain("/srv/other/harold")
  })
})
