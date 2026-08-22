export const knownCapabilityPaths = [
  "loadSession",
  "sessionCapabilities.list",
  "sessionCapabilities.close",
  "sessionCapabilities.resume",
  "sessionCapabilities.delete",
  "sessionCapabilities.additionalDirectories",
  "promptCapabilities.image",
  "promptCapabilities.audio",
  "promptCapabilities.embeddedContext",
  "mcpCapabilities.http",
  "mcpCapabilities.sse",
  "auth.logout",
] as const

export type KnownCapabilityPath = (typeof knownCapabilityPaths)[number]

export const isKnownCapabilityPath = (path: string): path is KnownCapabilityPath =>
  (knownCapabilityPaths as ReadonlyArray<string>).includes(path)
