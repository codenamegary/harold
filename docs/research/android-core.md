# Android core research

Checked: 2026-08-05

Scope: facts needed to define the first small native Android operator app.
External claims use first-party Android, Gradle, and OkHttp sources. Repository
claims link to source or accepted ADRs.

## Recommended baseline

- Use one `:app` module. Split by package and responsibility, not Gradle module:
  `pairing`, `credentials`, `network`, `events`, and screen features.
- Use Jetpack Compose, one activity, screen-level `ViewModel`s, immutable
  `StateFlow` UI state, and unidirectional data flow. Android's current
  architecture guidance recommends Compose, repositories between UI and data
  sources, screen-level ViewModels, and UDF. It also says a domain layer is
  optional and most useful when logic is reused or complex
  ([Android architecture recommendations](https://developer.android.com/topic/architecture/recommendations)).
- Keep HTTP, WebSocket, credential storage, and QR scanning behind interfaces.
  Use constructor injection and an application-level dependency container. A
  DI framework is optional for a small app
  ([manual dependency injection](https://developer.android.com/training/dependency-injection/manual)).
- Set `minSdk = 23`. Compose can be started at API 21
  ([Compose setup](https://developer.android.com/develop/ui/compose/setup)), but
  current AndroidX has a default minimum of API 23 and new Compose releases
  moved to API 23
  ([AndroidX versions](https://developer.android.com/jetpack/androidx/versions),
  [Compose UI releases](https://developer.android.com/jetpack/androidx/releases/compose-ui)).
  API 23 also provides `KeyGenParameterSpec`, which gives a clean direct
  Keystore implementation
  ([KeyGenParameterSpec](https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec)).
- Set `compileSdk = 36` and `targetSdk = 36` unless API 37 features are needed.
  Google Play requires new apps and updates to target API 36 from August 31,
  2026
  ([Play target API requirements](https://developer.android.com/google/play/requirements/target-sdk)).

This baseline drops API 21 and 22. The benefit is current AndroidX without
dependency downgrades and one credential-encryption path.

## Dependency baseline

Use stable releases only:

| Item | Baseline | Evidence |
| --- | --- | --- |
| Android Gradle Plugin | `9.3.1` | Latest non-preview version in [Google Maven metadata](https://dl.google.com/dl/android/maven2/com/android/tools/build/gradle/maven-metadata.xml). The 9.3 release requires Gradle 9.5.0 and JDK 17 ([AGP 9.3 release notes](https://developer.android.com/build/releases/agp-9-3-0-release-notes)). |
| Gradle wrapper | `9.5.0` | AGP 9.3 minimum and default ([AGP 9.3 release notes](https://developer.android.com/build/releases/agp-9-3-0-release-notes)). |
| Compose BOM | `2026.06.01` | Current release in [Google Maven metadata](https://dl.google.com/dl/android/maven2/androidx/compose/compose-bom/maven-metadata.xml). A BOM selects Compose versions tested together ([Compose BOM guide](https://developer.android.com/develop/ui/compose/bom)). |
| Activity Compose | `1.13.0` | Current stable release ([Activity releases](https://developer.android.com/jetpack/androidx/releases/activity)). |
| Lifecycle | `2.11.0` | Current stable release ([Lifecycle releases](https://developer.android.com/jetpack/androidx/releases/lifecycle)). |
| Navigation Compose, if needed | `2.9.8` | Current stable release ([Navigation releases](https://developer.android.com/jetpack/androidx/releases/navigation)). |
| OkHttp | `5.4.0` | Current release in [Maven Central metadata](https://repo.maven.apache.org/maven2/com/squareup/okhttp3/okhttp/maven-metadata.xml). |
| Google code scanner, if selected | `16.1.0` | Version in the current setup guide ([Google code scanner](https://developers.google.com/ml-kit/vision/barcode-scanning/code-scanner)). |

AGP 9 enables built-in Kotlin. Do not apply `org.jetbrains.kotlin.android`
unless the project opts out
([built-in Kotlin migration](https://developer.android.com/build/migrate-to-built-in-kotlin)).

## Credential storage

The claimed credential is a durable, opaque, full-operator Bearer secret. The
server returns it once and stores only its hash
([ADR-0001](../adr/0001-device-authentication.md),
[device response schema](../../packages/contracts/src/http/device.ts)).

Recommended implementation:

1. Generate a non-exportable AES key under an app-specific alias with the
   `AndroidKeyStore` provider.
2. Encrypt the UTF-8 credential with `AES/GCM/NoPadding` and a new random IV.
3. Store only the ciphertext, IV, format version, device ID, and server origin
   in a small app-private store. Preferences DataStore fits small durable data
   and belongs in the data layer
   ([DataStore guide](https://developer.android.com/topic/libraries/architecture/datastore)).
4. Keep the ciphertext out of backup. `getNoBackupFilesDir()` is excluded
   automatically, or add explicit backup exclusion rules
   ([Auto Backup](https://developer.android.com/identity/data/autobackup)).
5. Delete ciphertext and Keystore alias on local sign-out, credential
   invalidation, or re-pair.

Android Keystore keeps key material non-exportable and can restrict key use
([Android Keystore](https://developer.android.com/privacy-and-security/keystore)).
GCM is an authenticated-encryption mode and Android supports
`AES/GCM/NoPadding`
([Cipher reference](https://developer.android.com/reference/javax/crypto/Cipher)).
Do not start new code on `EncryptedSharedPreferences` or `MasterKey`.
AndroidX Security Crypto deprecated all APIs in favor of platform APIs and
direct Keystore use
([AndroidX Security releases](https://developer.android.com/jetpack/androidx/releases/security)).

Do not require biometric or device-credential authentication on every key use
unless product wants an unlock gate. Keystore can enforce user authentication,
but that blocks unattended startup and reconnect
([Android Keystore](https://developer.android.com/privacy-and-security/keystore)).

## HTTPS and development cleartext

- Release builds must allow only `https` and `wss`. Accepted server policy
  requires TLS before any non-loopback Bearer use
  ([ADR-0001](../adr/0001-device-authentication.md)).
- Use a release network security config with cleartext disabled.
- If local development needs `http` and `ws`, put a permissive
  `network_security_config.xml` in the debug source set only. Do not use one
  permissive config shared by release.
- Prefer local HTTPS with a debug-only CA when practical. Android network
  security config supports debug-only trust anchors. Its `debug-overrides`
  element controls trust anchors, while `cleartextTrafficPermitted` belongs on
  `base-config` or `domain-config`
  ([Network security configuration](https://developer.android.com/privacy-and-security/security-config)).
- Never add a trust-all `X509TrustManager` or hostname verifier.

The current pairing response contains an advertised `endpoint`. Without an
advertised URL it falls back to server loopback
([device service](../../apps/server/src/device/service.ts)). An Android device
cannot use the server machine's `127.0.0.1`. For example, an emulator's
`127.0.0.1` is its own loopback and `10.0.2.2` is the host-loopback alias
([emulator network addresses](https://developer.android.com/studio/run/emulator-networking-address)).
Android development therefore needs an explicit reachable endpoint.

## HTTP and WebSocket transport

Use one `OkHttpClient` and build all authenticated HTTP requests with
`Authorization: Bearer <credential>`. Never put the credential in a URL.

For `/v1/events`:

- Build an OkHttp `Request` with the Bearer header, then pass it to
  `OkHttpClient.newWebSocket`. OkHttp's request builder sets arbitrary headers
  and `newWebSocket` connects using that request
  ([OkHttp Request source](https://github.com/square/okhttp/blob/master/okhttp/src/commonJvmAndroid/kotlin/okhttp3/Request.kt),
  [OkHttpClient source](https://github.com/square/okhttp/blob/master/okhttp/src/commonJvmAndroid/kotlin/okhttp3/OkHttpClient.kt)).
- This matches the server's native-client path. The server accepts Upgrade
  header authentication. First-message auth exists only as a browser fallback
  ([ADR-0001](../adr/0001-device-authentication.md),
  [event stream route](../../apps/server/src/event/stream.routes.ts)).
- Treat each socket as single-use. `onFailure` ends that socket and no more
  listener calls occur
  ([OkHttp WebSocketListener source](https://github.com/square/okhttp/blob/master/okhttp/src/commonJvmAndroid/kotlin/okhttp3/WebSocketListener.kt)).
  OkHttp has no built-in WebSocket reconnect policy. A failed socket needs a
  new instance
  ([OkHttp issue 5249](https://github.com/square/okhttp/issues/5249),
  [OkHttp issue 5580](https://github.com/square/okhttp/issues/5580)).
- Reconnect only while the app has an active foreground consumer. Use a fresh
  request and current credential. Apply bounded exponential backoff with
  jitter. Reset the attempt count after `onOpen`. Network retry guidance says
  to use exponential backoff and not retry authorization failures until valid
  credentials exist
  ([offline-first data guidance](https://developer.android.com/topic/architecture/data-layer/offline-first)).
- A handshake `401`, or WebSocket close `1008` with `unauthorized`, means stop
  retrying and return to pairing. The server uses close code `1008` for failed
  stream authentication
  ([event stream route](../../apps/server/src/event/stream.routes.ts)).
- Track the highest event cursor applied by the reducer. Reconnect with
  `/v1/events?cursor=<cursor>` and optional `workspaceId` or `sessionId`.
  The server validates those query fields and replays records after the cursor
  before switching to live delivery
  ([stream contract](../../packages/contracts/src/events/stream.ts),
  [stream handshake](../../apps/server/src/event/stream.handshake.ts),
  [stream connection](../../apps/server/src/event/stream.connection.ts)).
- Advance the cursor only after the full event has been applied. Reducers must
  tolerate duplicate delivery.

The server sends a ping every 30 seconds and terminates a connection that misses
the next pong
([stream resilience](../../apps/server/src/event/stream.resilience.ts)).

## Background and process death

Default product behavior should be foreground-only live updates:

- Own the socket in the data layer. Open it when the relevant app or session
  consumer becomes active. Close it when no foreground screen needs it.
- Collect ViewModel flows with `collectAsStateWithLifecycle`. It starts at
  `STARTED` and stops at `STOPPED`
  ([lifecycle-aware coroutines](https://developer.android.com/topic/libraries/architecture/coroutines)).
- Do not promise a permanent background socket. Android stops background
  services after a grace period
  ([background execution limits](https://developer.android.com/about/versions/oreo/background)).
  A long-running user-noticeable connection needs a foreground service and
  visible notification
  ([foreground services](https://developer.android.com/develop/background-work/services/fgs)).
- Do not use WorkManager to hold a WebSocket. WorkManager is for deferrable
  work that must complete even if the app process is gone
  ([background optimization](https://developer.android.com/topic/performance/background-optimization)).

`ViewModel` survives configuration change, not system process death.
Cached processes can be killed as needed, and `Application.onTerminate()` is
never called on production Android devices
([process lifecycle](https://developer.android.com/guide/components/activities/process-lifecycle),
[Application reference](https://developer.android.com/reference/android/app/Application#onTerminate())).
`SavedStateHandle` is for the small amount of UI state needed to recreate a
screen. Durable application state belongs on disk
([saving UI state](https://developer.android.com/topic/libraries/architecture/saving-states)).
Never put the Bearer credential in `SavedStateHandle`.

For event recovery, choose one coherent strategy:

1. **Full replay first:** on every cold start or uncertain reconnect, clear the
   projection and connect with `cursor=0`. This matches the web client's tested
   rebuild behavior
   ([web reconnect test](../../apps/web/src/session/session.stream.reconnect.test.tsx)).
   It is simplest but replay cost grows with journal history.
2. **Durable projection later:** atomically persist the reduced projection and
   its cursor. Resume after that cursor. Never persist the cursor without the
   matching projection.

## QR payload and pairing

Repository contract:

- Human code format is `XXX-XXX`
  ([pairing contract](../../packages/contracts/src/http/pairing-code.ts)).
- Claim is `POST /v1/pairing-codes/:code/claim`, with optional `name` and
  `platform`, and returns `{ device, credential }`
  ([device routes](../../apps/server/src/device/routes.ts)).
- The code is one-time and valid for at most ten minutes. QR is transport for
  the same claim flow, not another trust model
  ([ADR-0003](../adr/0003-device-pairing-protocol.md)).
- The repository does not yet define a QR wire format. It only says QR may
  contain the code plus endpoint hint
  ([ADR-0003](../adr/0003-device-pairing-protocol.md)).

Define one versioned payload before Android implementation. A practical shape
is:

```text
agent-server://pair?v=1&endpoint=https%3A%2F%2Fhost.example&code=ABC-DEF
```

Implement parsing as a pure function. Enforce a small input-size limit, exact
scheme and host, one supported version, one `endpoint`, one `code`, no unknown
security-sensitive fields, the repository code regex, and an absolute endpoint.
Require `https` in release. Android's `Uri` parser performs little validation
and can return garbage for invalid input, so parsing must be followed by these
explicit checks
([Android Uri](https://developer.android.com/reference/android/net/Uri)).

For scanning, Google code scanner needs no camera permission, delegates the UI
to Google Play services, and supports API 21+
([Google code scanner](https://developers.google.com/ml-kit/vision/barcode-scanning/code-scanner)).
Keep manual endpoint and code entry as a fallback if non-Play devices matter.

## Testing seams

Create narrow interfaces for:

- `CredentialStore`
- `PairingApi` and authenticated `AgentApi`
- `EventStreamFactory`
- `PairingPayloadParser`
- connectivity monitor, reconnect delay, clock, and random jitter
- scanner launcher

Prefer hand-written fakes. Android's testing guidance says fakes are lightweight
and preferred, and recommends replaceable dependencies
([Android test doubles](https://developer.android.com/training/testing/fundamentals/test-doubles)).

Minimum tests:

- JVM tests for QR validation, Bearer header creation, event decoding and
  reduction, duplicate cursors, reconnect state machine, backoff, and
  unauthorized terminal state.
- JVM integration tests with MockWebServer for pairing, HTTP problem responses,
  WebSocket Upgrade authorization, replay cursor, disconnect, and reconnect.
  MockWebServer is OkHttp's scriptable test server
  ([MockWebServer](https://square.github.io/okhttp/5.x/mockwebserver3/mockwebserver3/-mock-web-server/index.html)).
- Instrumented tests for Keystore create, read, delete, corrupt ciphertext, and
  missing key behavior.
- Compose tests for pairing and reconnect states. Compose testing APIs operate
  through semantics and support actions and assertions
  ([Compose testing](https://developer.android.com/develop/ui/compose/testing)).
- State restoration tests for fields that use `rememberSaveable` or
  `SavedStateHandle`. Compose provides `StateRestorationTester`
  ([Compose state saving](https://developer.android.com/develop/ui/compose/state-saving)).

Do not test private OkHttp callbacks directly. Test the app-owned stream state
machine through `EventStreamFactory`.

## Gradle and CI checks

Use the checked-in Gradle wrapper and JDK 17. A practical pull-request lane is:

```sh
./gradlew --no-daemon --stacktrace --warning-mode=all \
  lintRelease testDebugUnitTest assembleDebug assembleRelease
```

Run an emulator lane for:

```sh
./gradlew --no-daemon connectedDebugAndroidTest
```

Android documents `test`, `connectedAndroidTest`, `check`, and
`connectedCheck` as command-line test tasks
([command-line testing](https://developer.android.com/studio/test/command-line)).
Run lint explicitly in CI because Android says lint is not automatically run as
part of a build
([Android lint](https://developer.android.com/studio/write/lint)).
Gradle's `--warning-mode=all` prints every warning
([Gradle CLI](https://docs.gradle.org/current/userguide/command_line_interface.html)).
Commit Gradle dependency-verification metadata so CI verifies downloaded
artifact checksums and signatures
([Gradle dependency verification](https://docs.gradle.org/current/userguide/dependency_verification.html)).

Add release assembly now even if distribution comes later. It catches manifest
and release-only network-policy errors. It also exercises R8 and resource
shrinking when enabled. Keep emulator tests focused on Keystore and a few
end-to-end flows. Keep protocol and reducer coverage on the JVM.

## Product decisions still required

1. Is Android distribution Play-only? This decides whether Google code scanner
   can be the sole QR scanner or needs a non-Play fallback.
2. What exact versioned QR payload becomes server contract?
3. Is cleartext allowed in debug builds only, and which reachable development
   hosts must it cover?
4. Does opening the app decrypt immediately, or must the operator pass a
   biometric or device-unlock gate?
5. Are live updates foreground-only, or does product require a visible
   foreground service for background operation?
6. Does v1 always rebuild from `cursor=0`, or persist an event projection and
   cursor?
7. What device range justifies `minSdk` lower than 23, if any?
8. Which first operator workflows are in the Android project beyond pairing,
   connection state, and event transport?
