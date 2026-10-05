# Device authorization: flat full-operator model

Status: Accepted  
Milestone: [MS2 Trusted Devices](../../spec/ms2-trusted-devices.md)  
Related: [ADR-0001 Authentication](0001-device-authentication.md), [ADR-0003 Pairing](0003-device-pairing-protocol.md), [ADR-0007 Console retirement](0007-retire-console-device-only-edge.md)

Milestone 2 authorizes paired devices as full operators. (It originally also
authorized the host loopback console as a second principal kind; that exception
is retired by [ADR-0007](0007-retire-console-device-only-edge.md).) No roles,
scopes, or per-device policy in this milestone. That matches a single-operator
local server and keeps the revoke path simple: revoke the device, lose all
operator power.

## Decision

1. Every paired device with a valid credential may perform every operator action.
   (The original "authenticated host console on loopback" grant is retired by
   ADR-0007.)
2. Revoked, expired, or unknown credentials authorize nothing.
3. Do not introduce RBAC, OAuth scopes, or capability caveats in Milestone 2.
4. Document this as an intentional exception to least-privilege guidance for
   remote multi-client systems ([RFC 9700 §§2.3–2.4][rfc9700]). Revisit before
   non-loopback exposure.
5. Implement authorization as middleware, separate from authentication.
   Routes ask the authz layer. They do not inspect device rows ad hoc.

### Middleware shape

Keep two steps on every protected request and WebSocket:

1. **Authenticate** → principal (`device:{id}` | unauthenticated)
2. **Authorize** → today: principal is an active full operator

Scopes and roles, if added later, extend the authorize step only. Credential
transport and pairing stay unchanged.

Identity answers "who is this?" Authorization in Milestone 2 answers only
"is this an active operator?" Pairing decides membership. Revocation removes it.

## Considered options

| Option                                           | Verdict          | Why                                                                                               |
| ------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------- |
| Flat full-operator                               | **Selected**     | Product boundary for MS2. Every paired device is a full operator. One revoke path.                |
| OAuth scopes ([RFC 6749 §3.3][rfc6749])          | Deferred         | Useful when tokens must be narrower than full account power. No multi-privilege product need yet. |
| RBAC (admin / operator / viewer)                 | Deferred         | Needs users, roles, and UI. Out of MS2 roadmap scope.                                             |
| Audience-restricted tokens ([RFC 9700][rfc9700]) | Deferred         | Important when one credential could hit many resource servers. Harold is one server.              |
| Capability tokens (macaroons / attenuable creds) | Rejected for MS2 | Powerful for delegated caveats. Heavy for a local single-operator product.                        |

## Consequences

- A stolen device credential is full operator access until revoke. Credential
  hygiene in [ADR-0001](0001-device-authentication.md) and pairing controls in
  [ADR-0003](0003-device-pairing-protocol.md) matter more because authz is coarse.
- The host loopback exception stayed explicit in the authenticate step until
  ADR-0007 removed it. No request authenticates by origin alone.
- Authz middleware is the extension point for later scopes or roles. Do not
  sprinkle role checks in handlers.
- Milestone 3+ should re-open least privilege before Android and remote clients
  are routine. Candidate splits: read-only observer vs operator, or
  audience-bound credentials.

## Sources

- [RFC 6749 — OAuth 2.0 Authorization Framework][rfc6749]
- [RFC 9700 — Best Current Practice for OAuth 2.0 Security][rfc9700]
- [MS2 Trusted Devices](../../spec/ms2-trusted-devices.md)

[rfc6749]: https://www.rfc-editor.org/rfc/rfc6749#section-3.3
[rfc9700]: https://www.rfc-editor.org/rfc/rfc9700
