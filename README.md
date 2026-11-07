# Harold

**Hark! The Harold Agents Sing**

Liberate your agents, work from the couch.

Harold is an Android app that connects to your machines over SSH and runs ACP coding agents. Add a host, sign in with your SSH credentials, and drive your agents from the phone.

## Install

Download `harold-android-<version>.apk` from [https://harold.codenamegary.com](https://harold.codenamegary.com) and open it on the phone. Android asks once to allow installs from your browser.

Verify an APK on a computer with the Android SDK:

```sh
sha256sum harold-android-<version>.apk
apksigner verify --print-certs harold-android-<version>.apk
```

## Using Harold

You need a machine you can reach with SSH that runs an ACP-compatible coding agent. Use an agent you already trust. OpenCode, Claude Code, Gemini CLI, and more all speak ACP.

1. Add the host in the Harold app.
2. Sign in with your SSH credentials.
3. Start a session in any folder on that host.

## Architecture

See [docs/architecture.md](docs/architecture.md).
