import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { parse } from "yaml"

const repoRoot = path.join(import.meta.dir, "..", "..", "..", "..")
const workflowsDir = path.join(repoRoot, ".github", "workflows")

type WorkflowJob = Record<string, unknown>

describe("GitHub workflows", () => {
  test("every job declares a runner or calls a reusable workflow", async () => {
    // A job with steps but no runs-on is a startup failure: the whole
    // workflow dies at parse time before any job gets to run.
    const files = (await readdir(workflowsDir)).filter((file) => /\.ya?ml$/.test(file))
    expect(files.length).toBeGreaterThan(0)

    const offenders: Array<string> = []
    for (const file of files) {
      const workflow = parse(await readFile(path.join(workflowsDir, file), "utf8"))
      const jobs = (workflow.jobs ?? {}) as Record<string, WorkflowJob>
      for (const [jobId, job] of Object.entries(jobs)) {
        const hasRunner = typeof job["runs-on"] === "string"
        const callsWorkflow = typeof job["uses"] === "string"
        if (!hasRunner && !callsWorkflow) {
          offenders.push(`${file}:${jobId}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  test("maps release-please outputs with the component path prefix", async () => {
    // release-please-action namespaces outputs by component path for any
    // package not at the repo root (apps/cli--release_created), and only
    // emits plain names for the special "." component. Mapping the wrong
    // name leaves the output empty and silently skips the npm job.
    const config = JSON.parse(
      await readFile(path.join(repoRoot, "release-please-config.json"), "utf8"),
    )
    const workflow = await readFile(path.join(workflowsDir, "release-please.yml"), "utf8")

    for (const componentPath of Object.keys(config.packages)) {
      if (componentPath === ".") {
        continue
      }
      expect(workflow).toContain(`${componentPath}--release_created`)
      expect(workflow).toContain(`${componentPath}--tag_name`)
    }
  })
})
