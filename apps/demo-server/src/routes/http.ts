const PROBLEM_TYPES = {
  validationError: "https://harold.local/problems/validation-error",
  internalError: "https://harold.local/problems/internal-error",
  notFound: "https://harold.local/problems/not-found",
  conflict: "https://harold.local/problems/conflict",
  unprocessable: "https://harold.local/problems/unprocessable",
  unauthorized: "https://harold.local/problems/unauthorized",
  rateLimited: "https://harold.local/problems/rate-limited",
  payloadTooLarge: "https://harold.local/problems/payload-too-large",
  unsupportedMediaType: "https://harold.local/problems/unsupported-media-type",
}

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  })

export const noContentResponse = (): Response => new Response(null, { status: 204 })

const problemResponse = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json; charset=utf-8" },
  })

export const badRequest = (pointer: string, code: string): Response =>
  problemResponse(400, {
    type: PROBLEM_TYPES.validationError,
    title: "Invalid request",
    status: 400,
    code,
    errors: [{ pointer, code }],
  })

export const notFound = (detail = "Not found"): Response =>
  problemResponse(404, {
    type: PROBLEM_TYPES.notFound,
    title: "Not found",
    status: 404,
    detail,
  })

export const conflict = (detail = "Conflict"): Response =>
  problemResponse(409, {
    type: PROBLEM_TYPES.conflict,
    title: "Conflict",
    status: 409,
    detail,
  })

export const unprocessable = (detail = "Unprocessable request"): Response =>
  problemResponse(422, {
    type: PROBLEM_TYPES.unprocessable,
    title: "Unprocessable request",
    status: 422,
    detail,
  })

export const unauthorized = (detail = "Authentication required"): Response =>
  new Response(
    JSON.stringify({
      type: PROBLEM_TYPES.unauthorized,
      title: "Unauthorized",
      status: 401,
      detail,
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/problem+json; charset=utf-8",
        "www-authenticate": "Bearer",
      },
    },
  )

export const rateLimited = (detail = "Too many requests"): Response =>
  problemResponse(429, {
    type: PROBLEM_TYPES.rateLimited,
    title: "Too many requests",
    status: 429,
    detail,
  })

export const internalError = (): Response =>
  problemResponse(500, {
    type: PROBLEM_TYPES.internalError,
    title: "Internal server error",
    status: 500,
  })

export const payloadTooLarge = (detail = "Attachment is too large"): Response =>
  problemResponse(413, {
    type: PROBLEM_TYPES.payloadTooLarge,
    title: "Payload too large",
    status: 413,
    detail,
  })

export const unsupportedMediaType = (detail = "Unsupported media type"): Response =>
  problemResponse(415, {
    type: PROBLEM_TYPES.unsupportedMediaType,
    title: "Unsupported media type",
    status: 415,
    detail,
  })

export const readJsonObject = async (request: Request): Promise<Record<string, unknown> | null> => {
  try {
    const value: unknown = await request.json()
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return null
    }
    return value as Record<string, unknown>
  } catch {
    return null
  }
}

/** Drops a body without parsing or buffering it. */
export const discardBody = async (request: Request): Promise<void> => {
  try {
    await request.body?.cancel()
  } catch {
    // A body already gone is still a discarded body.
  }
}

export const readString = (
  body: Record<string, unknown>,
  key: string,
  minLength: number,
  maxLength: number,
): string | null => {
  const value = body[key]
  if (typeof value !== "string") {
    return null
  }
  if (value.length < minLength || value.length > maxLength) {
    return null
  }
  return value
}

const boundaryFromContentType = (contentType: string): string | null => {
  const match = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
  const boundary = match?.[1] ?? match?.[2]?.trim()
  return boundary !== undefined && boundary.length > 0 ? boundary : null
}

type MultipartContentTypeResult =
  | { ok: true; contentType: string | null }
  | { ok: false; reason: "not_multipart" | "missing_boundary" }

const HEADER_LIMIT_BYTES = 16 * 1024

/**
 * Reads only the first part's headers until the blank line, then cancels the
 * body. It never decodes file bytes, never reads the filename, and never
 * buffers the upload. The returned value is only the file part Content-Type.
 */
export const readMultipartFileContentType = async (
  request: Request,
): Promise<MultipartContentTypeResult> => {
  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return { ok: false, reason: "not_multipart" }
  }
  const boundary = boundaryFromContentType(contentType)
  if (boundary === null) {
    return { ok: false, reason: "missing_boundary" }
  }

  const body = request.body
  if (body === null) {
    return { ok: true, contentType: null }
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffered = ""
  let scannedBytes = 0
  let headerEnd = -1

  try {
    while (headerEnd < 0 && scannedBytes < HEADER_LIMIT_BYTES) {
      const result = await reader.read()
      if (result.done) {
        break
      }
      const value = result.value
      scannedBytes += value.byteLength
      buffered += decoder.decode(value, { stream: true })
      headerEnd = buffered.indexOf("\r\n\r\n")
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      // Cancelling a closed stream is fine.
    }
  }

  if (headerEnd < 0) {
    return { ok: true, contentType: null }
  }

  const headerBlock = buffered.slice(0, headerEnd)
  const match = /^content-type:\s*(.+)$/im.exec(headerBlock)
  const value = match?.[1]?.trim()
  return {
    ok: true,
    contentType: value !== undefined && value.length > 0 ? value.toLowerCase() : null,
  }
}
