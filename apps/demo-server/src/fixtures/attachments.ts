export type DemoAttachmentDescriptor = {
  id: string
  name: string
  mimeType: string
  kind: "image" | "file"
  size: number
  path: string
}

export const HAROLD_LOGO_ATTACHMENT = {
  name: "harold-logo.png",
  mimeType: "image/png",
  kind: "image" as const,
  size: 24_576,
  path: "/demo/attachments/harold-logo.png",
}

export const ITS_NOT_DNS_ATTACHMENT = {
  name: "its-not-dns.txt",
  mimeType: "text/plain",
  kind: "file" as const,
  size: 52,
  path: "/demo/attachments/its-not-dns.txt",
}

export const ITS_NOT_DNS_CONTENT = `It's not DNS.
There's no way it's DNS.
It was DNS.
`

/**
 * A tiny valid PNG so `/demo/attachments/harold-logo.png` serves a real image.
 * The review app never fetches it; this is for humans opening the URL.
 */
export const HAROLD_LOGO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABPSURBVHhe7dExAQAADMOg+TfdmbgX\n" +
  "CGj3lgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHWgAA\n" +
  "AABJRU5ErkJggg=="
