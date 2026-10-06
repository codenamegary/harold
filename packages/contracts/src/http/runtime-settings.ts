import { z } from "zod"

export const RUNTIME_SETTINGS_PATH = "/v1/settings/runtime" as const

export const logLevels = ["fatal", "error", "warn", "info", "debug", "trace"] as const

export const LogLevelSchema = z.enum(logLevels)

export type LogLevel = z.infer<typeof LogLevelSchema>

const ipv4Octet = /^(?:0|[1-9]\d?|1\d\d|2[0-4]\d|25[0-5])$/

export const isIpv4Address = (value: string): boolean => {
  const parts = value.split(".")
  return parts.length === 4 && parts.every((part) => ipv4Octet.test(part))
}

export const isIpv6Address = (value: string): boolean => {
  if (value.length === 0 || value.includes("[") || value.includes("]")) {
    return false
  }

  const bare = value.includes("%") ? value.slice(0, value.indexOf("%")) : value
  if (bare.includes(":::")) {
    return false
  }

  const hasCompression = bare.includes("::")
  const normalized = hasCompression ? bare.replace("::", ":") : bare
  if (hasCompression && bare.indexOf("::") !== bare.lastIndexOf("::")) {
    return false
  }

  const parts = normalized.split(":").filter((part) => part.length > 0)
  const maxParts = hasCompression ? 7 : 8
  if (parts.length > maxParts) {
    return false
  }
  if (!hasCompression && parts.length !== 8) {
    return false
  }
  if (hasCompression && parts.length >= 8) {
    return false
  }

  return parts.every((part) => {
    if (part.includes(".")) {
      return isIpv4Address(part)
    }
    return /^[0-9a-fA-F]{1,4}$/.test(part)
  })
}

export const HttpsAbsoluteUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      if (!value.startsWith("https://")) {
        return false
      }

      const withoutScheme = value.slice("https://".length)
      if (withoutScheme.length === 0 || /[\s<>"{}|\\^`]/.test(withoutScheme)) {
        return false
      }

      const authority = withoutScheme.split(/[/?#]/, 2)[0] ?? ""
      if (authority.length === 0) {
        return false
      }

      if (authority.startsWith("[")) {
        if (!authority.includes("]")) {
          return false
        }
        const closing = authority.indexOf("]")
        const host = authority.slice(1, closing)
        const rest = authority.slice(closing + 1)
        if (!isIpv6Address(host)) {
          return false
        }
        return rest === "" || /^:\d{1,5}$/.test(rest)
      }

      const hostPort = authority.split(":")
      if (hostPort.length > 2) {
        return false
      }

      const host = hostPort[0] ?? ""
      const port = hostPort[1]
      if (host.length === 0 || host.includes("[") || host.includes("]")) {
        return false
      }
      if (port !== undefined && !/^\d{1,5}$/.test(port)) {
        return false
      }

      return true
    },
    { message: "must be an absolute https URL" },
  )

export const isLoopbackHostname = (hostname: string): boolean =>
  hostname === "localhost" ||
  hostname === "::1" ||
  (isIpv4Address(hostname) && hostname.split(".")[0] === "127")

export const isHttpLoopbackUrl = (value: string): boolean => {
  if (!value.startsWith("http://")) {
    return false
  }

  const withoutScheme = value.slice("http://".length)
  if (withoutScheme.length === 0 || /[\s<>"{}|\\^`]/.test(withoutScheme)) {
    return false
  }

  const authority = withoutScheme.split(/[/?#]/, 2)[0] ?? ""
  if (authority.length === 0) {
    return false
  }

  if (authority.startsWith("[")) {
    if (!authority.includes("]")) {
      return false
    }
    const closing = authority.indexOf("]")
    const host = authority.slice(1, closing)
    const rest = authority.slice(closing + 1)
    if (!isIpv6Address(host)) {
      return false
    }
    if (rest !== "" && !/^:\d{1,5}$/.test(rest)) {
      return false
    }
    return isLoopbackHostname(host)
  }

  const hostPort = authority.split(":")
  if (hostPort.length > 2) {
    return false
  }

  const host = hostPort[0] ?? ""
  const port = hostPort[1]
  if (host.length === 0 || host.includes("[") || host.includes("]")) {
    return false
  }
  if (port !== undefined && !/^\d{1,5}$/.test(port)) {
    return false
  }

  return isLoopbackHostname(host)
}

/**
 * Reachability rule (#313): a non-loopback advertised endpoint must be https,
 * while http stays allowed on loopback hosts for local development.
 */
export const AdvertisedUrlSchema = z
  .string()
  .min(1)
  .refine((value) => HttpsAbsoluteUrlSchema.safeParse(value).success || isHttpLoopbackUrl(value), {
    message: "must be an absolute https URL, or an http URL on a loopback host",
  })

export const RuntimeSettingsSchema = z.strictObject({
  advertisedUrl: AdvertisedUrlSchema.nullable(),
  advertisedUrlEnabled: z.boolean().default(true),
  bindHost: z.literal("127.0.0.1"),
  bindPort: z.number().int().nonnegative().max(65535),
  logLevel: LogLevelSchema,
  // `null` means the daemon writes to the default log file under the data dir
  // (`harold.log`), not to stdout; the CLI tails that same file with
  // `harold logs` (ADR-0006). A non-null value is an explicit log file path.
  logPath: z.string().min(1).nullable(),
  allowedRoots: z.array(z.string().min(1)),
})

export const UpdateRuntimeSettingsBodySchema = z.strictObject({
  advertisedUrl: z.union([AdvertisedUrlSchema, z.null(), z.literal("")]).optional(),
  advertisedUrlEnabled: z.boolean().optional(),
  bindHost: z.literal("127.0.0.1").optional(),
  bindPort: z.number().int().nonnegative().max(65535).optional(),
  logLevel: LogLevelSchema.optional(),
  logPath: z.union([z.string().min(1), z.null()]).optional(),
  allowedRoots: z.array(z.string().min(1)).optional(),
})

export const RuntimeSettingsOverrideSourceSchema = z.enum(["env"])

export const RuntimeSettingsOverridesSchema = z.strictObject({
  bindHost: RuntimeSettingsOverrideSourceSchema.optional(),
  bindPort: RuntimeSettingsOverrideSourceSchema.optional(),
})

export const RuntimeSettingsEffectiveSchema = z.strictObject({
  bindHost: z.literal("127.0.0.1"),
  bindPort: z.number().int().nonnegative().max(65535),
  logPath: z.string().min(1).nullable(),
})

export const RuntimeSettingsViewSchema = z.strictObject({
  settings: RuntimeSettingsSchema,
  restartRequired: z.boolean(),
  effective: RuntimeSettingsEffectiveSchema,
  overrides: RuntimeSettingsOverridesSchema,
})

export const UpdateRuntimeSettingsResponseSchema = RuntimeSettingsViewSchema

export const PatchRuntimeSettingsQuerySchema = z.strictObject({
  force: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
})

export type RuntimeSettings = z.infer<typeof RuntimeSettingsSchema>
export type UpdateRuntimeSettingsBody = z.infer<typeof UpdateRuntimeSettingsBodySchema>
export type RuntimeSettingsOverrideSource = z.infer<typeof RuntimeSettingsOverrideSourceSchema>
export type RuntimeSettingsOverrides = z.infer<typeof RuntimeSettingsOverridesSchema>
export type RuntimeSettingsEffective = z.infer<typeof RuntimeSettingsEffectiveSchema>
export type RuntimeSettingsView = z.infer<typeof RuntimeSettingsViewSchema>
export type UpdateRuntimeSettingsResponse = RuntimeSettingsView
export type PatchRuntimeSettingsQuery = z.infer<typeof PatchRuntimeSettingsQuerySchema>

export const normalizeAdvertisedUrl = (
  value: string | null | undefined,
): string | null | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (value === null || value === "") {
    return null
  }
  return value
}
