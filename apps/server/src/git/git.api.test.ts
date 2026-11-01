import { describe, expect, test } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  GitChangesSchema,
  GitFileDiffSchema,
  GitSummarySchema,
  GitWorktreeCollectionSchema,
} from "contracts/http/git"
import { NotFoundProblemSchema, ValidationProblemSchema } from "contracts/http/error"
import { bootTestApp } from "../test-support/test.harness"

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

const git = async (cwd: string, ...args: ReadonlyArray<string>) => {
  const result = Bun.spawn(["git", "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [code, stdout, stderr] = await Promise.all([
    result.exited,
    new Response(result.stdout).text(),
    new Response(result.stderr).text(),
  ])
  if (code !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${stderr}`)
  }
  return stdout
}

const createRepo = async (parent: string, name = "repo") => {
  const repo = path.join(parent, name)
  await mkdir(repo, { recursive: true })
  await writeFile(path.join(repo, "README.md"), "# repo\n")
  await writeFile(path.join(repo, "delete-me.txt"), "bye\n")
  await writeFile(path.join(repo, "rename-me.txt"), "old\n")
  await git(repo, "init", "--quiet", "--initial-branch=main")
  await git(repo, "config", "user.email", "test@harold.local")
  await git(repo, "config", "user.name", "Harold")
  await git(repo, "add", ".")
  await git(repo, "commit", "--quiet", "-m", "init")
  return repo
}

const get = (app: Awaited<ReturnType<typeof bootTestApp>>["app"], url: string) =>
  app.inject({
    headers: authHeaders(app),
    method: "GET",
    url,
  })

const gitUrl = (
  route: "summary" | "worktrees" | "changes" | "file",
  params: Record<string, string>,
) => {
  const query = new URLSearchParams(params).toString()
  return `/v1/git/${route}?${query}`
}

describe("GET /v1/git/summary", () => {
  test("resolves the repository and counts dirty files including untracked", async () => {
    const { app, dataDir } = await bootTestApp()
    const repo = await createRepo(dataDir)
    await writeFile(path.join(repo, "README.md"), "# repo\nchanged\n")
    await writeFile(path.join(repo, "new.txt"), "new\n")
    await rm(path.join(repo, "delete-me.txt"))
    await git(repo, "mv", "rename-me.txt", "renamed.txt")

    const response = await get(app, gitUrl("summary", { path: repo }))
    const body = GitSummarySchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.repository.root).toBe(repo)
    expect(body.repository.currentBranch).toBe("main")
    expect(body.repository.defaultBranch).toBe("main")
    expect(body.repository.headSha).toHaveLength(40)
    expect(body.uncommittedFileCount).toBe(4)
  })

  test("returns 404 when the path is not a git repository", async () => {
    const { app, dataDir } = await bootTestApp()
    const folder = path.join(dataDir, "plain")
    await mkdir(folder)

    const response = await get(app, gitUrl("summary", { path: folder }))
    const body = NotFoundProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(404)
    expect(body.detail).toBe("Not a git repository")
  })

  test("returns 400 for a missing path", async () => {
    const { app, dataDir } = await bootTestApp()
    const missing = path.join(dataDir, "missing")

    const response = await get(app, gitUrl("summary", { path: missing }))
    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/path")
  })
})

describe("GET /v1/git/worktrees", () => {
  test("lists the main worktree and linked worktrees with dirty counts", async () => {
    const { app, dataDir } = await bootTestApp()
    const repo = await createRepo(dataDir)
    const linked = path.join(dataDir, "linked")
    await git(repo, "worktree", "add", "--quiet", linked, "-b", "feat/linked")
    await writeFile(path.join(linked, "dirty.txt"), "dirty\n")

    const response = await get(app, gitUrl("worktrees", { path: repo }))
    const body = GitWorktreeCollectionSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.items).toHaveLength(2)
    expect(body.items[0]?.path).toBe(repo)
    expect(body.items[0]?.isMain).toBe(true)
    expect(body.items[0]?.isCurrent).toBe(true)
    expect(body.items[0]?.dirtyFileCount).toBe(0)
    expect(body.items[1]?.branch).toBe("feat/linked")
    expect(body.items[1]?.isCurrent).toBe(false)
    expect(body.items[1]?.dirtyFileCount).toBe(1)
  })
})

describe("GET /v1/git/changes", () => {
  test("reports uncommitted files, renames, untracked files, and binary files", async () => {
    const { app, dataDir } = await bootTestApp()
    const repo = await createRepo(dataDir)
    await writeFile(path.join(repo, "README.md"), "# repo\nchanged\n")
    await writeFile(path.join(repo, "new.txt"), "new\n")
    await writeFile(path.join(repo, "image.bin"), Buffer.from([0, 1, 2, 3]))
    await rm(path.join(repo, "delete-me.txt"))
    await git(repo, "mv", "rename-me.txt", "renamed.txt")

    const response = await get(app, gitUrl("changes", { path: repo, scope: "uncommitted" }))
    const body = GitChangesSchema.parse(JSON.parse(response.body))
    const byPath = new Map(body.files.map((file) => [file.path, file]))

    expect(response.statusCode).toBe(200)
    expect(body.scope).toBe("uncommitted")
    expect(body.totals.files).toBe(5)
    expect(byPath.get("README.md")?.status).toBe("modified")
    expect(byPath.get("delete-me.txt")?.status).toBe("deleted")
    expect(byPath.get("renamed.txt")?.status).toBe("renamed")
    expect(byPath.get("renamed.txt")?.oldPath).toBe("rename-me.txt")
    expect(byPath.get("new.txt")?.status).toBe("untracked")
    expect(byPath.get("new.txt")?.additions).toBe(1)
    expect(byPath.get("image.bin")?.binary).toBe(true)
    expect(byPath.get("image.bin")?.additions).toBeNull()
  })

  test("reports branch changes against the default branch", async () => {
    const { app, dataDir } = await bootTestApp()
    const repo = await createRepo(dataDir)
    await git(repo, "checkout", "--quiet", "-b", "feat/branch")
    await writeFile(path.join(repo, "README.md"), "# repo\nbranch change\n")
    await writeFile(path.join(repo, "feature.txt"), "feature\n")
    await git(repo, "add", ".")
    await git(repo, "commit", "--quiet", "-m", "feature")

    const response = await get(app, gitUrl("changes", { path: repo, scope: "branch" }))
    const body = GitChangesSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.scope).toBe("branch")
    expect(body.baseRef).toBe("refs/heads/main")
    expect(body.mergeBaseSha).toHaveLength(40)
    expect(body.files.map((file) => file.path).sort()).toEqual(["README.md", "feature.txt"])
    expect(body.totals.files).toBe(2)
  })
})

describe("GET /v1/git/file", () => {
  test("returns structured hunks for a tracked modification", async () => {
    const { app, dataDir } = await bootTestApp()
    const repo = await createRepo(dataDir)
    await writeFile(path.join(repo, "README.md"), "# repo\nchanged\n")

    const response = await get(
      app,
      gitUrl("file", {
        path: repo,
        scope: "uncommitted",
        file: "README.md",
      }),
    )
    const body = GitFileDiffSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.status).toBe("modified")
    expect(body.additions).toBe(1)
    expect(body.deletions).toBe(0)
    expect(body.hunks).toHaveLength(1)
    expect(body.hunks[0]?.lines.some((line) => line.kind === "addition")).toBe(true)
  })

  test("returns a full addition for an untracked file", async () => {
    const { app, dataDir } = await bootTestApp()
    const repo = await createRepo(dataDir)
    await writeFile(path.join(repo, "new.txt"), "new\n")

    const response = await get(
      app,
      gitUrl("file", {
        path: repo,
        scope: "uncommitted",
        file: "new.txt",
      }),
    )
    const body = GitFileDiffSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.status).toBe("untracked")
    expect(body.hunks[0]?.lines.map((line) => line.kind)).toEqual(["addition"])
    expect(body.hunks[0]?.lines[0]?.text).toBe("new")
  })

  test("returns the binary notice shape without hunks", async () => {
    const { app, dataDir } = await bootTestApp()
    const repo = await createRepo(dataDir)
    await writeFile(path.join(repo, "image.bin"), Buffer.from([0, 1, 2, 3]))

    const response = await get(
      app,
      gitUrl("file", {
        path: repo,
        scope: "uncommitted",
        file: "image.bin",
      }),
    )
    const body = GitFileDiffSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.binary).toBe(true)
    expect(body.hunks).toEqual([])
  })

  test("rejects path traversal in the file parameter", async () => {
    const { app, dataDir } = await bootTestApp()
    const repo = await createRepo(dataDir)

    const response = await get(
      app,
      gitUrl("file", {
        path: repo,
        scope: "uncommitted",
        file: "../secret",
      }),
    )
    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/file")
  })

  test("returns 404 for a file outside the change set", async () => {
    const { app, dataDir } = await bootTestApp()
    const repo = await createRepo(dataDir)
    await writeFile(path.join(repo, "README.md"), "# repo\nchanged\n")

    const response = await get(
      app,
      gitUrl("file", {
        path: repo,
        scope: "uncommitted",
        file: "not-changed.txt",
      }),
    )

    expect(response.statusCode).toBe(404)
    NotFoundProblemSchema.parse(JSON.parse(response.body))
  })
})
