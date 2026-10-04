import { describe, expect, test } from "bun:test"
import {
  connectRecipes,
  findConnectRecipe,
  recipeIds,
  RecipeDetection,
  WhichLookup,
  WriteLine,
} from "./connect.recipes"

const collectLines = (): { lines: string[]; writeLine: WriteLine } => {
  const lines: string[] = []
  return { lines, writeLine: (line) => lines.push(line) }
}

const makeWhich =
  (binaries: readonly string[]): WhichLookup =>
  (binary) =>
    binaries.includes(binary)

const output = (lines: readonly string[]): string => lines.join("\n")

describe("connectRecipes", () => {
  test("registers recipes in the guided order", () => {
    expect(recipeIds).toEqual([
      "reverse-proxy",
      "tailscale",
      "ssh-reverse",
      "cloudflared",
      "ngrok",
      "custom",
    ])
    expect(connectRecipes.map((recipe) => recipe.id)).toEqual([...recipeIds])
  })

  test("finds a recipe by id and rejects unknown ids", () => {
    expect(findConnectRecipe("tailscale")?.id).toBe("tailscale")
    expect(findConnectRecipe("nope")).toBeUndefined()
  })
})

describe("reverse-proxy recipe", () => {
  const recipe = findConnectRecipe("reverse-proxy")

  test("detects locally installed proxy binaries", () => {
    if (recipe === undefined) throw new Error("reverse-proxy recipe missing")

    const caddy: RecipeDetection = recipe.detect({ which: makeWhich(["caddy"]) })
    expect(caddy.available).toBe(true)

    const none: RecipeDetection = recipe.detect({ which: makeWhich([]) })
    expect(none.available).toBe(false)
  })

  test("guides Caddy, Traefik, and nginx TLS proxies to the local Harold port", () => {
    if (recipe === undefined) throw new Error("reverse-proxy recipe missing")
    const { lines, writeLine } = collectLines()

    recipe.guide({ which: makeWhich([]), writeLine })

    const text = output(lines)
    expect(text).toContain("Caddy")
    expect(text).toContain("Traefik")
    expect(text).toContain("nginx")
    expect(text).toContain("127.0.0.1:3847")
    expect(text).toContain("harold connect --advertised-url https://")
  })

  test("mentions the WebSocket upgrade the session stream needs", () => {
    if (recipe === undefined) throw new Error("reverse-proxy recipe missing")
    const { lines, writeLine } = collectLines()

    recipe.guide({ which: makeWhich([]), writeLine })

    expect(output(lines)).toContain("Upgrade")
  })
})

describe("tailscale recipe", () => {
  const recipe = findConnectRecipe("tailscale")

  test("detects the tailscale CLI through the injected which", () => {
    if (recipe === undefined) throw new Error("tailscale recipe missing")

    expect(recipe.detect({ which: makeWhich(["tailscale"]) })).toEqual({
      available: true,
      detail: "tailscale CLI found",
    })

    expect(recipe.detect({ which: makeWhich([]) })).toEqual({
      available: false,
      detail: "tailscale CLI not found; install it from https://tailscale.com/download",
    })
  })

  test("guides tailscale serve for the tailnet and funnel for public access", () => {
    if (recipe === undefined) throw new Error("tailscale recipe missing")
    const { lines, writeLine } = collectLines()

    recipe.guide({ which: makeWhich(["tailscale"]), writeLine })

    const text = output(lines)
    expect(text).toContain("tailscale CLI found")
    expect(text).toContain("tailscale serve")
    expect(text).toContain("tailscale funnel")
    expect(text).toContain("3847")
    expect(text).toContain("ts.net")
    expect(text).toContain("harold connect --advertised-url")
  })

  test("prints install guidance when the CLI is missing", () => {
    if (recipe === undefined) throw new Error("tailscale recipe missing")
    const { lines, writeLine } = collectLines()

    recipe.guide({ which: makeWhich([]), writeLine })

    expect(output(lines)).toContain("not found")
  })
})

describe("ssh-reverse recipe", () => {
  const recipe = findConnectRecipe("ssh-reverse")

  test("detects ssh through the injected which", () => {
    if (recipe === undefined) throw new Error("ssh-reverse recipe missing")

    expect(recipe.detect({ which: makeWhich(["ssh"]) }).available).toBe(true)
    expect(recipe.detect({ which: makeWhich([]) }).available).toBe(false)
  })

  test("guides an ssh reverse tunnel with TLS termination at the remote host", () => {
    if (recipe === undefined) throw new Error("ssh-reverse recipe missing")
    const { lines, writeLine } = collectLines()

    recipe.guide({ which: makeWhich(["ssh"]), writeLine })

    const text = output(lines)
    expect(text).toContain("ssh -N")
    expect(text).toContain("-R 0.0.0.0:3847:127.0.0.1:3847")
    expect(text).toContain("ExitOnForwardFailure")
    expect(text).toContain("/v1/status")
    expect(text).toContain("harold connect --advertised-url https://")
  })
})

describe("cloudflared recipe", () => {
  const recipe = findConnectRecipe("cloudflared")

  test("detects cloudflared through the injected which", () => {
    if (recipe === undefined) throw new Error("cloudflared recipe missing")

    expect(recipe.detect({ which: makeWhich(["cloudflared"]) }).available).toBe(true)
    expect(recipe.detect({ which: makeWhich([]) }).available).toBe(false)
  })

  test("guides a quick tunnel and a named tunnel", () => {
    if (recipe === undefined) throw new Error("cloudflared recipe missing")
    const { lines, writeLine } = collectLines()

    recipe.guide({ which: makeWhich([]), writeLine })

    const text = output(lines)
    expect(text).toContain("cloudflared tunnel --url http://127.0.0.1:3847")
    expect(text).toContain("trycloudflare.com")
    expect(text).toContain("cloudflared tunnel create")
  })
})

describe("ngrok recipe", () => {
  const recipe = findConnectRecipe("ngrok")

  test("detects ngrok through the injected which", () => {
    if (recipe === undefined) throw new Error("ngrok recipe missing")

    expect(recipe.detect({ which: makeWhich(["ngrok"]) }).available).toBe(true)
    expect(recipe.detect({ which: makeWhich([]) }).available).toBe(false)
  })

  test("guides an ngrok http tunnel", () => {
    if (recipe === undefined) throw new Error("ngrok recipe missing")
    const { lines, writeLine } = collectLines()

    recipe.guide({ which: makeWhich([]), writeLine })

    expect(output(lines)).toContain("ngrok http 3847")
  })
})

describe("custom recipe", () => {
  const recipe = findConnectRecipe("custom")

  test("needs no local detection", () => {
    if (recipe === undefined) throw new Error("custom recipe missing")

    expect(recipe.detect({ which: makeWhich([]) })).toEqual({
      available: true,
      detail: "operator-supplied endpoint",
    })
  })

  test("guides plain connect behavior", () => {
    if (recipe === undefined) throw new Error("custom recipe missing")
    const { lines, writeLine } = collectLines()

    recipe.guide({ which: makeWhich([]), writeLine })

    const text = output(lines)
    expect(text).toContain("https")
    expect(text).toContain("loopback")
    expect(text).toContain("harold connect --advertised-url")
  })
})
