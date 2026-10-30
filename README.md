# Harold

**Hark! The Harold Agents Sing**

Liberate your agents, work from the couch.

Harold is an agent ACP proxy and the slickest Android agent app experience. Run Harold alongside your agents, wherever they are, whatever they are, and talk to them with the Harold app.

### The Harold Experience

https://github.com/user-attachments/assets/d9eac0bd-94e9-4bd4-aeb6-fe6a8f76538e

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

Harold serves every interface by default, so a phone on the same network can
reach it without extra setup:

```bash
harold start
harold pair    # lists remembered endpoints and this machine's addresses, prints the QR code
```

`harold pair` remembers the endpoints you use. On an interactive terminal it
lists those first, most recently used first with that entry preselected,
followed by every address on this machine a phone could dial, labelled with
where it came from (history source or interface name). Picking an endpoint
that does not answer `GET /v1/status` explains why and reopens the list, and
there is always an option to enter a custom URL. The output carries both
pairing paths: the terminal QR and the endpoint plus code for manual entry.
Pass `--url` to skip the endpoint prompt.

Plain HTTP sends the device credential and session traffic in cleartext. Use it
only on a network you trust. For public access, use HTTPS through Tailscale, a
reverse proxy, or a tunnel, and pair with `harold pair --url https://your-endpoint`.

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
  setup [options]    configure agents, a workspace, and pairing
  status             show Harold status summary and live daemon state
  stop               stop the running Harold daemon
  agent              list, enable, disable, and probe agents
  pair [options]     pair a device with a QR code or a manual code
  device             manage paired devices
  workspace          open, clone, list, and remove workspace folders
  logs [options]     tail the Harold daemon log
```

### Workspaces

A workspace is a bookmark to a project folder on the Harold host. It is not a
sandbox and not a storage location. Any existing readable folder works, and
sessions still start in any `cwd` you choose.

```bash
harold workspace add ~/sites/harold          # already registered is not an error
harold workspace clone git@github.com:acme/widgets.git --into ~/sites
harold workspace list
harold workspace remove harold
```

`workspace add` finds or creates by canonical path. `workspace clone` creates a
new folder under `--into`, clones with the host's git setup, then registers it.
Use `--folder-name` to pick a different folder name and `--name` for the display
name. Removing a workspace deletes only the bookmark; the folder stays.

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

The Harold API serves every interface on port `3847`. Every route except `GET /v1/status` and the pairing claim requires a device credential (`Authorization: Bearer`). Pair a device with `harold pair` to get one.

## Configuration

| Variable          | Default     | Meaning                              |
| ----------------- | ----------- | ------------------------------------ |
| `HAROLD_PORT`     | `3847`      | Device API port                      |
| `HAROLD_DATA_DIR` | `~/.harold` | Database, logs, and runtime settings |

The bind address is not configurable: the daemon always serves every interface so a phone on the network can pair.
