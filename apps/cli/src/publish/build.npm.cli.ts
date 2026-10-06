import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const cliRoot = path.join(import.meta.dir, "..", "..")
const distDir = path.join(cliRoot, "dist")

const repository = {
  type: "git",
  url: "git+https://github.com/codenamegary/harold.git",
}

type SourceManifest = {
  name: string
  version: string
  description?: string
}

/**
 * The published package is the bundled CLI: all workspace dependencies are
 * inlined by the bundle, so the shipped manifest drops them along with
 * everything else that only makes sense inside the monorepo.
 */
export const makePublishableManifest = (source: SourceManifest) => ({
  name: source.name,
  version: source.version,
  description: source.description,
  type: "module",
  bin: {
    // no "./" prefix: npm 11.19 normalizes it away and warns it "removed"
    // the bin, which would publish the package without a command.
    harold: "harold.js",
  },
  repository,
  engines: {
    bun: ">=1.4.2",
  },
})

export const main = async () => {
  // The bundle inlines the embedded migrations, so the generated module
  // must exist before Bun.build runs.
  const serverRoot = path.join(cliRoot, "..", "server")
  await Bun.$`bun run codegen:migrations`.cwd(serverRoot).quiet()

  const source = JSON.parse(await readFile(path.join(cliRoot, "package.json"), "utf8"))
  await mkdir(distDir, { recursive: true })
  await writeFile(
    path.join(distDir, "package.json"),
    `${JSON.stringify(makePublishableManifest(source), null, 2)}\n`,
  )
  console.log(
    `[cli] wrote publishable manifest to ${path.relative(cliRoot, path.join(distDir, "package.json"))}`,
  )

  const built = await Bun.build({
    entrypoints: [path.join(cliRoot, "main.npm.ts")],
    target: "bun",
  })
  if (!built.success) {
    for (const message of built.logs) {
      console.error(message)
    }
    throw new Error(`[cli] bundle failed (${built.logs.length} problems)`)
  }
  const entry = built.outputs.find((output) => output.kind === "entry-point")
  if (entry === undefined) {
    throw new Error("[cli] bundle produced no entry-point output")
  }

  // npm resolves the bin through its shebang, so the published file must
  // start with one and be executable regardless of bundler output mode.
  const bundle = await entry.text()
  const withShebang = bundle.startsWith("#!") ? bundle : `#!/usr/bin/env bun\n${bundle}`
  const outfile = path.join(distDir, "harold.js")
  await writeFile(outfile, withShebang, { mode: 0o755 })
  console.log(`[cli] wrote bundled bin to ${path.relative(cliRoot, outfile)}`)
}

if (import.meta.main) {
  await main()
}
