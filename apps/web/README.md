# web

Operator console for Harold. Bun is the only dev entry: `bun run dev`
from the repo root starts the API (`apps/server`) and this app together.

## Scripts

- `bun run dev` — Bun full-stack dev server with HMR on
  `http://127.0.0.1:5173`. Proxies `/v1` (HTTP and WebSocket) to the API on
  `127.0.0.1:3847`.
- `bun run build` — typecheck, then bundle to `dist/` as plain static files.
- `bun run typecheck` — `tsc -b` over the app, node, and test projects.
- `bun run test` — `bun test` with happy-dom.
- `bun run check` — lint, typecheck, and test.

## Tooling

- Tailwind v4 compiles through `bun-plugin-tailwind`, wired in `bunfig.toml`
  under `[serve.static]`. The CSS-first `@import "tailwindcss"` entry is
  `src/index.css`.
- `dev.ts` is the dev server: HTML routes, the `/v1` proxy, and the
  wait-for-API warning.
- `build.ts` is the production bundler: `Bun.build` with the Tailwind plugin,
  minified, output to `dist/`.
