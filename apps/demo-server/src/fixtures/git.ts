import {
  AURORA_CURRENT_BRANCH,
  AURORA_FEATURE_BRANCH,
  AURORA_FEATURE_WORKTREE_PATH,
  AURORA_WORKSPACE_PATH,
  PIXEL_CURRENT_BRANCH,
  PIXEL_WORKSPACE_PATH,
} from "./workspaces"

export type DemoWorktree = {
  path: string
  branch: string | null
  headSha: string
  isCurrent: boolean
  isMain: boolean
  dirtyFileCount: number | null
}

type DemoWorkspaceGitKind = "aurora" | "pixel" | null

type DemoChangedFile = {
  path: string
  oldPath: string | null
  status:
    | "added"
    | "modified"
    | "deleted"
    | "renamed"
    | "copied"
    | "type_changed"
    | "untracked"
    | "conflicted"
  additions: number | null
  deletions: number | null
  binary: boolean
  submodule: boolean
}

type DemoDiffLine = {
  kind: "context" | "addition" | "deletion"
  oldLineNumber: number | null
  newLineNumber: number | null
  text: string
}

type DemoDiffHunk = {
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: ReadonlyArray<DemoDiffLine>
}

type DemoFileDiff = {
  path: string
  oldPath: string | null
  status: DemoChangedFile["status"]
  additions: number | null
  deletions: number | null
  binary: boolean
  submodule: boolean
  hunks: ReadonlyArray<DemoDiffHunk>
  truncated: boolean
}

const AURORA_MAIN_SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"
const AURORA_FEATURE_SHA = "b2c3d4e5f60718293a4b5c6d7e8f90123456789a"
const PIXEL_MAIN_SHA = "c3d4e5f60718293a4b5c6d7e8f90123456789abc"

const auroraChangedFiles: ReadonlyArray<DemoChangedFile> = [
  {
    path: "src/theme/toggle.ts",
    oldPath: null,
    status: "modified",
    additions: 24,
    deletions: 3,
    binary: false,
    submodule: false,
  },
  {
    path: "src/theme/tokens.css",
    oldPath: null,
    status: "added",
    additions: 18,
    deletions: 0,
    binary: false,
    submodule: false,
  },
  {
    path: "README.md",
    oldPath: null,
    status: "modified",
    additions: 4,
    deletions: 2,
    binary: false,
    submodule: false,
  },
]

const auroraBranchFiles: ReadonlyArray<DemoChangedFile> = [
  {
    path: "src/theme/preference.ts",
    oldPath: null,
    status: "modified",
    additions: 12,
    deletions: 6,
    binary: false,
    submodule: false,
  },
  {
    path: "src/theme/preference.test.ts",
    oldPath: null,
    status: "added",
    additions: 31,
    deletions: 0,
    binary: false,
    submodule: false,
  },
]

const auroraToggleDiff: DemoFileDiff = {
  path: "src/theme/toggle.ts",
  oldPath: null,
  status: "modified",
  additions: 24,
  deletions: 3,
  binary: false,
  submodule: false,
  truncated: false,
  hunks: [
    {
      header: "@@ -1,7 +1,9 @@",
      oldStart: 1,
      oldLines: 7,
      newStart: 1,
      newLines: 9,
      lines: [
        {
          kind: "context",
          oldLineNumber: 1,
          newLineNumber: 1,
          text: 'import { tokens } from "./tokens"',
        },
        { kind: "context", oldLineNumber: 2, newLineNumber: 2, text: "" },
        {
          kind: "deletion",
          oldLineNumber: 3,
          newLineNumber: null,
          text: "export const toggle = () => {",
        },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 3,
          text: "export const toggle = (systemPrefersDark: boolean) => {",
        },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 4,
          text: '  const stored = localStorage.getItem("theme")',
        },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 5,
          text: '  if (stored === "dark" || stored === "light") return stored',
        },
        {
          kind: "context",
          oldLineNumber: 4,
          newLineNumber: 6,
          text: "  return systemPrefersDark ? tokens.dark : tokens.light",
        },
        { kind: "context", oldLineNumber: 5, newLineNumber: 7, text: "}" },
        { kind: "context", oldLineNumber: 6, newLineNumber: 8, text: "" },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 9,
          text: 'export const themeStorageKey = "harold-demo-theme"',
        },
      ],
    },
    {
      header: "@@ -14,6 +16,17 @@",
      oldStart: 14,
      oldLines: 6,
      newStart: 16,
      newLines: 17,
      lines: [
        {
          kind: "context",
          oldLineNumber: 14,
          newLineNumber: 16,
          text: "export const applyTheme = (theme: Theme) => {",
        },
        {
          kind: "context",
          oldLineNumber: 15,
          newLineNumber: 17,
          text: "  document.documentElement.dataset.theme = theme",
        },
        { kind: "context", oldLineNumber: 16, newLineNumber: 18, text: "}" },
        { kind: "addition", oldLineNumber: null, newLineNumber: 19, text: "" },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 20,
          text: "export const readPreference = (): Theme | null => {",
        },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 21,
          text: "  const value = localStorage.getItem(themeStorageKey)",
        },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 22,
          text: '  return value === "dark" || value === "light" ? value : null',
        },
        { kind: "addition", oldLineNumber: null, newLineNumber: 23, text: "}" },
      ],
    },
  ],
}

const auroraReadmeDiff: DemoFileDiff = {
  path: "README.md",
  oldPath: null,
  status: "modified",
  additions: 4,
  deletions: 2,
  binary: false,
  submodule: false,
  truncated: false,
  hunks: [
    {
      header: "@@ -8,7 +8,9 @@",
      oldStart: 8,
      oldLines: 7,
      newStart: 8,
      newLines: 9,
      lines: [
        { kind: "context", oldLineNumber: 8, newLineNumber: 8, text: "## Development" },
        { kind: "context", oldLineNumber: 9, newLineNumber: 9, text: "" },
        {
          kind: "deletion",
          oldLineNumber: 10,
          newLineNumber: null,
          text: "Run the app with `bun dev`.",
        },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 10,
          text: "Run the app with `bun dev`.",
        },
        { kind: "addition", oldLineNumber: null, newLineNumber: 11, text: "" },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 12,
          text: "Dark mode follows the system preference by default.",
        },
        { kind: "context", oldLineNumber: 11, newLineNumber: 13, text: "" },
        { kind: "context", oldLineNumber: 12, newLineNumber: 14, text: "## Testing" },
      ],
    },
  ],
}

const auroraTokensDiff: DemoFileDiff = {
  path: "src/theme/tokens.css",
  oldPath: null,
  status: "added",
  additions: 18,
  deletions: 0,
  binary: false,
  submodule: false,
  truncated: false,
  hunks: [
    {
      header: "@@ -0,0 +1,18 @@",
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: 18,
      lines: [
        { kind: "addition", oldLineNumber: null, newLineNumber: 1, text: ":root {" },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 2,
          text: "  --aurora-bg: #faf7f2;",
        },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 3,
          text: "  --aurora-ink: #241f1a;",
        },
        { kind: "addition", oldLineNumber: null, newLineNumber: 4, text: "}" },
      ],
    },
  ],
}

const auroraPreferenceDiff: DemoFileDiff = {
  path: "src/theme/preference.ts",
  oldPath: null,
  status: "modified",
  additions: 12,
  deletions: 6,
  binary: false,
  submodule: false,
  truncated: false,
  hunks: [
    {
      header: "@@ -4,9 +4,15 @@",
      oldStart: 4,
      oldLines: 9,
      newStart: 4,
      newLines: 15,
      lines: [
        {
          kind: "context",
          oldLineNumber: 4,
          newLineNumber: 4,
          text: 'const media = window.matchMedia("(prefers-color-scheme: dark)")',
        },
        { kind: "context", oldLineNumber: 5, newLineNumber: 5, text: "" },
        {
          kind: "deletion",
          oldLineNumber: 6,
          newLineNumber: null,
          text: 'export const preferredTheme = () => (media.matches ? "dark" : "light")',
        },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 6,
          text: "export const preferredTheme = () => {",
        },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 7,
          text: "  const stored = readPreference()",
        },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 8,
          text: "  if (stored !== null) return stored",
        },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 9,
          text: '  return media.matches ? "dark" : "light"',
        },
        { kind: "addition", oldLineNumber: null, newLineNumber: 10, text: "}" },
      ],
    },
  ],
}

const auroraPreferenceTestDiff: DemoFileDiff = {
  path: "src/theme/preference.test.ts",
  oldPath: null,
  status: "added",
  additions: 31,
  deletions: 0,
  binary: false,
  submodule: false,
  truncated: false,
  hunks: [
    {
      header: "@@ -0,0 +1,31 @@",
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: 31,
      lines: [
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 1,
          text: 'import { describe, expect, test } from "bun:test"',
        },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 2,
          text: 'import { preferredTheme } from "./preference"',
        },
        { kind: "addition", oldLineNumber: null, newLineNumber: 3, text: "" },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 4,
          text: 'describe("preferredTheme", () => {',
        },
        {
          kind: "addition",
          oldLineNumber: null,
          newLineNumber: 5,
          text: '  test("prefers a stored theme", () => {',
        },
      ],
    },
  ],
}

const emptyDiffFor = (path: string): DemoFileDiff => ({
  path,
  oldPath: null,
  status: "modified",
  additions: 0,
  deletions: 0,
  binary: false,
  submodule: false,
  truncated: false,
  hunks: [],
})

export const workspaceGitKind = (path: string): DemoWorkspaceGitKind => {
  if (
    path === AURORA_WORKSPACE_PATH ||
    path === AURORA_FEATURE_WORKTREE_PATH ||
    path.startsWith(`${AURORA_WORKSPACE_PATH}/`)
  ) {
    return "aurora"
  }
  if (path === PIXEL_WORKSPACE_PATH || path.startsWith(`${PIXEL_WORKSPACE_PATH}/`)) {
    return "pixel"
  }
  return null
}

export const gitWorktreesFor = (
  kind: DemoWorkspaceGitKind,
  path: string,
): ReadonlyArray<DemoWorktree> => {
  if (kind === "aurora") {
    return [
      {
        path: AURORA_WORKSPACE_PATH,
        branch: AURORA_CURRENT_BRANCH,
        headSha: AURORA_MAIN_SHA,
        isCurrent: path === AURORA_WORKSPACE_PATH,
        isMain: true,
        dirtyFileCount: 3,
      },
      {
        path: AURORA_FEATURE_WORKTREE_PATH,
        branch: AURORA_FEATURE_BRANCH,
        headSha: AURORA_FEATURE_SHA,
        isCurrent: path === AURORA_FEATURE_WORKTREE_PATH,
        isMain: false,
        dirtyFileCount: 3,
      },
    ]
  }

  if (kind === "pixel") {
    return [
      {
        path: PIXEL_WORKSPACE_PATH,
        branch: PIXEL_CURRENT_BRANCH,
        headSha: PIXEL_MAIN_SHA,
        isCurrent: true,
        isMain: true,
        dirtyFileCount: 0,
      },
    ]
  }

  return []
}

export const gitSummaryFor = (kind: DemoWorkspaceGitKind, path: string) => {
  if (kind === "aurora") {
    const inFeature = path === AURORA_FEATURE_WORKTREE_PATH
    return {
      repository: {
        root: AURORA_WORKSPACE_PATH,
        currentWorktreePath: inFeature ? AURORA_FEATURE_WORKTREE_PATH : AURORA_WORKSPACE_PATH,
        currentBranch: inFeature ? AURORA_FEATURE_BRANCH : AURORA_CURRENT_BRANCH,
        defaultBranch: "main",
        headSha: inFeature ? AURORA_FEATURE_SHA : AURORA_MAIN_SHA,
      },
      uncommittedFileCount: 3,
    }
  }

  return {
    repository: {
      root: PIXEL_WORKSPACE_PATH,
      currentWorktreePath: PIXEL_WORKSPACE_PATH,
      currentBranch: PIXEL_CURRENT_BRANCH,
      defaultBranch: PIXEL_CURRENT_BRANCH,
      headSha: PIXEL_MAIN_SHA,
    },
    uncommittedFileCount: 0,
  }
}

export const gitChangesFor = (
  kind: DemoWorkspaceGitKind,
  path: string,
  scope: "uncommitted" | "branch",
) => {
  const inFeature = path === AURORA_FEATURE_WORKTREE_PATH
  const headSha =
    kind === "aurora" ? (inFeature ? AURORA_FEATURE_SHA : AURORA_MAIN_SHA) : PIXEL_MAIN_SHA

  if (kind === "aurora" && scope === "branch") {
    return {
      scope,
      baseRef: "main",
      mergeBaseSha: "d4e5f60718293a4b5c6d7e8f90123456789abcde",
      headSha,
      files: auroraBranchFiles,
      totals: { files: 2, additions: 43, deletions: 6 },
      truncated: false,
    }
  }

  if (kind === "aurora") {
    return {
      scope,
      baseRef: null,
      mergeBaseSha: null,
      headSha,
      files: auroraChangedFiles,
      totals: { files: 3, additions: 46, deletions: 5 },
      truncated: false,
    }
  }

  return {
    scope,
    baseRef: null,
    mergeBaseSha: null,
    headSha,
    files: [],
    totals: { files: 0, additions: 0, deletions: 0 },
    truncated: false,
  }
}

export const gitFileDiffFor = (
  kind: DemoWorkspaceGitKind,
  file: string,
  oldPath: string | null,
  scope: "uncommitted" | "branch",
) => {
  if (kind === "aurora" && scope === "branch") {
    if (file === "src/theme/preference.ts") {
      return auroraPreferenceDiff
    }
    if (file === "src/theme/preference.test.ts") {
      return auroraPreferenceTestDiff
    }
    return emptyDiffFor(file)
  }

  if (kind === "aurora") {
    if (file === "src/theme/toggle.ts") {
      return auroraToggleDiff
    }
    if (file === "src/theme/tokens.css") {
      return auroraTokensDiff
    }
    if (file === "README.md") {
      return auroraReadmeDiff
    }
    return emptyDiffFor(file)
  }

  return {
    ...emptyDiffFor(file),
    oldPath,
  }
}
