export type ProxyProvider = "caddy" | "tailscale" | "cloudflare"

export type ProxyTemplate = {
  tabLabel: string
  label: string
  code: (url: string) => string
  note: string
}

export const proxyProviders: readonly ProxyProvider[] = [
  "caddy",
  "tailscale",
  "cloudflare",
]

const stripProtocol = (url: string) => url.replace(/^https?:\/\//, "")

export const proxyTemplates: Record<ProxyProvider, ProxyTemplate> = {
  caddy: {
    tabLabel: "Caddy",
    label: "Caddyfile",
    code: (url) =>
      `${stripProtocol(url)} {\n  # Private address of your home PC over WireGuard\n  reverse_proxy http://10.8.0.2:3847\n  encode zstd gzip\n}`,
    note: "Run Caddy on the VPS and connect it to this machine with WireGuard. Replace 10.8.0.2 with the machine's private tunnel address.",
  },
  tailscale: {
    tabLabel: "Tailscale",
    label: "Terminal",
    code: () =>
      `tailscale serve --bg https / http://127.0.0.1:3847\n\n# Check your assigned URL\ntailscale serve status`,
    note: "Tailscale Serve keeps the endpoint private to devices on your tailnet. Use Funnel if you need public access.",
  },
  cloudflare: {
    tabLabel: "Cloudflare Tunnel",
    label: "config.yml",
    code: (url) =>
      `tunnel: cursor-acp\ncredentials-file: ~/.cloudflared/cursor-acp.json\n\ningress:\n  - hostname: ${stripProtocol(url)}\n    service: http://127.0.0.1:3847\n  - service: http_status:404`,
    note: "Create a named tunnel first, then point the selected hostname to it in Cloudflare DNS.",
  },
}

export const defaultExternalHost = "acp.gary.dev"

export const localAgentPort = 3847
