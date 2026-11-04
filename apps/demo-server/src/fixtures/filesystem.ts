import {
  AURORA_WORKSPACE_PATH,
  DEMO_HOME,
  DEMO_PROJECTS_PATH,
  PIXEL_WORKSPACE_PATH,
} from "./workspaces"

export type DemoDirectory = {
  name: string
  path: string
}

const baseChildren = new Map<string, ReadonlyArray<DemoDirectory>>([
  ["/home", [{ name: "demo", path: DEMO_HOME }]],
  [
    DEMO_HOME,
    [
      { name: "Documents", path: `${DEMO_HOME}/Documents` },
      { name: "Downloads", path: `${DEMO_HOME}/Downloads` },
      { name: "projects", path: DEMO_PROJECTS_PATH },
    ],
  ],
  [
    DEMO_PROJECTS_PATH,
    [
      { name: "aurora-web", path: AURORA_WORKSPACE_PATH },
      { name: "pixel-garden", path: PIXEL_WORKSPACE_PATH },
    ],
  ],
  [
    AURORA_WORKSPACE_PATH,
    [
      { name: "src", path: `${AURORA_WORKSPACE_PATH}/src` },
      { name: "public", path: `${AURORA_WORKSPACE_PATH}/public` },
    ],
  ],
  [PIXEL_WORKSPACE_PATH, [{ name: "src", path: `${PIXEL_WORKSPACE_PATH}/src` }]],
])

export const baseDirectoryChildren = (path: string): ReadonlyArray<DemoDirectory> =>
  baseChildren.get(path) ?? []

export const parentDirectoryOf = (path: string): string | null => {
  if (path === "/" || path === "") {
    return null
  }
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path
  const index = trimmed.lastIndexOf("/")
  if (index <= 0) {
    return "/"
  }
  return trimmed.slice(0, index)
}

export const isValidDirectoryName = (name: string): boolean =>
  name.length > 0 &&
  name.length <= 120 &&
  name !== "." &&
  name !== ".." &&
  !name.includes("/") &&
  !name.includes("\\")
