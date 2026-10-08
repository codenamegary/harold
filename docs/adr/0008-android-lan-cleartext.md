# Android allows cleartext pairing on the LAN in every build

Status: Accepted  
Related: [ADR-0001 Device authentication](0001-device-authentication.md),
[ADR-0003 Pairing](0003-device-pairing-protocol.md),
[Issue #352](https://github.com/codenamegary/harold/issues/352)

ADR-0001 says Bearer credentials need TLS off loopback, and that remote HTTPS
is Milestone 3. Until that lands, the common way to reach a Harold host from a
phone is plain `http://` on the home LAN. Debug builds allowed that. Release
builds did not, so a published APK could not pair with the hosts people
actually run.

## Decision

1. Every Android build type allows `http` and `ws`. The allowance lives in one
   network security config in `src/main` with
   `cleartextTrafficPermitted="true"`. No build type overrides it.
2. The pairing parser accepts `http://` and `https://` endpoints in every
   build. No behavior forks on `BuildConfig.DEBUG`.
3. TLS stays the hardening path. When Milestone 3 ships HTTPS, revisit this ADR
   and decide whether to narrow cleartext to private address ranges or drop it.

## Consequences

- On an `http://` host, the device credential travels in cleartext on the LAN.
  Anyone who can sniff that network can replay it until the device is revoked.
  This is an accepted risk for trusted home and lab networks. It is not safe
  on shared or public networks.
- Pairing codes are short-lived and one-shot ([ADR-0003](0003-device-pairing-protocol.md)),
  which limits exposure during pairing. It does not protect the durable
  credential afterwards.
- Release and debug builds behave the same on the network, so bugs reproduce
  in either.

## Amendment of earlier ADRs

- ADR-0001: "TLS is mandatory for Bearer tokens on non-loopback networks" now
  has a client-side exception. The Android app permits cleartext LAN hosts
  until Milestone 3 HTTPS.
