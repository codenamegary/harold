# Milestone 2: Trusted Devices

Status: Planned  
Roadmap: [Agent Server delivery roadmap](roadmap.md)  
Depends on: [Milestone 1: Core local operator](ms1-core-local-operator.md)

Security decisions:

- [ADR-0001 Device authentication](../docs/adr/0001-device-authentication.md)
- [ADR-0002 Device authorization](../docs/adr/0002-device-authorization.md)
- [ADR-0003 Device pairing protocol](../docs/adr/0003-device-pairing-protocol.md)

## Value

A second client can become a durable, revocable full operator through a
client-neutral pairing lifecycle.

Milestone 2 adds device identity on top of the Milestone 1 loopback system.
Agent Server issues short-lived one-time pairing codes, hands a durable
credential to the claiming client, tracks connection and last-seen state, and
revokes access immediately when asked.

## Delivery structure

Milestone 2 is delivered as seven independently verifiable epics on GitHub:

1. [Device contracts and persistence](https://github.com/codenamegary/agent-server/issues/149)
2. [Pairing codes and credential issuance](https://github.com/codenamegary/agent-server/issues/150)
3. [Device authentication and authorization middleware](https://github.com/codenamegary/agent-server/issues/151)
4. [Device registry and presence](https://github.com/codenamegary/agent-server/issues/152)
5. [Revocation](https://github.com/codenamegary/agent-server/issues/153)
6. [Devices console slice](https://github.com/codenamegary/agent-server/issues/154)
7. [Second-client lifecycle and hardening](https://github.com/codenamegary/agent-server/issues/155)

Each epic must satisfy its own acceptance, verification, migration, error, and
recovery criteria before the next dependent epic is considered complete.

## Target architecture

```text
/
├── apps/
│   ├── server/          # Device auth, pairing, registry, connection tracking
│   └── web/             # Devices and Connect pair slices go live
├── packages/
│   ├── contracts/       # Device, pairing, and device event schemas
│   └── test-support/    # Second-client fixtures and pairing helpers
├── docs/
│   └── adr/             # Authn, authz, and pairing decisions
└── spec/
    ├── ms1-core-local-operator.md
    ├── ms2-trusted-devices.md
    └── roadmap.md
```

Keep `apps/server` a modular monolith. Add a `device` vertical slice for
pairing, credentials, registry, and auth. Put authentication and authorization
in middleware shared by HTTP and the event stream. Extract a package only when
a second consumer needs the same code.

## Technical decisions

Day-to-day API auth uses opaque Bearer credentials per RFC 6750. Milestone 2
does not stand up an OAuth authorization server. Pairing issues the credential.
See the ADRs for alternatives considered.

### TypeScript and contracts

- Follow the Milestone 1 TypeScript rules.
- Define device, pairing-code, claim, and credential models with Zod in
  `packages/contracts`.
- Infer TypeScript types from those schemas.
- Keep public resource names `/v1/devices` and `/v1/pairing-codes`.

### Host operator vs paired device

See [ADR-0002](../docs/adr/0002-device-authorization.md).

- The loopback host console remains a full operator without a device
  credential. Milestone 1 host access stays intact.
- A paired client presents a durable device credential on every HTTP request
  and WebSocket connection.
- Every paired device is a full operator. No roles or partial scopes in this
  milestone.
- Split middleware: authenticate → principal (`host` | `device:{id}` |
  unauthenticated), then authorize → active full operator.
- Routes ask the authz layer. They do not inspect device rows ad hoc. Later
  scopes or roles extend authorize only.

### Pairing protocol

See [ADR-0003](../docs/adr/0003-device-pairing-protocol.md).

- Pairing codes are short-lived (≤ 10 minutes) and one-time.
- Format stays human-enterable, matching the prototype shape `XXX-XXX`
  (six alphanumeric characters with a separator).
- Low-entropy codes require rate limits and a slow hash at rest.
- Claim exchanges a valid code for a durable device credential and device
  record.
- A claimed, expired, or revoked code cannot be reused.
- The claim request may include a display name and platform hint. Platform is
  informational only.
- QR codes are a convenience encoding of the pairing payload for clients that
  can scan. The protocol is the code string and claim API, not the QR image.
- Android-specific presentation is out of scope. Prove the lifecycle with a
  local second HTTP and WebSocket client.

### Credentials

See [ADR-0001](../docs/adr/0001-device-authentication.md).

- Issue an opaque device credential once at claim time.
- Store only a hash of the credential at rest.
- Authenticate with `Authorization: Bearer <credential>`.
- Browser WebSocket clients use a first-message auth frame. No credentials in
  query strings.
- Never log raw credentials, pairing codes after display, or credential hashes
  in a recoverable form.
- Do not implement public-key device attestation in this milestone.

### Presence and events

Add durable device events to the existing journal and `/v1/events` stream:

- `device.paired`
- `device.connected`
- `device.disconnected`
- `device.revoked`

Track last-seen from authenticated requests and event-stream activity.
Report `online`, `offline`, or `revoked` honestly from real connection state.

### Revocation

- `DELETE /v1/devices/:deviceId` revokes the device.
- Revocation invalidates the credential immediately.
- Active HTTP work and WebSocket connections for that device terminate now.
- Retain the device record with `revoked` state so operators can see history.

### Bind address

- Milestone 2 stays on `127.0.0.1`.
- Remote HTTPS access is Milestone 3.
- Externally advertised URL and Connect wizard network steps stay read-only or
  honestly incomplete where they depend on Milestone 3.

## Functional scope

Deliver:

- Create a short-lived, one-time pairing code from the host console.
- Claim a code from a second local client and receive a durable credential.
- Reconnect that client with the credential and no new pairing step.
- List paired devices with connection or last-seen state.
- Revoke a device and confirm its access ends immediately.
- Stream device lifecycle events to authenticated operators.
- Keep host loopback console access working without pairing.

## Web console

The Devices page and Connect pair step already exist as disabled honesty UI.
Milestone 2 turns them on against the real API and event stream.

Wire:

- Devices slice: list, last-seen, status, revoke.
- Connect pair step: create code, show code and expiry, wait for claim, link to
  Devices.
- Optional QR rendering of the pairing payload as a convenience only.

Do not enable:

- External URL configuration as a working remote path.
- Real reachability or TLS checks.
- Android-only flows that cannot run through the shared API.

Disabled controls must stay clearly disabled when their milestone has not
landed.

## Quality bar

Every epic includes:

- Contract and integration coverage
- Persisted-data compatibility or an explicit migration
- Structured errors and actionable logs
- A demonstrated failure and recovery path
- Critical user-journey coverage where it provides meaningful protection

Default automated tests use a local second client against the loopback server.
No Android runtime is required.

The final end-to-end journey creates a pairing code on the host console, claims
it from a second local client, reconnects with the stored credential, performs
an operator action, observes device presence events, revokes the device from
the host console, and confirms the revoked client loses HTTP and event-stream
access immediately.

## Completion boundary

Milestone 2 is complete only when all seven epics pass their checks and the
local second-client pairing lifecycle works without simulated success.

Out of scope:

- OAuth authorization server and RFC 8628 Device Authorization Grant
- Remote HTTPS and reverse-proxy setup
- Externally advertised URL as a live remote endpoint
- Android client application
- QR as the pairing protocol itself
- Device roles, scoped permissions, or per-device policy
- Public-key attestation or hardware-backed device identity
- Operational dashboard metrics beyond real device presence
- Runtime settings for pairing toggles unless required for the lifecycle
- Repository onboarding and provider integrations
- Agent Server-level approvals
- Installers, desktop shells, and containers
