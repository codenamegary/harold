import { join } from "node:path"
import { notFound } from "./http"

const qrPath = join(import.meta.dir, "../../../../docs/store-android/review-pairing-qr.png")

/**
 * Serves the same QR that ships with the Play review assets. The demo server
 * runs from the repository checkout, so the public URL cannot drift from the
 * file uploaded to Play Console.
 */
export const reviewPairingQrResponse = async (): Promise<Response> => {
  const file = Bun.file(qrPath)
  if (!(await file.exists())) {
    return notFound("Review pairing QR not found")
  }

  return new Response(file, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=300",
    },
  })
}
