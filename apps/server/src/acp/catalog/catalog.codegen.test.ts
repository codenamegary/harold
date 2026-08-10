import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { buildCatalogEntries } from "./build.catalog.entries"
import { registrySnapshotSchema } from "./registry.schema"
import { resolveCatalogSpawn } from "./resolve.catalog.spawn"
import { runCatalogCodegen } from "./run.catalog.codegen"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const fixtureSnapshotPath = path.join(import.meta.dir, "fixtures/registry.fixture.json")

describe("resolveCatalogSpawn", () => {
  test("maps binary, npx, and uvx distributions", async () => {
    const snapshot = registrySnapshotSchema.parse(
      JSON.parse(await readFile(fixtureSnapshotPath, "utf8")),
    )
    const byId = new Map(snapshot.agents.map((agent) => [agent.id, agent]))

    const binaryAgent = byId.get("fixture-binary")
    const npxAgent = byId.get("fixture-npx")
    const uvxAgent = byId.get("fixture-uvx")
    if (binaryAgent === undefined || npxAgent === undefined || uvxAgent === undefined) {
      throw new Error("fixture agents missing")
    }

    expect(resolveCatalogSpawn(binaryAgent)).toEqual({
      kind: "binary",
      binaryName: "fixture-bin",
      command: ["fixture-bin", "acp"],
    })

    expect(resolveCatalogSpawn(npxAgent)).toEqual({
      kind: "npx",
      binaryName: "npx",
      command: ["npx", "-y", "@example/fixture-npx@2.0.0", "--acp"],
    })

    expect(resolveCatalogSpawn(uvxAgent)).toEqual({
      kind: "uvx",
      binaryName: "uvx",
      command: ["uvx", "fixture-uvx==3.0.0", "acp"],
    })
  })
})

describe("catalog codegen fixture", () => {
  test("emits expected ids, catalog entries, and empty override skeletons", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "acp-catalog-codegen-"))
    tempDirs.push(dir)

    const snapshotPath = path.join(dir, "registry.snapshot.json")
    await writeFile(snapshotPath, await readFile(fixtureSnapshotPath))

    const paths = {
      snapshotPath,
      contractsAgentIdPath: path.join(dir, "agent.id.generated.ts"),
      catalogAgentsPath: path.join(dir, "catalog.agents.generated.ts"),
      overrideSkeletonsPath: path.join(dir, "agent.overrides.generated.ts"),
    }

    const result = runCatalogCodegen(paths)

    expect(result.agentIds).toEqual(["fixture-binary", "fixture-npx", "fixture-uvx"])
    expect(result.agentCount).toBe(3)

    const agentIdSource = await readFile(paths.contractsAgentIdPath, "utf8")
    expect(agentIdSource).toContain("z.string().min(1)")
    expect(agentIdSource).not.toContain("z.enum([")


    const catalogSource = await readFile(paths.catalogAgentsPath, "utf8")
    expect(catalogSource).toContain('"fixture-binary"')
    expect(catalogSource).toContain('binaryName: "fixture-bin"')
    expect(catalogSource).toContain('command: ["npx", "-y", "@example/fixture-npx@2.0.0", "--acp"]')
    expect(catalogSource).toContain('command: ["uvx", "fixture-uvx==3.0.0", "acp"]')

    const overridesSource = await readFile(paths.overrideSkeletonsPath, "utf8")
    expect(overridesSource).toContain('"fixture-binary": {')
    expect(overridesSource).toContain("Empty override skeleton")

    const entries = buildCatalogEntries(
      registrySnapshotSchema.parse(JSON.parse(await readFile(fixtureSnapshotPath, "utf8"))),
    )
    expect(entries.map((entry) => entry.id)).toEqual([
      "fixture-binary",
      "fixture-npx",
      "fixture-uvx",
    ])
  })
})
