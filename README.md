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

Host requirements:

- sshd with exec and SFTP
- an ACP-compatible agent CLI
- `git` (for workspace and change review)

1. Add the host in the Harold app.
2. Sign in with your SSH credentials.
3. Start a session in any folder on that host.

Harold installs nothing on the host. It runs your agent CLI over an SSH exec channel and keeps agent and workspace settings in `~/.harold/` as plain files. Session history stays with the agent and is read through ACP `session/list`.

## Working on the app

```sh
bun install    # repo tooling (oxlint, scripts)
bun run check  # lint + script tests
```

The Android build and the SSH integration test are documented in
[apps/android/README.md](apps/android/README.md).

## Architecture

See [docs/architecture.md](docs/architecture.md): the SSH session flow, the `~/.harold/` state layout, agent settings, and how to run the integration test without touching a real host.
