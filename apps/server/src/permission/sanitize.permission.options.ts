import { PermissionOption, PermissionOptionKindSchema } from "contracts/http/permission"

type RawPermissionOption = {
  optionId?: string
  name?: string
  kind?: string
}

const sanitizeOptionKind = (value: unknown): PermissionOption["kind"] => {
  const parsed = PermissionOptionKindSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export const sanitizePermissionOptions = (
  options: unknown,
): ReadonlyArray<PermissionOption> => {
  if (!Array.isArray(options)) {
    return []
  }

  return options.flatMap((option): PermissionOption[] => {
    if (typeof option !== "object" || option === null) {
      return []
    }

    const value = option as RawPermissionOption
    if (value.optionId === undefined || value.name === undefined) {
      return []
    }

    if (value.optionId.length === 0 || value.name.length === 0) {
      return []
    }

    const kind = sanitizeOptionKind(value.kind)
    return kind === undefined
      ? [{ optionId: value.optionId, name: value.name }]
      : [{ optionId: value.optionId, name: value.name, kind }]
  })
}
