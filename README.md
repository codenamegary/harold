# Harold

**Hark! The Harold Agents Sing**

Liberate your agents, work from the couch.

Harold is an agent ACP proxy and the slickest Android agent app experience. Run Harold alongside your agents, wherever they are, whatever they are, and talk to them with the Harold app.

### The Harold Experience

https://github.com/user-attachments/assets/f046768b-8b1a-4b21-96db-69ae327722d6

## Quickstart

1. Install Harold wherever your agents are.

   Requires [Bun](https://bun.sh).

```bash
bun install -g @codenamegary/harold
harold setup # enable your agents, pick your connection method
harold start # start the Harold proxy
harold pair  # generate a code and show a QR code
```

2. Download and install the Harold app for Android.

   [https://harold.codenamegary.com](https://harold.codenamegary.com)

3. Launch the app, hit `pair` and scan the QR code from your terminal.

## Connecting to Harold

Harold is a proxy, you can point to it just like any other http server. Harold only needs to know what endpoint you've setup to embed it in the QR code, though you can also pair manually using the generated code. You can connect via...

- Point a DNS record at the IP where you're running Harold
- or Tailscale
- or ngrok
- or reverse tunnel from your Harold machine through a VPS
- or a trusted local network over plain HTTP (see below)

```bash
#!/usr/bin/env bash
# Runs on your Harold host - reverse-SSH Harold to a VPS with a public IP and/or DNS record

set -euo pipefail

REMOTE_HOST="${PUBLIC_HOST_USERNAME:-user@your-hostname.com}"
SSH_KEY="${PUBLIC_HOST_KEY:-$HOME/.ssh/your-hostname.com.key}"
LOCAL_PORT="${HAROLD_TUNNEL_LOCAL_PORT:-3847}"
REMOTE_PORT="${HAROLD_TUNNEL_REMOTE_PORT:-3847}"
STATUS_URL="http://127.0.0.1:${LOCAL_PORT}/v1/status"
PUBLIC_URL="${AGENT_TUNNEL_PUBLIC_URL:-https://your-hostname.com/v1/status}" # For embedding in pairing QR codes

if [[ ! -f "$SSH_KEY" ]]; then
  echo "SSH key not found: $SSH_KEY" >&2
  exit 1
fi

if ! curl -fsS --max-time 2 "$STATUS_URL" >/dev/null; then
  echo "Harold is not reachable at $STATUS_URL" >&2
  echo "Start Harold locally before opening the tunnel." >&2
  exit 1
fi

echo "Tunneling ${REMOTE_HOST}:0.0.0.0:${REMOTE_PORT} -> 127.0.0.1:${LOCAL_PORT}"
echo "Public check: $PUBLIC_URL"
echo "Ctrl-C to stop."
echo

exec ssh \
  -i "$SSH_KEY" \
  -o BatchMode=yes \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -N \
  -R "0.0.0.0:${REMOTE_PORT}:127.0.0.1:${LOCAL_PORT}" \
  "$REMOTE_HOST"
```

### Trusted local network over HTTP

Harold binds loopback by default. To reach it from a phone on the same trusted
network without a TLS proxy:

```bash
HAROLD_HOST=0.0.0.0 harold start
harold connect --lan    # detects the LAN address and persists bindHost + advertisedUrl
harold pair
```

Pass an address explicitly with `harold connect --lan 192.168.1.10`. The command
only accepts private-network addresses, never public ones. If Harold was already
running on the default loopback bind, it saves the settings and prints the
restart command.

Plain HTTP sends the device credential and session traffic in cleartext. Use it
only on a network you trust. For public access, use HTTPS through Tailscale, a
reverse proxy, or a tunnel.

## Harold cli

```
> harold

Usage: harold [options] [command]

Hark! The Harold Agents Sing - Access your agents on Android from anywhere.

Options:
  -V, --version      output the version number
  -h, --help         display help for command

Commands:
  start              start the Harold daemon in the background
  setup [options]    configure agents, a workspace, reachability, and pairing
  status             show Harold status summary and live daemon state
  stop               stop the running Harold daemon
  agent              list, enable, disable, and probe agents
  pair [options]     pair a device by scanning a QR code
  device             manage paired devices
  workspace          manage registered workspaces
  logs [options]     tail the Harold daemon log
  connect [options]  verify and persist the advertised endpoint devices pair against
```

## Android app

Download `harold-android-<version>.apk` from the latest [harold-android-v* release](https://harold.codenamegary.com) and open it on the phone. Android asks once to allow installs from your browser.

Verify an APK on a computer with the Android SDK:

```sh
sha256sum harold-android-<version>.apk
apksigner verify --print-certs harold-android-<version>.apk
```

## Run from source

Requires [Bun](https://bun.sh). Clone the repo and then...

```sh
bun install
bun run dev start
```

`bun run dev` runs the CLI. Pass it any command: `bun run dev setup`,
`bun run dev status`, `bun run dev stop`.

The Harold API listens on `127.0.0.1:3847`. Every route except `GET /v1/status` and the pairing claim requires a device credential (`Authorization: Bearer`). Pair a device with `harold pair` to get one.

## Configuration

| Variable          | Default     | Meaning                              |
| ----------------- | ----------- | ------------------------------------ |
| `HAROLD_HOST`     | `127.0.0.1` | Bind address (`0.0.0.0` for the LAN) |
| `HAROLD_PORT`     | `3847`      | Device API port                      |
| `HAROLD_DATA_DIR` | `~/.harold` | Database, logs, and runtime settings |
