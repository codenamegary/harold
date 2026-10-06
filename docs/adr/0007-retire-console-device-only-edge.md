# Retire the console; HTTP becomes the device-only edge

Status: Accepted  
Related: [ADR-0000 Terms and topology](0000-harold.md),
[ADR-0001 Device authentication](0001-device-authentication.md),
[ADR-0002 Device authorization](0002-device-authorization.md)

Harold shipped with a web operator console served from the daemon
(`apps/web`, bundled into the binary). The console authenticated by origin:
a loopback request with no credential became a **host principal** with full
operator power, with a `trustedProxies` setting to classify peers behind a
reverse proxy. This ADR retires that model.

## Decision

1. **Delete the console.** `apps/web` and the server-side console asset
   pipeline (`console.assets.ts`, `console.routes.ts`,
   `console.content.type.ts`, `console.assets.codegen.cli.ts`) are removed.
   The daemon serves no HTML.
2. **Delete the console-only HTTP surfaces.** The logs and connection-test
   routes existed for the browser; Android never called them. The daemon log
   stays a file that `harold logs` tails; reachability recipes live in the
   CLI (`harold connect`).
3. **Delete host classification.** `loopback.ts`, `ip.match.ts`,
   `request.origin.ts`, the middleware branches that consulted them, and the
   `trustedProxies` runtime setting are removed. No request authenticates by
   origin, forwarded header, or peer address.
4. **Route policy is structural.** Open routes are exactly `GET /v1/status`
   and the pairing claim, plus the `_test` routes in test builds. Every other
   route and the session stream require a device credential. The host
   principal type no longer exists in the codebase, so the HTTP surface
   cannot do host things by construction.
5. **The CLI is the local operator tooling.** It already read host state
   directly (database, settings file, daemon log) rather than over HTTP, so
   local operators lose nothing. Where the CLI speaks HTTP it presents a
   device credential like any client.
6. **Contracts shrink to what remains.** `packages/contracts` drops the logs
   and connection-test contracts and the `trustedProxies` field; legacy
   `settings.yml` files that still carry the key keep loading.

## Consequences

- A browser pointed at the daemon gets `401` on everything except
  `/v1/status` and an unclaimable pairing path. There is no privileged
  localhost access to impersonate, and no proxy classification to spoof.
- The Android app loses nothing: it authenticated with a device credential
  before and authenticates the same way now. Its runtime-settings contract
  loses the `trustedProxies` field.
- Reverse-proxy deployments (Milestone 3 HTTPS) must terminate TLS in front
  of a device-credential API, not use the proxy to grant identity. Any
  future need for origin-based trust gets designed fresh, with its own ADR.
- CI drops the web workflow; coverage is server and CLI only.

## Amendment of earlier ADRs

- ADR-0000 topology: the console band and host principal are gone; the CLI is
  the local operator path.
- ADR-0001: the "separate loopback operator path" sentence no longer holds.
- ADR-0002: the flat model keeps only one principal kind, the paired device.
