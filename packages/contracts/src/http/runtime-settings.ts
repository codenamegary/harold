import { z } from "zod"

export const logLevels = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
] as const

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

export const isIpOrCidr = (value: string): boolean => {
  const slash = value.lastIndexOf("/")
  if (slash === -1) {
    return isIpv4Address(value) || isIpv6Address(value)
  }

  const address = value.slice(0, slash)
  const prefixText = value.slice(slash + 1)
  if (!/^\d{1,3}$/.test(prefixText)) {
    return false
  }

  const prefix = Number(prefixText)
  if (!Number.isInteger(prefix) || String(prefix) !== prefixText) {
    return false
  }

  if (isIpv4Address(address)) {
    return prefix >= 0 && prefix <= 32
  }

  if (isIpv6Address(address)) {
    return prefix >= 0 && prefix <= 128
  }

  return false
}

export const TrustedProxySchema = z
  .string()
  .min(1)
  .refine(isIpOrCidr, { message: "must be an IPv4/IPv6 address or CIDR" })

export const HttpsAbsoluteUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      if (!value.startsWith("https://")) {
        return false
      }
      const withoutScheme = value.slice("https://".length)
      if (withoutScheme.length === 0) {
        return false
      }
      if (withoutScheme.includes(" ") || withoutScheme.includes("\n")) {
        return false
      }
      const authority = withoutScheme.split(/[/?#]/, 2)[0] ?? ""
      return authority.length > 0
    },
    { message: "must be an absolute https URL" },
  )

export const RuntimeSettingsSchema = z.strictObject({
  advertisedUrl: HttpsAbsoluteUrlSchema.nullable(),
  trustedProxies: z.array(TrustedProxySchema),
  bindHost: z.literal("127.0.0.1"),
  bindPort: z.number().int().nonnegative().max(65535),
  logLevel: LogLevelSchema,
  logPath: z.string().min(1).nullable(),
  allowedRoots: z.array(z.string().min(1)),
})

export const UpdateRuntimeSettingsBodySchema = z.strictObject({
  advertisedUrl: z
    .union([HttpsAbsoluteUrlSchema, z.null(), z.literal("")])
    .optional(),
  trustedProxies: z.array(TrustedProxySchema).optional(),
  bindHost: z.literal("127.0.0.1").optional(),
  bindPort: z.number().int().nonnegative().max(65535).optional(),
  logLevel: LogLevelSchema.optional(),
  logPath: z.union([z.string().min(1), z.null()]).optional(),
  allowedRoots: z.array(z.string().min(1)).optional(),
})

export const UpdateRuntimeSettingsResponseSchema = z.strictObject({
  settings: RuntimeSettingsSchema,
  restartRequired: z.boolean(),
})

export type RuntimeSettings = z.infer<typeof RuntimeSettingsSchema>
export type UpdateRuntimeSettingsBody = z.infer<typeof UpdateRuntimeSettingsBodySchema>
export type UpdateRuntimeSettingsResponse = z.infer<
  typeof UpdateRuntimeSettingsResponseSchema
>

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
