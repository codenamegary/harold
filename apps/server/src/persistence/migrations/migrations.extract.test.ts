import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { EmbeddedMigrationFile, extractMigrationFiles } from "./migrations.extract"

const makeFiles = (): Array<EmbeddedMigrationFile> => [
  { name: "0000_create_table.sql", body: Buffer.from("CREATE TABLE example (id text);") },
  { name: "0001_add_column.sql", body: Buffer.from("ALTER TABLE example ADD note text;") },
  { name: "meta/_journal.json", body: Buffer.from('{"entries":[]}') },
]

describe("extract migration files", () => {
  let targetDir: string | undefined

  afterEach(async () => {
    if (targetDir !== undefined) {
      await rm(targetDir, { recursive: true, force: true })
      targetDir = undefined
    }
  })

  const boot = async (files: ReadonlyArray<EmbeddedMigrationFile>) => {
    targetDir = await mkdtemp(path.join(os.tmpdir(), "agent-server-migrations-test-"))
    await extractMigrationFiles(files, targetDir)
  }

  test("writes every file into the target directory", async () => {
    const files = makeFiles()

    await boot(files)

    for (const file of files) {
      const written = await readFile(path.join(targetDir!, file.name))
      expect(new Uint8Array(written)).toEqual(new Uint8Array(file.body))
    }
  })

  test("creates nested directories for journal files", async () => {
    await boot([{ name: "meta/_journal.json", body: Buffer.from('{"entries":[]}') }])

    const journal = await stat(path.join(targetDir!, "meta", "_journal.json"))
    expect(journal.isFile()).toBe(true)
  })

  test("overwrites existing files on re-extraction", async () => {
    targetDir = await mkdtemp(path.join(os.tmpdir(), "agent-server-migrations-test-"))
    const target = path.join(targetDir, "0000_create_table.sql")
    await writeFile(target, "stale")

    await extractMigrationFiles(
      [{ name: "0000_create_table.sql", body: Buffer.from("fresh") }],
      targetDir,
    )

    expect(await readFile(target, "utf8")).toBe("fresh")
  })
})
