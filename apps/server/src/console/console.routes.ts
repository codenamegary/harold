import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { ConsoleAsset } from "./console.assets"
import { resolveConsoleContentType } from "./console.content.type"

const apiPrefix = "/v1"
const indexAssetPath = "index.html"

export type RegisterConsoleRoutesOptions = {
  assets: ReadonlyArray<ConsoleAsset>
}

type ConsoleLookup = {
  byPath: Map<string, ConsoleAsset>
  index: ConsoleAsset
}

const buildLookup = (assets: ReadonlyArray<ConsoleAsset>): ConsoleLookup | null => {
  if (assets.length === 0) {
    return null
  }
  const byPath = new Map(assets.map((asset) => [asset.path, asset]))
  const index = byPath.get(indexAssetPath)
  if (index === undefined) {
    throw new Error(`console assets are missing ${indexAssetPath}`)
  }
  return { byPath, index }
}

const stripQuery = (url: string): string => url.split("?")[0] ?? url

const decodeAssetPath = (url: string): string | null => {
  try {
    return decodeURIComponent(stripQuery(url))
  } catch {
    return null
  }
}

const hasFileExtension = (assetPath: string): boolean => {
  const lastSegment = assetPath.split("/").pop() ?? ""
  return lastSegment.includes(".")
}

const isApiPath = (assetPath: string): boolean =>
  assetPath === apiPrefix || assetPath.startsWith(`${apiPrefix}/`)

const sendAsset = (reply: FastifyReply, asset: ConsoleAsset): FastifyReply =>
  reply
    .header("content-type", resolveConsoleContentType(asset.path))
    .header("cache-control", "no-cache")
    .send(Buffer.from(asset.body))

export const registerConsoleRoutes = (
  app: FastifyInstance,
  options: RegisterConsoleRoutesOptions,
) => {
  const lookup = buildLookup(options.assets)
  if (lookup === null) {
    return
  }

  const serveIndex = (reply: FastifyReply) => sendAsset(reply, lookup.index)

  app.get("/*", async (request: FastifyRequest, reply: FastifyReply) => {
    const assetPath = decodeAssetPath(request.url)
    if (assetPath === null || isApiPath(assetPath)) {
      return reply.callNotFound()
    }

    const key = assetPath.replace(/^\/+/, "")
    const asset = lookup.byPath.get(key)
    if (asset !== undefined) {
      return sendAsset(reply, asset)
    }
    if (hasFileExtension(key)) {
      return reply.callNotFound()
    }
    return serveIndex(reply)
  })
}
