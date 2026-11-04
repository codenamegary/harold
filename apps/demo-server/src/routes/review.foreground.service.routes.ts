import { join } from "node:path"
import { notFound } from "./http"

const videoPath = join(
  import.meta.dir,
  "../../../../docs/store-android/foreground-service-demo.mp4",
)

/**
 * Serves the same foreground-service demo video that ships with the Play
 * review assets. The demo server runs from the repository checkout, so the
 * public URL cannot drift from the file used in the Play Console declaration.
 */
export const reviewForegroundServiceVideoResponse = async (): Promise<Response> => {
  const file = Bun.file(videoPath)
  if (!(await file.exists())) {
    return notFound("Foreground service demo video not found")
  }

  return new Response(file, {
    headers: {
      "content-type": "video/mp4",
      "cache-control": "public, max-age=300",
    },
  })
}
