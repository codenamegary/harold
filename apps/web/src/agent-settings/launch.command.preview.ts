const quotePreviewArg = (arg: string): string => {
  if (arg === "") {
    return '""'
  }

  if (/[\s"'\\]/.test(arg)) {
    return `"${arg.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
  }

  return arg
}

export const formatLaunchCommandPreview = (
  path: string,
  args: readonly string[],
): string => {
  if (path === "" && args.length === 0) {
    return ""
  }

  return [path, ...args].map(quotePreviewArg).join(" ")
}