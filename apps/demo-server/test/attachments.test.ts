import { describe, expect, test } from "bun:test"
import { readMultipartFileContentType } from "../src/routes/http"

const multipartHeaders = (contentType: string, boundary = "demo-boundary"): string =>
  [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="local-name.png"',
    `Content-Type: ${contentType}`,
    "",
    "",
  ].join("\r\n")

const requestWithStream = (stream: ReadableStream<Uint8Array>): Request =>
  new Request("http://127.0.0.1/upload", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=demo-boundary" },
    body: stream,
    // Bun accepts half-duplex streaming request bodies.
    duplex: "half",
  })

describe("multipart header reader", () => {
  test("reads the file part Content-Type and cancels before file bytes", async () => {
    const encoder = new TextEncoder()
    let pulls = 0
    let tailRead = false

    const stream = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        pulls += 1
        if (pulls === 1) {
          controller.enqueue(encoder.encode(multipartHeaders("image/png")))
          return
        }
        tailRead = true
        controller.error(new Error("file bytes must not be read"))
      },
    })

    const result = await readMultipartFileContentType(requestWithStream(stream))
    expect(result).toEqual({ ok: true, contentType: "image/png" })
    expect(pulls).toBe(1)
    expect(tailRead).toBe(false)
  })

  test("returns null when the part has no Content-Type", async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(
          encoder.encode(
            ["--demo-boundary", 'Content-Disposition: form-data; name="file"', "", ""].join("\r\n"),
          ),
        )
      },
    })

    const result = await readMultipartFileContentType(requestWithStream(stream))
    expect(result).toEqual({ ok: true, contentType: null })
  })

  test("rejects a non-multipart body without a body read", async () => {
    const request = new Request("http://127.0.0.1/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })

    const result = await readMultipartFileContentType(request)
    expect(result).toEqual({ ok: false, reason: "not_multipart" })
  })

  test("the source has no file writes, formData, arrayBuffer, File, or Blob", async () => {
    const glob = new Bun.Glob("src/**/*.ts")
    const forbidden = [
      "request.formData",
      "request.arrayBuffer",
      "new File(",
      "new Blob(",
      "Bun.write",
      "node:fs",
      "fs/promises",
    ]
    for await (const path of glob.scan({ cwd: import.meta.dir + "/.." })) {
      const source = await Bun.file(`${import.meta.dir}/../${path}`).text()
      for (const token of forbidden) {
        expect({ path, token, found: source.includes(token) }).toEqual({
          path,
          token,
          found: false,
        })
      }
    }
  })
})
