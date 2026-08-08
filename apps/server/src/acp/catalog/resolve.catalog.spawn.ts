import { RegistryAgent, RegistryDistribution } from "./registry.schema"

export type CatalogSpawnKind = "binary" | "npx" | "uvx"

export type CatalogSpawn = {
  readonly kind: CatalogSpawnKind
  readonly binaryName: string
  readonly command: readonly string[]
}

const basenameFromCmd = (cmd: string): string => {
  const normalized = cmd.replaceAll("\\", "/")
  const base = normalized.split("/").at(-1) ?? normalized
  return base.replace(/\.exe$/i, "").replace(/\.cmd$/i, "")
}

const resolveBinarySpawn = (
  binary: NonNullable<RegistryDistribution["binary"]>,
): CatalogSpawn => {
  const preferredKeys = ["linux-x86_64", "linux-aarch64", "darwin-aarch64", "darwin-x86_64"]
  const platformKey =
    preferredKeys.find((key) => binary[key] !== undefined) ?? Object.keys(binary)[0]

  if (platformKey === undefined) {
    throw new Error("binary distribution has no platforms")
  }

  const platform = binary[platformKey]
  if (platform === undefined) {
    throw new Error(`binary distribution missing platform ${platformKey}`)
  }

  const binaryName = basenameFromCmd(platform.cmd)
  const args = platform.args ?? []

  return {
    kind: "binary",
    binaryName,
    command: [binaryName, ...args],
  }
}

const resolveNpxSpawn = (
  npx: NonNullable<RegistryDistribution["npx"]>,
): CatalogSpawn => {
  const args = npx.args ?? []
  return {
    kind: "npx",
    binaryName: "npx",
    command: ["npx", npx.package, ...args],
  }
}

const resolveUvxSpawn = (
  uvx: NonNullable<RegistryDistribution["uvx"]>,
): CatalogSpawn => {
  const args = uvx.args ?? []
  return {
    kind: "uvx",
    binaryName: "uvx",
    command: ["uvx", uvx.package, ...args],
  }
}

export const resolveCatalogSpawn = (agent: RegistryAgent): CatalogSpawn => {
  const { distribution } = agent

  if (distribution.binary !== undefined) {
    return resolveBinarySpawn(distribution.binary)
  }

  if (distribution.npx !== undefined) {
    return resolveNpxSpawn(distribution.npx)
  }

  if (distribution.uvx !== undefined) {
    return resolveUvxSpawn(distribution.uvx)
  }

  throw new Error(`agent ${agent.id} has no supported distribution`)
}
