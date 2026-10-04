export const CUSTOM_AGENT_ID_PREFIX = "custom-"

export const isCustomAgentId = (agentId: string): boolean =>
  agentId === "custom" || agentId.startsWith(CUSTOM_AGENT_ID_PREFIX)

export const toKebabSlug = (displayName: string): string => {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")

  return slug === "" ? "agent" : slug
}

export const customAgentIdFromDisplayName = (displayName: string): string =>
  `${CUSTOM_AGENT_ID_PREFIX}${toKebabSlug(displayName)}`

export const allocateCustomAgentId = (
  displayName: string,
  existingIds: ReadonlySet<string>,
): string => {
  const base = customAgentIdFromDisplayName(displayName)
  if (!existingIds.has(base)) {
    return base
  }

  let suffix = 2
  while (existingIds.has(`${base}-${suffix}`)) {
    suffix += 1
  }
  return `${base}-${suffix}`
}

export const allocateCustomDisplayName = (existingDisplayNames: ReadonlySet<string>): string => {
  const base = "Custom Agent"
  if (!existingDisplayNames.has(base)) {
    return base
  }

  let index = 1
  while (existingDisplayNames.has(`${base} ${index}`)) {
    index += 1
  }
  return `${base} ${index}`
}
