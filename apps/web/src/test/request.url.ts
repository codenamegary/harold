export const requestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") {
    return input
  }

  if (input instanceof URL) {
    return input.href
  }

  return input.url
}

export const requestBodyText = (body: BodyInit | null | undefined): string => {
  if (body == null) {
    return "{}"
  }

  if (typeof body === "string") {
    return body
  }

  throw new Error("expected string request body in test")
}

export const hrefOf = (url: string | URL): string =>
  typeof url === "string" ? url : url.href
