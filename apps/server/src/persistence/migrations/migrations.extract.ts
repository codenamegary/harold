import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

export type EmbeddedMigrationFile = {
  name: string
  body: Uint8Array
}

export const extractMigrationFiles = async (
  files: ReadonlyArray<EmbeddedMigrationFile>,
  targetDir: string,
): Promise<string> => {
  await mkdir(targetDir, { recursive: true })
  await Promise.all(
    files.map(async (file) => {
      const target = path.join(targetDir, file.name)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, file.body)
    }),
  )
  return targetDir
}
