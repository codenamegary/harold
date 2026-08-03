const httpsPrefix = "https://"

export const hostFromAdvertisedUrl = (advertisedUrl: string | null): string => {
  if (advertisedUrl === null) {
    return ""
  }

  return advertisedUrl.startsWith(httpsPrefix)
    ? advertisedUrl.slice(httpsPrefix.length)
    : advertisedUrl
}

export const normalizeExternalUrlHost = (value: string): string => {
  const trimmed = value.trim()
  if (trimmed.startsWith(httpsPrefix)) {
    return trimmed.slice(httpsPrefix.length)
  }

  return trimmed
}

export const advertisedUrlFromHost = (host: string): string => `${httpsPrefix}${host}`
