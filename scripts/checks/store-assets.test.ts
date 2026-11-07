import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { Glob } from "bun"

const repoRoot = join(import.meta.dir, "../..")
const storeRoot = join(repoRoot, "docs/store-android")
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const megabyte = 1024 * 1024

type Png = Readonly<{
  width: number
  height: number
  colorType: number
}>

const readPng = async (file: string): Promise<Png> => {
  const path = join(storeRoot, file)
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer())
  expect(Array.from(bytes.slice(0, pngSignature.length)), `${file} is a PNG`).toEqual(pngSignature)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
    colorType: bytes[25] ?? -1,
  }
}

const expectFileWithin = async (file: string, maxBytes: number): Promise<void> => {
  const size = Bun.file(join(storeRoot, file)).size
  expect(size, `${file} exists`).toBeGreaterThan(0)
  expect(size, `${file} is under ${maxBytes / megabyte} MB`).toBeLessThanOrEqual(maxBytes)
}

const section = (text: string, heading: string): string => {
  const start = text.indexOf(heading)
  expect(start, `${heading} exists`).toBeGreaterThanOrEqual(0)
  const bodyStart = start + heading.length
  const end = text.indexOf("\n## ", bodyStart)
  return text.slice(bodyStart, end === -1 ? undefined : end).trim()
}

describe("Google Play store assets", () => {
  test("app icon is an opaque 512 by 512 PNG under 1 MB", async () => {
    const file = "app-icon-512x512.png"
    await expectFileWithin(file, megabyte)
    const png = await readPng(file)
    expect(png.width).toBe(512)
    expect(png.height).toBe(512)
    // Google Play applies the launcher mask itself. The source icon must be
    // fully opaque and square, so colors 4 and 6 (alpha channels) fail.
    expect([4, 6], `${file} has no alpha channel`).not.toContain(png.colorType)
  })

  test("feature graphic is a 1024 by 500 PNG under 15 MB", async () => {
    const file = "feature-graphic-1024x500.png"
    await expectFileWithin(file, 15 * megabyte)
    const png = await readPng(file)
    expect(png.width).toBe(1024)
    expect(png.height).toBe(500)
  })

  test("includes 2 to 8 phone screenshots with a Play-compatible shape", async () => {
    const files = [...new Glob("phone-*.png").scanSync({ cwd: storeRoot })].sort()
    expect(files.length).toBeGreaterThanOrEqual(2)
    expect(files.length).toBeLessThanOrEqual(8)

    for (const file of files) {
      await expectFileWithin(file, 8 * megabyte)
      const png = await readPng(file)
      expect(png.width, `${file} width`).toBeGreaterThanOrEqual(320)
      expect(png.width, `${file} width`).toBeLessThanOrEqual(3840)
      expect(png.height, `${file} height`).toBeGreaterThanOrEqual(320)
      expect(png.height, `${file} height`).toBeLessThanOrEqual(3840)
      expect(
        png.width * 16 === png.height * 9 || png.width * 9 === png.height * 16,
        `${file} is 16:9 or 9:16`,
      ).toBe(true)
    }
  })

  test("foreground service demo video is a compact MP4 referenced by the docs", async () => {
    const file = "foreground-service-demo.mp4"
    const path = join(storeRoot, file)
    const video = Bun.file(path)
    expect(video.size, `${file} exists`).toBeGreaterThan(100_000)
    expect(video.size, `${file} is under 20 MB`).toBeLessThanOrEqual(20 * megabyte)

    // MP4 files carry an ftyp box at bytes 4..8. This catches a git-lfs
    // pointer or a truncated recording without pulling ffprobe into CI.
    const header = new Uint8Array(await video.slice(4, 8).arrayBuffer())
    expect(new TextDecoder().decode(header), `${file} is an MP4`).toBe("ftyp")

    const readme = await Bun.file(join(storeRoot, "README.md")).text()
    const listing = await Bun.file(join(storeRoot, "store-listing.md")).text()
    for (const doc of [readme, listing]) {
      expect(doc).toContain(file)
    }
  })

  test("review access docs describe connecting to an SSH host", async () => {
    const readme = await Bun.file(join(storeRoot, "README.md")).text()
    const listing = await Bun.file(join(storeRoot, "store-listing.md")).text()
    const appAccess = section(listing, "## App access for review")

    for (const doc of [readme, appAccess]) {
      expect(doc).toContain("SSH")
    }
  })

  test("store listing copy is present and within Play length limits", async () => {
    const listing = await Bun.file(join(storeRoot, "store-listing.md")).text()
    for (const heading of ["App name", "Short description", "Full description"]) {
      expect(listing).toContain(heading)
    }

    const name = section(listing, "## App name (30 characters max)")
    const short = section(listing, "## Short description (80 characters max)")
    const full = section(listing, "## Full description (4,000 characters max)")
    expect(name.length).toBeGreaterThan(0)
    expect(name.length).toBeLessThanOrEqual(30)
    expect(short.length).toBeGreaterThan(0)
    expect(short.length).toBeLessThanOrEqual(80)
    expect(full.length).toBeGreaterThan(0)
    expect(full.length).toBeLessThanOrEqual(4000)
  })
})
