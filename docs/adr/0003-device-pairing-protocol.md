# Device pairing: operator-issued binding codes

Status: Accepted  
Milestone: [MS2 Trusted Devices](../../spec/ms2-trusted-devices.md)  
Related: [ADR-0001 Authentication](0001-device-authentication.md), [ADR-0002 Authorization](0002-device-authorization.md)

Pairing uses a short-lived, one-time operator-issued code claimed by the new
client. The claim response returns the durable device credential from
[ADR-0001](0001-device-authentication.md). This follows NIST authenticator-binding
shape, not the OAuth 2.0 Device Authorization Grant. QR codes are a local
transfer convenience, not a separate protocol.

## Decision

1. The host operator creates a pairing code through an authenticated host path.
2. The new client claims the code once through `POST /v1/pairing-codes/:code/claim`
   (or equivalent contract) and receives the opaque device credential.
3. Codes are one-time, short-lived (**≤ 10 minutes**), and generated with a CSPRNG
   ([NIST SP 800-63B-4 binding][nist-events]).
4. Keep the human-enterable `XXX-XXX` presentation from the prototype. Treat it
   as low-entropy. Compensate with a short TTL and single use
   ([RFC 8628 §5.1][rfc8628], [NIST OOB / look-up secret guidance][nist-authn],
   [OWASP API2:2023][owasp-api2]).
5. Prefer an unambiguous alphabet (avoid confusable `0`/`O`, `1`/`I`/`l`) and
   case-normalize on compare ([RFC 8628 §6.1][rfc8628]).
6. Hash pairing codes at rest with a password KDF (Argon2id preferred) or an
   equivalent slow hash, because code entropy is far below 112 bits
   ([NIST SP 800-63B-4][nist-authn], [OWASP Password Storage][owasp-password]).
7. QR encodes the versioned custom URI
   `agent-server://pair?v=1&endpoint=<encoded absolute URL>&code=<XXX-XXX>` for
   optical transfer. Scanning must not invent a second trust model
   ([NIST binding local OOB][nist-events]).
8. Do not implement RFC 8628 Device Authorization Grant as the Milestone 2
   protocol.

## Why not OAuth Device Authorization Grant

[RFC 8628][rfc8628] solves a different problem: an input-constrained device
starts OAuth, the user approves on another device at an authorization server,
and the constrained device polls for user tokens.

| Aspect | RFC 8628 | Agent Server pairing |
|--------|----------|----------------------|
| Who starts | Constrained device | Host operator (already trusted) |
| Who approves | Resource owner at AS | Host, by creating the code |
| What issues | OAuth access / refresh tokens | Opaque device credential |
| Account model | User account at AS | Single local operator server |
| Polling | Required (`device_code`) | Not required. Client claims once. |

Borrow RFC 8628 hygiene for human codes. Do not take on an authorization server,
token endpoint, or refresh-token lifecycle in Milestone 2. Day-to-day API auth
stays standard Bearer usage ([ADR-0001](0001-device-authentication.md)). Only
credential issuance is a small binding protocol.

NIST post-enrollment binding is the closer primary analogue: an authenticated
endpoint requests a binding code, the new endpoint submits it, transfer may be
manual or local QR, code is one-time and max 10 minutes
([NIST SP 800-63B-4 §4.1.2.2][nist-events]).

If a later milestone needs a full OAuth AS (for example remote multi-client
Device Grant), record that as a new ADR. Do not silently reshape
`/v1/pairing-codes` into a partial OAuth surface.

## Considered options

| Option | Verdict | Why |
|--------|---------|-----|
| Operator-issued binding code + claim API | **Selected** | Matches product trust direction. Host grants membership. Client receives durable credential. |
| OAuth 2.0 Device Authorization Grant ([RFC 8628][rfc8628]) | Rejected for MS2 | Wrong initiator and account model. Full AS stack for no MS2 gain. |
| Pre-shared long API key pasted by hand | Rejected | No short TTL. Easy to copy forever. Weak operator UX for revoke-and-repair. |
| Public-key device attestation / mTLS enroll | Deferred | Stronger bind. Needs PKI and remote threat model. |
| QR-only pairing with no typed code | Rejected as sole path | QR is optional convenience. Typed code remains the protocol. |
| Email / SMS delivery of codes | Rejected | NIST forbids insecure channels for binding codes ([nist-events]). Local transfer only. |

## Entropy and compensating controls

NIST binding codes want ≥ 40 bits when paired with an already-entered identifier,
else ≥ 112 bits ([nist-events]). A six-character human code is typically well
under 64 bits.

Milestone 2 keeps the short code for UX on loopback and compensates:

- One-time use
- TTL ≤ 10 minutes
- Invalidate on claim, expiry, or explicit revoke
- Slow hash at rest

Raise code entropy or add a second factor on claim before the claim endpoint is
reachable off-machine (Milestone 3).

## Consequences

- Pairing create stays a host-operator action. Unauthenticated clients cannot mint
  codes.
- Claim endpoint is the brute-force surface. Agent Server does not add claim
  rate limits for this product. Do not introduce per-code, per-source, or global
  claim throttling without a new ADR.
- Connect wizard QR encodes the versioned custom URI
  `agent-server://pair?v=1&endpoint=<encoded absolute URL>&code=<XXX-XXX>`.
  Shared format and parse helpers live in `packages/contracts`. Claim still
  posts the code string to Agent Server.
- A future move to RFC 8628 would be a new decision, not a silent reshape of
  `/v1/pairing-codes`.

## Sources

- [NIST SP 800-63B-4 — Authenticator events (binding)][nist-events]
- [NIST SP 800-63B-4 — Authenticators][nist-authn]
- [RFC 8628 — OAuth 2.0 Device Authorization Grant][rfc8628]
- [OWASP API Security Top 10 2023 — API2 Broken Authentication][owasp-api2]
- [OWASP Password Storage Cheat Sheet][owasp-password]
- [MS2 Trusted Devices](../../spec/ms2-trusted-devices.md)

[nist-events]: https://pages.nist.gov/800-63-4/sp800-63b/events/
[nist-authn]: https://pages.nist.gov/800-63-4/sp800-63b/authenticators/
[rfc8628]: https://www.rfc-editor.org/rfc/rfc8628
[owasp-api2]: https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/
[owasp-password]: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
