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
})
