import { mkdir } from "node:fs/promises"
import path from "node:path"

const targets = ["linux-x64", "darwin-arm64", "windows-x64"] as const

const serverRoot = path.join(import.meta.dir, "..", "..")
const entrypoint = path.join(serverRoot, "main.compile.ts")
const outDir = path.join(serverRoot, "release")

const main = async () => {
  await mkdir(outDir, { recursive: true })

  for (const target of targets) {
    const extension = target.startsWith("windows-") ? ".exe" : ""
    const outfile = path.join(outDir, `agent-server-${target}${extension}`)
    console.log(`[server] compiling ${target}...`)
    await Bun.$`bun build --compile --target bun-${target} ${entrypoint} --outfile ${outfile}`
    console.log(`[server] wrote ${path.relative(serverRoot, outfile)}`)
  }
}

await main()
