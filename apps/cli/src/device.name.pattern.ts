const regexSpecialCharacters = /[.*+?^${}()|[\]\\]/g

const escapeRegex = (text: string): string => text.replace(regexSpecialCharacters, "\\$&")

/**
 * Compiles a case-insensitive glob where `*` matches any run of characters.
 * Every other character, including regex metacharacters, matches literally.
 */
export const makeDeviceNameMatcher = (pattern: string): ((name: string) => boolean) => {
  const source = pattern.split("*").map(escapeRegex).join(".*")
  const expression = new RegExp(`^${source}$`, "i")

  return (name) => expression.test(name)
}
