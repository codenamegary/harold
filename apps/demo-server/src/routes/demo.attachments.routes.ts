import { HAROLD_LOGO_PNG_BASE64, ITS_NOT_DNS_CONTENT } from "../fixtures/attachments"

type DemoAttachmentAsset = {
  body: string | Uint8Array
  contentType: string
}

const pngBytes = (): Uint8Array => {
  const binary = atob(HAROLD_LOGO_PNG_BASE64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const attachments = new Map<string, DemoAttachmentAsset>([
  ["/demo/attachments/harold-logo.png", { body: pngBytes(), contentType: "image/png" }],
  [
    "/demo/attachments/its-not-dns.txt",
    { body: ITS_NOT_DNS_CONTENT, contentType: "text/plain; charset=utf-8" },
  ],
])

export const demoAttachmentResponse = (pathname: string): Response | null => {
  const asset = attachments.get(pathname)
  if (asset === undefined) {
    return null
  }
  return new Response(asset.body, {
    status: 200,
    headers: {
      "content-type": asset.contentType,
      "cache-control": "public, max-age=3600",
    },
  })
}
