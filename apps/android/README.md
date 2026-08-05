# Agent Server Android

Native Jetpack Compose app for the Agent Server operator workflow.

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
./gradlew --no-daemon --stacktrace --warning-mode=all lintRelease testDebugUnitTest assembleDebug assembleRelease
```

Install a debug build on a connected device or emulator:

```sh
./gradlew :app:installDebug
```

## Local development transport

- **Release** builds reject cleartext HTTP and WebSocket traffic.
- **Debug** builds allow cleartext through a debug-only network security config. No trust-all TLS.

## CI

Android checks run in `.github/workflows/android.yml` when `apps/android/**` changes.
