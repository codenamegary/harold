# Device authentication: opaque Bearer credentials

Status: Accepted  
Milestone: [MS2 Trusted Devices](../../spec/ms2-trusted-devices.md)  
Related: [ADR-0002 Authorization](0002-device-authorization.md), [ADR-0003 Pairing](0003-device-pairing-protocol.md)

Paired clients authenticate with a high-entropy opaque device credential sent as
`Authorization: Bearer <credential>` ([RFC 6750][rfc6750]). The server stores
only a hash. Host loopback console access stays a separate operator path without
a device credential. Opaque server-side handles win over JWTs because Milestone 2
requires immediate revocation.

This is the standard API token model. Milestone 2 uses OAuth Bearer *usage*
without standing up an OAuth authorization server. Pairing issues the credential
([ADR-0003](0003-device-pairing-protocol.md)). Day-to-day calls present it per
RFC 6750.

## Decision

1. Issue one opaque device credential at pairing claim time. Show the secret once.
2. Require `Authorization: Bearer` on HTTP for paired clients.
3. Authenticate WebSocket the same way when the client can set Upgrade headers.
   For browser clients that cannot set custom headers ([WHATWG WebSockets][whatwg-ws]),
   use a first-message auth frame. Do not put credentials in query strings
   ([RFC 6750 §2.3][rfc6750], [OWASP REST][owasp-rest], [OWASP API2:2023][owasp-api2]).
4. Store only a cryptographic hash of the durable credential. Prefer SHA-256 (or
   HMAC-SHA-256 with a server pepper) for high-entropy secrets. Constant-time
   compare. Never log the raw credential ([NIST SP 800-63B-4 look-up secrets][nist-authn],
   [OWASP Authentication][owasp-authn]).
5. Treat an invalid, missing, or revoked credential as unauthenticated for paired
   client paths. Return `401` with a `WWW-Authenticate: Bearer` challenge when
   appropriate ([RFC 6750 §3][rfc6750], [RFC 9110 §11][rfc9110]).
6. On revoke, delete or mark the stored hash unusable and close that device's
   active HTTP work and WebSocket connections immediately. Opaque handles revoke
   by server state ([RFC 7009][rfc7009] handle model).

TLS is mandatory for Bearer tokens on non-loopback networks ([RFC 6750][rfc6750],
[OWASP REST][owasp-rest]). Milestone 2 stays on `127.0.0.1`. Remote HTTPS is
Milestone 3.

## Considered options

### Credential transport

| Option | Verdict | Why |
|--------|---------|-----|
| Bearer in `Authorization` ([RFC 6750][rfc6750]) | **Selected** | Standard API pattern. Header is the recommended method. Resource servers must support it. |
| HTTP Basic ([RFC 7617][rfc7617]) | Rejected | Password-pair model. Wrong shape for a one-shot device secret. |
| HTTP Digest ([RFC 7616][rfc7616]) | Rejected | Password challenge-response. Rare in modern APIs. Weak without TLS. |
| Mutual TLS client certs ([RFC 8705][rfc8705]) | Deferred | Strong sender-constraining. Needs PKI and the remote TLS milestone. |
| API key in custom header or query | Rejected as primary | Custom headers fragment clients. Query keys leak via logs and history ([OWASP REST][owasp-rest]). |

### Token representation

| Option | Verdict | Why |
|--------|---------|-----|
| Opaque server-side handle | **Selected** | Lookup each request. Revoke flips device state. Matches "terminate access immediately." |
| JWT access token ([RFC 7519][rfc7519], [RFC 8725][rfc8725]) | Rejected for MS2 | Self-contained tokens stay valid until expiry unless a denylist or introspection exists ([RFC 7009][rfc7009], [OWASP REST][owasp-rest]). That recreates server state plus JWT attack surface. |
| Short-lived JWT + refresh | Rejected for MS2 | Adds refresh infra. Revocation is bounded by access-token TTL, not immediate. |

### WebSocket credential placement

| Option | Verdict | Why |
|--------|---------|-----|
| `Authorization` on HTTP Upgrade | **Selected** for non-browser clients | Same credential path as HTTP. Handshake can fail closed. |
| First WebSocket message | **Selected** for browsers | Browser `WebSocket` API cannot set custom headers ([WHATWG][whatwg-ws]). |
| `?access_token=` query | Rejected | Explicitly discouraged ([RFC 6750 §2.3][rfc6750], [OWASP API2:2023][owasp-api2]). |
| Cookie session for second clients | Rejected for MS2 | CSRF and cookie-scope complexity. Second clients are API clients. |
| Abuse `Sec-WebSocket-Protocol` | Rejected | Subprotocol negotiation, not an auth standard ([RFC 6455][rfc6455]). |

### At-rest storage

| Option | Verdict | Why |
|--------|---------|-----|
| Hash high-entropy credential (SHA-256 / HMAC) | **Selected** | NIST allows approved hash for look-up secrets ≥ 112 bits security strength ([NIST SP 800-63B-4][nist-authn]). Fast hash is fine. Slow password KDFs add request latency with no brute-force benefit. |
| Store plaintext | Rejected | DB leak equals full operator access ([OWASP API2:2023][owasp-api2]). |
| Encrypt recoverable secret | Rejected as primary | Needs key management. Hashing removes a decryptable blob. |
| Argon2id on durable credential | Rejected | Right tool for low-entropy secrets. Wrong cost for ≥112-bit random tokens. |

## Consequences

- Every authenticated request hits persistence (or a cache keyed by credential
  hash) for device state. That is the cost of instant revoke.
- Browser event-stream clients need a small first-message auth contract in
  `packages/contracts`.
- Milestone 3 must put TLS in front of Bearer credentials before any non-loopback
  bind or reverse proxy.
- Sender-constrained tokens (mTLS or DPoP, [RFC 9700][rfc9700]) stay open for a
  later remote hardening pass.

## Sources

- [RFC 6750 — OAuth 2.0 Bearer Token Usage][rfc6750]
- [RFC 7009 — OAuth 2.0 Token Revocation][rfc7009]
- [RFC 7519 — JSON Web Token (JWT)][rfc7519]
- [RFC 8725 — JWT Best Current Practices][rfc8725]
- [RFC 8705 — OAuth 2.0 Mutual-TLS Client Authentication][rfc8705]
- [RFC 9110 — HTTP Semantics, authentication][rfc9110]
- [RFC 6455 — The WebSocket Protocol][rfc6455]
- [RFC 9700 — Best Current Practice for OAuth 2.0 Security][rfc9700]
- [WHATWG WebSockets Standard][whatwg-ws]
- [NIST SP 800-63B-4 — Authenticators][nist-authn]
- [OWASP API Security Top 10 2023 — API2 Broken Authentication][owasp-api2]
- [OWASP REST Security Cheat Sheet][owasp-rest]
- [OWASP Authentication Cheat Sheet][owasp-authn]

[rfc6750]: https://datatracker.ietf.org/doc/html/rfc6750
[rfc7009]: https://datatracker.ietf.org/doc/html/rfc7009
[rfc7519]: https://datatracker.ietf.org/doc/html/rfc7519
[rfc8725]: https://datatracker.ietf.org/doc/html/rfc8725
[rfc8705]: https://datatracker.ietf.org/doc/html/rfc8705
[rfc9110]: https://datatracker.ietf.org/doc/html/rfc9110#section-11
[rfc6455]: https://datatracker.ietf.org/doc/html/rfc6455
[rfc9700]: https://www.rfc-editor.org/rfc/rfc9700
[rfc7617]: https://datatracker.ietf.org/doc/html/rfc7617
[rfc7616]: https://datatracker.ietf.org/doc/html/rfc7616
[whatwg-ws]: https://websockets.spec.whatwg.org/
[nist-authn]: https://pages.nist.gov/800-63-4/sp800-63b/authenticators/
[owasp-api2]: https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/
[owasp-rest]: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
[owasp-authn]: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
