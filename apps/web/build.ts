import { rm } from "node:fs/promises"
import tailwind from "bun-plugin-tailwind"

const outdir = "./dist"

process.env.NODE_ENV = "production"

await rm(outdir, { recursive: true, force: true })

const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir,
  target: "browser",
  minify: true,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  plugins: [tailwind],
})

if (!result.success) {
  console.error("[web] build failed")
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

console.log(`[web] built to ${outdir}`)
