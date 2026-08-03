export const parseAdvertisedEndpoint = (
  advertisedUrl: string,
): { hostname: string; port: number } => {
  const url = new URL(advertisedUrl)
  if (url.protocol !== "https:") {
    throw new Error("advertised URL must use https")
  }

  const port = url.port.length > 0 ? Number(url.port) : 443
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("advertised URL port is invalid")
  }

  return { hostname: url.hostname, port }
}
