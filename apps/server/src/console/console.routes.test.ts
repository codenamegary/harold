import { describe, expect, test } from "bun:test"
import Fastify from "fastify"
import { ConsoleAsset } from "./console.assets"
import { registerConsoleRoutes } from "./console.routes"

const htmlBody = "<!doctype html><html><body>console</body></html>"
const indexAsset: ConsoleAsset = {
  path: "index.html",
  body: Buffer.from(htmlBody),
}

const makeAssets = (): Array<ConsoleAsset> => [
  indexAsset,
  {
    path: "assets/main-abc123.js",
    body: Buffer.from("console.log('main')"),
  },
  {
    path: "assets/main-abc123.css",
    body: Buffer.from("body{}"),
  },
]

const bootConsoleApp = (assets: Array<ConsoleAsset>) => {
  const app = Fastify({ logger: false })
  registerConsoleRoutes(app, { assets })
  return app
}

describe("console routes", () => {
  test("registers no routes when assets are empty", async () => {
    const app = bootConsoleApp([])

    const response = await app.inject({ method: "GET", url: "/" })

    expect(response.statusCode).toBe(404)
  })

  test("serves index.html at the root", async () => {
    const app = bootConsoleApp(makeAssets())

    const response = await app.inject({ method: "GET", url: "/" })

    expect(response.statusCode).toBe(200)
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8")
    expect(response.body).toBe(htmlBody)
  })

  test("serves an asset by exact path with its content type", async () => {
    const app = bootConsoleApp(makeAssets())

    const response = await app.inject({ method: "GET", url: "/assets/main-abc123.js" })

    expect(response.statusCode).toBe(200)
    expect(response.headers["content-type"]).toBe("text/javascript; charset=utf-8")
    expect(response.body).toBe("console.log('main')")
  })

  test("falls back to index.html for client-side routes", async () => {
    const app = bootConsoleApp(makeAssets())

    const response = await app.inject({ method: "GET", url: "/workspaces/abc/sessions" })

    expect(response.statusCode).toBe(200)
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8")
    expect(response.body).toBe(htmlBody)
  })

  test("ignores query strings when resolving assets", async () => {
    const app = bootConsoleApp(makeAssets())

    const root = await app.inject({ method: "GET", url: "/?utm_source=test" })
    const asset = await app.inject({
      method: "GET",
      url: "/assets/main-abc123.css?v=2",
    })

    expect(root.statusCode).toBe(200)
    expect(root.body).toBe(htmlBody)
    expect(asset.statusCode).toBe(200)
    expect(asset.body).toBe("body{}")
  })

  test("returns 404 for unknown assets with a file extension", async () => {
    const app = bootConsoleApp(makeAssets())

    const response = await app.inject({ method: "GET", url: "/assets/missing-abc.js" })

    expect(response.statusCode).toBe(404)
  })

  test("never serves the console for /v1 paths", async () => {
    const app = bootConsoleApp(makeAssets())

    const root = await app.inject({ method: "GET", url: "/v1" })
    const nested = await app.inject({ method: "GET", url: "/v1/status" })
    const deep = await app.inject({ method: "GET", url: "/v1/deep/route.js" })

    expect(root.statusCode).toBe(404)
    expect(nested.statusCode).toBe(404)
    expect(deep.statusCode).toBe(404)
  })

  test("rejects malformed percent encoding without serving the console", async () => {
    const app = bootConsoleApp(makeAssets())

    const response = await app.inject({ method: "GET", url: "/%e0%a4%" })

    expect(response.statusCode).toBe(400)
    expect(response.body).not.toContain(htmlBody)
  })
})
