export type RecipeId =
  | "reverse-proxy"
  | "tailscale"
  | "ssh-reverse"
  | "cloudflared"
  | "ngrok"
  | "custom"

export const recipeIds: readonly RecipeId[] = [
  "reverse-proxy",
  "tailscale",
  "ssh-reverse",
  "cloudflared",
  "ngrok",
  "custom",
]

export type WhichLookup = (binary: string) => boolean

export type WriteLine = (line: string) => void

export type RecipeDetection = Readonly<{
  available: boolean
  detail: string
}>

export type ConnectRecipe = Readonly<{
  readonly id: RecipeId
  readonly detect: (deps: Readonly<{ which: WhichLookup }>) => RecipeDetection
  readonly guide: (deps: Readonly<{ detection: RecipeDetection; writeLine: WriteLine }>) => void
}>

const localHaroldAddress = "127.0.0.1:3847"

const connectHint = (writeLine: WriteLine, advertisedUrl: string): void => {
  writeLine("")
  writeLine("Verify and persist it:")
  writeLine(`  harold connect --advertised-url ${advertisedUrl}`)
}

const detectBinaries = (which: WhichLookup, binaries: readonly string[]): RecipeDetection => {
  const found = binaries.filter((binary) => which(binary))
  return found.length > 0
    ? { available: true, detail: `found: ${found.join(", ")}` }
    : { available: false, detail: `none of ${binaries.join(", ")} found on PATH` }
}

const guideReverseProxy = (deps: { detection: RecipeDetection; writeLine: WriteLine }): void => {
  const { detection, writeLine } = deps

  writeLine("Reverse proxy: terminate TLS in front of Harold.")
  writeLine(`  Detection: ${detection.detail}.`)
  writeLine("")
  writeLine("Caddy (automatic TLS):")
  writeLine("  caddy reverse-proxy --from harold.example.com --to " + localHaroldAddress)
  writeLine("  # or in a Caddyfile:")
  writeLine("  #   harold.example.com {")
  writeLine(`  #     reverse_proxy ${localHaroldAddress}`)
  writeLine("  #   }")
  writeLine("")
  writeLine("Traefik (file provider, dynamic config):")
  writeLine("  http:")
  writeLine("    routers:")
  writeLine("      harold:")
  writeLine('        rule: "Host(`harold.example.com`)"')
  writeLine("        entryPoints: [websecure]")
  writeLine("        service: harold")
  writeLine("        tls:")
  writeLine("          certResolver: le")
  writeLine("    services:")
  writeLine("      harold:")
  writeLine("        loadBalancer:")
  writeLine("          servers:")
  writeLine(`            - url: "http://${localHaroldAddress}"`)
  writeLine("")
  writeLine("nginx (certificate from your CA, for example Let's Encrypt):")
  writeLine("  server {")
  writeLine("    listen 443 ssl;")
  writeLine("    server_name harold.example.com;")
  writeLine("    ssl_certificate     /etc/letsencrypt/live/harold.example.com/fullchain.pem;")
  writeLine("    ssl_certificate_key /etc/letsencrypt/live/harold.example.com/privkey.pem;")
  writeLine("    location / {")
  writeLine(`      proxy_pass http://${localHaroldAddress};`)
  writeLine("      proxy_http_version 1.1;")
  writeLine("      proxy_set_header Upgrade $http_upgrade;")
  writeLine('      proxy_set_header Connection "upgrade";')
  writeLine("      proxy_set_header Host $host;")
  writeLine("    }")
  writeLine("  }")
  writeLine("")
  writeLine("The Upgrade headers keep the WebSocket session stream working.")

  connectHint(writeLine, "https://harold.example.com")
}

const guideTailscale = (deps: { detection: RecipeDetection; writeLine: WriteLine }): void => {
  const { detection, writeLine } = deps

  writeLine("Tailscale: serve Harold over HTTPS on your tailnet, or publicly with Funnel.")
  writeLine(`  Detection: ${detection.detail}.`)
  writeLine("")
  writeLine("Serve to your tailnet only:")
  writeLine("  tailscale serve --bg 3847")
  writeLine("  # endpoint becomes https://<machine>.<tailnet>.ts.net")
  writeLine("")
  writeLine("Or expose it publicly with Funnel:")
  writeLine("  tailscale funnel --bg 3847")

  connectHint(writeLine, "https://<machine>.<tailnet>.ts.net")
}

const guideSshReverse = (deps: { detection: RecipeDetection; writeLine: WriteLine }): void => {
  const { detection, writeLine } = deps

  writeLine("SSH reverse tunnel: forward a public host's port back to local Harold.")
  writeLine(`  Detection: ${detection.detail}.`)
  writeLine("")
  writeLine("1. Confirm Harold is running locally:")
  writeLine("   curl -fsS http://127.0.0.1:3847/v1/status")
  writeLine("")
  writeLine("2. Open the reverse tunnel from this machine (keep it running):")
  writeLine("   ssh -N \\")
  writeLine("     -o ExitOnForwardFailure=yes \\")
  writeLine("     -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \\")
  writeLine("     -R 0.0.0.0:3847:127.0.0.1:3847 \\")
  writeLine("     <user>@<your-public-host>")
  writeLine("")
  writeLine("3. Terminate TLS on the public host (reverse-proxy recipe to 127.0.0.1:3847")
  writeLine("   there) and keep the firewall closed to :3847 except for that proxy.")
  writeLine("")
  writeLine("4. Check it from anywhere:")
  writeLine("   curl -fsS https://harold.example.com/v1/status")

  connectHint(writeLine, "https://harold.example.com")
}

const guideCloudflared = (deps: { detection: RecipeDetection; writeLine: WriteLine }): void => {
  const { detection, writeLine } = deps

  writeLine("Cloudflare Tunnel (cloudflared).")
  writeLine(`  Detection: ${detection.detail}.`)
  writeLine("")
  writeLine("Quick tunnel, no account needed (URL changes each run):")
  writeLine(`  cloudflared tunnel --url http://${localHaroldAddress}`)
  writeLine("  # prints https://<random>.trycloudflare.com")
  writeLine("")
  writeLine("Named tunnel with a stable hostname (needs a Cloudflare account):")
  writeLine("  cloudflared tunnel login")
  writeLine("  cloudflared tunnel create harold")
  writeLine("  cloudflared tunnel route dns harold harold.example.com")
  writeLine(`  cloudflared tunnel run --url http://${localHaroldAddress} harold`)

  connectHint(writeLine, "https://harold.example.com")
}

const guideNgrok = (deps: { detection: RecipeDetection; writeLine: WriteLine }): void => {
  const { detection, writeLine } = deps

  writeLine("ngrok.")
  writeLine(`  Detection: ${detection.detail}.`)
  writeLine("")
  writeLine("  ngrok http 3847")
  writeLine("  # prints https://<random>.ngrok-free.app (changes each run on the free plan)")

  connectHint(writeLine, "https://<random>.ngrok-free.app")
}

const guideCustom = (deps: { detection: RecipeDetection; writeLine: WriteLine }): void => {
  const { detection, writeLine } = deps

  writeLine("Custom: bring any endpoint that proxies to Harold.")
  writeLine(`  Detection: ${detection.detail}.`)
  writeLine("  Non-loopback endpoints must be https; http is allowed on loopback hosts only.")
  writeLine("  Use --check to verify without persisting, then persist:")
  writeLine("  harold connect --advertised-url https://harold.example.com")
}

export const connectRecipes: readonly ConnectRecipe[] = [
  {
    id: "reverse-proxy",
    detect: (deps) => detectBinaries(deps.which, ["caddy", "traefik", "nginx"]),
    guide: guideReverseProxy,
  },
  {
    id: "tailscale",
    detect: (deps) =>
      deps.which("tailscale")
        ? { available: true, detail: "tailscale CLI found" }
        : {
            available: false,
            detail: "tailscale CLI not found; install it from https://tailscale.com/download",
          },
    guide: guideTailscale,
  },
  {
    id: "ssh-reverse",
    detect: (deps) =>
      deps.which("ssh")
        ? { available: true, detail: "ssh found" }
        : { available: false, detail: "ssh not found; install an OpenSSH client first" },
    guide: guideSshReverse,
  },
  {
    id: "cloudflared",
    detect: (deps) =>
      deps.which("cloudflared")
        ? { available: true, detail: "cloudflared found" }
        : {
            available: false,
            detail:
              "cloudflared not found; install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
          },
    guide: guideCloudflared,
  },
  {
    id: "ngrok",
    detect: (deps) =>
      deps.which("ngrok")
        ? { available: true, detail: "ngrok found" }
        : {
            available: false,
            detail: "ngrok not found; install it from https://ngrok.com/download",
          },
    guide: guideNgrok,
  },
  {
    id: "custom",
    detect: () => ({ available: true, detail: "operator-supplied endpoint" }),
    guide: guideCustom,
  },
]

export const findConnectRecipe = (id: string): ConnectRecipe | undefined =>
  connectRecipes.find((recipe) => recipe.id === id)
