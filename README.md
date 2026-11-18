# Harold

**Hark! The Harold Agents Sing**

Liberate your agents, work from the couch.

Harold is an Android app that connects to your machines over SSH and runs ACP coding agents. Add a host, sign in with your SSH credentials, and drive your agents from the phone.

## Demo

https://github.com/user-attachments/assets/bcf88530-228a-4b85-a0ad-cfcc5c9ec186

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
- POSIX shell tools: `sh`, `bash`, `mkfifo`, `flock` (optional), `nohup`, `tail`, `head`, `wc`, `awk`, `grep`, `sort`
- an ACP-compatible agent CLI
- `git` (for workspace and change review)

1. Add the host in the Harold app.
2. Sign in with your SSH credentials.
3. Start a session in any folder on that host.

Harold installs nothing on the host. It sends a small host script inline over
SSH; the script starts a detached agent host with `nohup` and keeps runtime
state in `~/.harold/run/`. Each host process writes its own
`~/.harold/run/<agent>/logs/<run-id>/` directory, so a restart never erases
the previous process's output. Agent and workspace settings live in
`~/.harold/` as plain files. The agent keeps running when the phone
disconnects, and the next connection attaches to the same process. Session
history stays with the agent and is read through ACP `session/list`.

## Working on the app

Install the commit hook once per clone:

```sh
git config core.hooksPath .githooks
```

The Android build, unit tests, and the opt-in SSH integration test are
documented in [apps/android/README.md](apps/android/README.md).

## Architecture

See [apps/android/README.md](apps/android/README.md#the-ssh-transport-end-to-end): the SSH session flow, the `~/.harold/` state layout, agent settings, and how to run the integration test without touching a real host.
