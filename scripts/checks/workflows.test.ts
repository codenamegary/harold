import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { Glob } from "bun"

type Trigger = Readonly<{
  branches?: readonly string[]
  paths?: readonly string[]
  "paths-ignore"?: readonly string[]
}>

type Step = Readonly<{
  uses?: string
  run?: string
  with?: Readonly<Record<string, string | undefined>>
}>

type Job = Readonly<{
  if?: string
  needs?: string | readonly string[]
  steps?: readonly Step[]
}>

type Workflow = Readonly<{
  on?: Readonly<Record<string, Trigger | undefined>>
  jobs?: Readonly<Record<string, Job>>
}>

const repoRoot = join(import.meta.dir, "../..")
const workflowsRoot = ".github/workflows"

const loadWorkflow = async (file: string): Promise<Workflow> =>
  Bun.YAML.parse(await Bun.file(join(repoRoot, file)).text())

const loadWorkflows = async (): Promise<ReadonlyMap<string, Workflow>> => {
  const files = [...new Glob("*.yml").scanSync({ cwd: join(repoRoot, workflowsRoot) })]
    .sort()
    .map((file) => join(workflowsRoot, file))
  expect(files.length).toBeGreaterThan(0)
  return new Map(await Promise.all(files.map(async (file) => [file, await loadWorkflow(file)])))
}

const loadCi = async (): Promise<Workflow> => {
  const ci = await loadWorkflow(`${workflowsRoot}/ci.yml`)
  expect(ci.jobs).toBeDefined()
  return ci
}

const needsOf = (job: Job | undefined): readonly string[] => {
  if (job?.needs === undefined) return []
  return typeof job.needs === "string" ? [job.needs] : [...job.needs]
}

describe("pull request triggers", () => {
  test("no workflow filters pull_request with paths", async () => {
    // The branch protection bug this repo had: a path-filtered pull_request
    // workflow never creates a check run for some PRs, so marking one of its
    // checks as required blocks those PRs forever.
    const violations: string[] = []
    for (const [file, workflow] of await loadWorkflows()) {
      for (const event of ["pull_request", "pull_request_target"]) {
        const trigger = workflow.on?.[event]
        if (trigger === undefined) continue
        if (trigger.paths !== undefined) violations.push(`${file}: ${event} has paths`)
        if (trigger["paths-ignore"] !== undefined)
          violations.push(`${file}: ${event} has paths-ignore`)
      }
    }
    expect(violations).toEqual([])
  })
})

describe("ci.yml", () => {
  test("runs on every pull request to main", async () => {
    const trigger = (await loadCi()).on?.pull_request
    expect(trigger).toBeDefined()
    expect(trigger?.branches).toContain("main")
  })

  test("gates every other job behind ci-ok", async () => {
    const jobs = (await loadCi()).jobs ?? {}
    const gate = jobs["ci-ok"]
    expect(gate).toBeDefined()
    expect(gate.if).toContain("always()")
    expect(needsOf(gate).sort()).toEqual(
      Object.keys(jobs)
        .filter((id) => id !== "ci-ok")
        .sort(),
    )
  })

  test("ci-ok reaches the gate verdict script", async () => {
    const gate = (await loadCi()).jobs?.["ci-ok"]
    const runs = (gate?.steps ?? []).map((step) => step.run ?? "").join("\n")
    expect(runs).toContain("scripts/ci/gate.ts")
  })

  test("path-filtered jobs wait for changes and read their own output", async () => {
    const jobs = (await loadCi()).jobs ?? {}
    for (const id of ["check", "android", "smoke"]) {
      const job = jobs[id]
      expect(job).toBeDefined()
      expect(needsOf(job)).toContain("changes")
      expect(job?.if).toContain(`needs.changes.outputs.${id}`)
    }
  })

  test("filters keep the path coverage of the retired workflows", async () => {
    const changes = (await loadCi()).jobs?.["changes"]
    const step = (changes?.steps ?? []).find((s) => s.uses?.startsWith("dorny/paths-filter"))
    expect(step).toBeDefined()
    // Without the quantifier, the `!apps/android/**` exclusion in `check`
    // is silently ignored and android-only PRs would run the full check.
    expect(step?.with?.["predicate-quantifier"]).toBe("some-with-excludes")

    const filters = Bun.YAML.parse(step?.with?.filters ?? "") as Record<string, readonly string[]>
    expect(filters.check).toContain("**")
    expect(filters.check).toContain("!apps/android/**")
    expect(filters.android).toContain("apps/android/**")
    expect(filters.smoke).toEqual(
      expect.arrayContaining(["apps/server/**", "packages/contracts/**", "bun.lock"]),
    )
  })
})
