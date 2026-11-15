import { describe, expect, test } from "bun:test"
import { createVfsStore } from "./vfs.store"
import { createVirtualGit } from "./git.virtual"

describe("git.virtual", () => {
  test("reports repository metadata, worktrees, and clean status", () => {
    const vfs = createVfsStore({ home: "/home/demo" })
    vfs.writeFile("/home/demo/sites/cat-screensaver/README.md", Buffer.from("# Cat\n"))
    vfs.writeFile(
      "/home/demo/sites/cat-screensaver-worktrees/cat-mode/README.md",
      Buffer.from("# Cat\n"),
    )

    const git = createVirtualGit(vfs, [
      {
        root: "/home/demo/sites/cat-screensaver",
        branch: "main",
        defaultBranch: "main",
        headSha: "1111111111111111111111111111111111111111",
        mergeBaseSha: "1111111111111111111111111111111111111111",
        worktreeGroup: "cat",
        isMainWorktree: true,
      },
      {
        root: "/home/demo/sites/cat-screensaver-worktrees/cat-mode",
        branch: "feat/cat-mode",
        defaultBranch: "main",
        headSha: "1111111111111111111111111111111111111111",
        mergeBaseSha: "1111111111111111111111111111111111111111",
        worktreeGroup: "cat",
        isMainWorktree: false,
      },
    ])

    const wtPath = "/home/demo/sites/cat-screensaver-worktrees/cat-mode"
    expect(git.run(wtPath, ["rev-parse", "--is-inside-work-tree"]).stdout.trim()).toBe("true")
    expect(git.run(wtPath, ["rev-parse", "--show-toplevel"]).stdout.trim()).toBe(wtPath)
    expect(git.run(wtPath, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim()).toBe(
      "feat/cat-mode",
    )
    expect(git.run(wtPath, ["status", "--porcelain=v1", "-uall"]).stdout).toBe("")
    expect(git.run(wtPath, ["worktree", "list", "--porcelain"]).stdout).toContain(
      "branch refs/heads/feat/cat-mode",
    )
  })

  test("computes uncommitted status, numstat, and unified diff when files change", () => {
    const vfs = createVfsStore({ home: "/home/demo" })
    const repo = "/home/demo/sites/cat-screensaver-worktrees/cat-mode"
    vfs.writeFile(`${repo}/src/settings.js`, Buffer.from("export const a = 1\nexport const b = 2\n"))

    const git = createVirtualGit(vfs, [
      {
        root: repo,
        branch: "feat/cat-mode",
        defaultBranch: "main",
        headSha: "1111111111111111111111111111111111111111",
        mergeBaseSha: "1111111111111111111111111111111111111111",
        worktreeGroup: "cat",
        isMainWorktree: false,
      },
    ])

    vfs.writeFile(
      `${repo}/src/settings.js`,
      Buffer.from("export const a = 1\nexport const b = 3\nexport const catMode = true\n"),
    )
    vfs.writeFile(`${repo}/src/cat-mode.js`, Buffer.from("export const cat = 'Mia'\n"))

    const status = git.run(repo, ["status", "--porcelain=v1", "-uall"]).stdout
    expect(status).toContain(" M src/settings.js")
    expect(status).toContain("?? src/cat-mode.js")

    const numstat = git.run(repo, ["diff", "--numstat"]).stdout
    expect(numstat).toContain("2\t1\tsrc/settings.js")

    const diff = git.run(repo, [
      "diff",
      "--no-color",
      "--unified=3",
      "--find-renames",
      "HEAD",
      "--",
      "src/settings.js",
      "src/settings.js",
    ]).stdout
    expect(diff).toContain("-export const b = 2")
    expect(diff).toContain("+export const b = 3")
    expect(diff).toContain("+export const catMode = true")

    const newDiff = git.run(repo, [
      "diff",
      "--no-color",
      "--unified=3",
      "--no-index",
      "--",
      "/dev/null",
      "src/cat-mode.js",
    ]).stdout
    expect(newDiff).toContain("+export const cat = 'Mia'")
  })

  test("commits working tree changes so uncommitted becomes clean and branch diff shows them", () => {
    const vfs = createVfsStore({ home: "/home/demo" })
    const repo = "/home/demo/sites/cat-screensaver-worktrees/cat-mode"
    vfs.writeFile(`${repo}/README.md`, Buffer.from("# Cat\n"))

    const git = createVirtualGit(vfs, [
      {
        root: repo,
        branch: "feat/cat-mode",
        defaultBranch: "main",
        headSha: "1111111111111111111111111111111111111111",
        mergeBaseSha: "1111111111111111111111111111111111111111",
        worktreeGroup: "cat",
        isMainWorktree: false,
      },
    ])

    vfs.writeFile(`${repo}/src/cat-mode.js`, Buffer.from("export const cat = 'Mia'\n"))
    git.commitAll(repo, "Add cat mode")

    expect(git.run(repo, ["status", "--porcelain=v1", "-uall"]).stdout).toBe("")
    const branchFiles = git.run(repo, [
      "diff",
      "--name-status",
      "--find-renames",
      "1111111111111111111111111111111111111111",
      "HEAD",
    ]).stdout
    expect(branchFiles).toContain("A\tsrc/cat-mode.js")
  })
})
