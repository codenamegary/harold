# Harold Android

Native Jetpack Compose app for the Harold operator workflow.

## Prerequisites

- JDK 17
- Android SDK with platform 36 and current build-tools
- `ANDROID_HOME` or `ANDROID_SDK_ROOT` pointing at the SDK

Install platform 36:

```sh
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

## Build commands

Run from this directory (`apps/android`):

```sh
./gradlew --no-daemon --stacktrace --warning-mode=all lintRelease testDebugUnitTest assembleRelease
```

Install a debug build on a connected device or emulator:

```sh
./gradlew :app:installDebug
```

## Migration from pre-rename app

The application id was renamed to `harold.android` (formerly `server.agent.android`). Because the `applicationId` changed, existing installations will not upgrade in-place.

1. Uninstall the legacy build from your device or emulator:
   ```sh
   adb uninstall server.agent.android
   ```
2. Install the Harold Android app:
   ```sh
   ./gradlew :app:installDebug
   ```
3. Pair using the in-app scanner or by pointing your phone camera at the terminal pairing QR code (`harold://pair`), which opens Harold directly. Legacy `agent-server://pair` payloads will prompt that an app update is required.

## Local development transport

- **Release** builds reject cleartext HTTP and WebSocket traffic.
- **Debug** builds allow cleartext through a debug-only network security config. No trust-all TLS.

## Authenticated transport

One OkHttp client serves both authenticated paths. It attaches the paired device
credential as `Authorization: Bearer` ([ADR-0001](../../docs/adr/0001-device-authentication.md)).
The credential never appears in a URL or a log line.

- HTTP: `GET /v1/workspaces?limit=1` proves the path from the shell.
- Session stream: `/v1/sessions/stream` over WebSocket while paired. Bearer
  travels on the HTTP Upgrade. There is no browser-style `auth` first message.
  Subscribe/switch only when a chat is selected. Presence Online is this open
  socket.

Reconnect uses `min(250 * 2^(attempt - 1), 4000)` ms with no jitter. A rejected
credential (HTTP `401`, or close `1008` with reason `unauthorized`) stops
auto-retry, clears the local credential, and returns the operator to pairing.
Every other close, slow consumer included, keeps reconnecting.

## CI

Android checks run in `.github/workflows/android.yml` when `apps/android/**` changes.
