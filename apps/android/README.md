# Harold Android

Native Jetpack Compose app for the Harold user workflow.

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
2. Install the Harold Android app. Use a release APK from GitHub Releases, or a debug build (installs as `harold.android.debug`):
   ```sh
   ./gradlew :app:installDebug
   ```
3. Pair using the in-app scanner or by pointing your phone camera at the terminal pairing QR code (`harold://pair`), which opens Harold directly. Payloads using any other scheme are rejected as invalid pairing URIs.

## Transport

Every build type allows cleartext HTTP traffic, so the app can pair with a LAN host over `http://`. One network security config in `src/main` sets this. No trust-all TLS.

## Debug and release builds

Debug builds use the application id `harold.android.debug` and a `-debug` version suffix. They install next to the release app (`harold.android`) and never replace it.

Release builds are signed only when these env vars are all set:

- `ANDROID_KEYSTORE_PATH`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Without them, `assembleRelease` produces an unsigned APK. CI signs releases with the distribution key held in repo secrets.

`versionName` is set by release-please. `versionCode` is derived from it as `major * 10000 + minor * 100 + patch`.

## Authenticated transport

One OkHttp client serves every saved Harold. Each request gets the device
credential for the Harold it is calling, as `Authorization: Bearer`.
The credential never appears in a URL or a log line.

While the app is open, every saved Harold has its own connection. One Harold
that cannot be reached leaves the others connected. In the background, a Harold
stays connected only while it has a session that is starting, running, waiting
for permission, or stopping.

- HTTP: `GET /v1/workspaces?limit=1` proves the path from the shell.
- Session events: `GET /v1/sessions/:sessionId/events?agentId=…` as SSE while a
  chat is selected. Opening the stream is the subscribe; switching sessions
  closes it and opens another. Presence Online is this open stream. The server
  sends `: ping` heartbeats every 25 s; roughly 75 s of silence is treated as a
  retryable disconnect.
- Commands: prompts, cancels, and permission/extension replies are REST POSTs,
  independent of the stream.

Reconnect uses `min(250 * 2^(attempt - 1), 4000)` ms with no jitter. A rejected
credential on the shell stops auto-retry for that Harold and forgets it. The
others stay connected. When none remain, the app returns to pairing. Every
other disconnect, slow consumer included, keeps reconnecting.

## CI

Android checks run in `.github/workflows/ci.yml` when `apps/android/**` changes.
