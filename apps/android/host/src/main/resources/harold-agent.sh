#!/bin/sh
# One idempotent host entry point for a persistent ACP agent.
#
# The app sends this file inline in the SSH exec command, so nothing is
# installed on the host. The same file runs in three roles:
#
#   connect  Start the detached host if needed, then attach this SSH channel.
#   host     Own the agent's stdin FIFO and stdout log, detached from SSH.
#   stop     Stop the host and its agent.
#
# Usage:
#   harold-agent.sh connect <agent-id> <shell-command> [offset]
#   harold-agent.sh host <agent-id> <shell-command>
#   harold-agent.sh stop <agent-id>
#
# offset is a byte position in the output log:
#   0   replay the whole log
#   N   replay from byte N
#   -1  follow only new output (the initialize response is still replayed)
#
# State, under ${HAROLD_RUN_DIR:-$HOME/.harold/run}/<agent-id>:
#   in        FIFO, agent stdin
#   out       append-only agent stdout log
#   err       agent stderr
#   ready     present once the host initialize response is in out
#   status    why the host exited
#   host.pid  detached host process
#   agent.pid agent process
#   host.lock held for the host lifetime
#   in.lock   serializes complete input lines from every client

set -u

mode=${1:-}
agent_id=${2:-}
command=${3:-}
offset=${4:-0}

case "$mode" in
    connect|host|stop) ;;
    *)
        echo "usage: harold-agent.sh <connect|host|stop> <agent-id> [command] [offset]" >&2
        exit 2
        ;;
esac

if [ -z "$agent_id" ]; then
    echo "harold-agent: missing agent id" >&2
    exit 2
fi

base=${HAROLD_RUN_DIR:-$HOME/.harold/run}
dir=$base/$agent_id
out=$dir/out
err=$dir/err
fifo=$dir/in
lock=$dir/in.lock
host_pid_file=$dir/host.pid
agent_pid_file=$dir/agent.pid
ready=$dir/ready
status=$dir/status

host_running() {
    [ -f "$host_pid_file" ] || return 1
    pid=$(cat "$host_pid_file" 2>/dev/null) || return 1
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

host_alive() {
    host_running && [ -f "$ready" ]
}

self_start() {
    if [ -n "${HAROLD_AGENT_SCRIPT:-}" ]; then
        nohup sh -c "$HAROLD_AGENT_SCRIPT" harold-agent host "$agent_id" "$command" \
            9>&- </dev/null >/dev/null 2>&1 &
    else
        nohup sh "$0" host "$agent_id" "$command" \
            9>&- </dev/null >/dev/null 2>&1 &
    fi
}

wait_for_ready() {
    n=0
    while [ "$n" -lt 300 ]; do
        if host_alive; then
            return 0
        fi
        if [ -f "$status" ]; then
            return 1
        fi
        if [ -f "$host_pid_file" ] && ! host_running; then
            return 1
        fi
        sleep 0.1
        n=$((n + 1))
    done
    return 1
}

start_host() {
    umask 077
    mkdir -p "$dir" || return 1

    # Serialize first connects so two clients cannot both reset the state of a
    # host that is still starting. The host's own lock is held for its lifetime.
    exec 9>"$dir/start.lock"
    if command -v flock >/dev/null 2>&1; then
        flock 9
    fi

    if host_alive; then
        exec 9>&-
        return 0
    fi

    if host_running; then
        # Another client started the host and it is still initializing.
        if wait_for_ready; then
            exec 9>&-
            return 0
        fi
    else
        rm -f "$ready" "$status"
        self_start
        if wait_for_ready; then
            exec 9>&-
            return 0
        fi
    fi

    exec 9>&-
    echo "agent $agent_id did not start" >&2
    if [ -f "$status" ]; then
        echo "  $(cat "$status")" >&2
    fi
    if [ -s "$err" ]; then
        tail -n 20 "$err" >&2
    fi
    return 1
}

run_host() {
    if [ -z "$command" ]; then
        echo "harold-agent: missing command for host" >&2
        exit 2
    fi

    umask 077
    mkdir -p "$dir" || exit 1

    # A second host for this agent exits instead of racing the first.
    exec 8>"$dir/host.lock"
    if command -v flock >/dev/null 2>&1; then
        if ! flock -n 8; then
            exit 0
        fi
    fi

    echo $$ > "$host_pid_file"
    rm -f "$ready" "$status" "$fifo"

    agent_pid=
    holder_pid=
    init_writer_pid=

    cleanup() {
        code=$?
        trap - EXIT
        rm -f "$ready"
        if [ -n "${init_writer_pid:-}" ] && kill -0 "$init_writer_pid" 2>/dev/null; then
            kill "$init_writer_pid" 2>/dev/null || true
        fi
        if [ -n "${agent_pid:-}" ] && kill -0 "$agent_pid" 2>/dev/null; then
            kill "$agent_pid" 2>/dev/null || true
            wait "$agent_pid" 2>/dev/null || true
        fi
        if [ -n "${holder_pid:-}" ] && kill -0 "$holder_pid" 2>/dev/null; then
            kill "$holder_pid" 2>/dev/null || true
        fi
        exit "$code"
    }
    trap cleanup EXIT
    trap 'exit 143' TERM INT

    mkfifo -m 600 "$fifo" || exit 1
    : > "$out"
    : > "$err"

    # A FIFO reader sees EOF when every writer closes. This holder keeps one
    # writer open so the agent survives while no phone is attached.
    sleep 2147483647 > "$fifo" 8>&- &
    holder_pid=$!

    # The agent's stdio belongs to this detached process, not to sshd.
    bash -lc "$command" < "$fifo" >> "$out" 2>> "$err" 8>&- &
    agent_pid=$!
    echo "$agent_pid" > "$agent_pid_file"

    # The host owns the one initialize handshake. Every client replays this
    # response instead of initializing the agent again.
    if [ "$agent_id" = "cursor" ]; then
        meta=',"_meta":{"parameterizedModelPicker":true}'
    else
        meta=
    fi
    init='{"jsonrpc":"2.0","id":"harold-host-init","method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true},"terminal":true,"elicitation":{"form":{}}'"$meta"'},"clientInfo":{"name":"Harold Android","version":"android"}}}'
    ( printf '%s\n' "$init" > "$fifo" ) 8>&- &
    init_writer_pid=$!

    n=0
    while [ "$n" -lt 300 ]; do
        if grep -q 'harold-host-init' "$out" 2>/dev/null; then
            : > "$ready"
            break
        fi
        if ! kill -0 "$agent_pid" 2>/dev/null; then
            echo "agent exited before initialize" > "$status"
            exit 1
        fi
        sleep 0.1
        n=$((n + 1))
    done

    if [ ! -f "$ready" ]; then
        echo "timed out waiting for initialize" > "$status"
        exit 1
    fi

    wait "$agent_pid"
    code=$?
    echo "$code" > "$status"
    exit "$code"
}

stop_host() {
    if [ -f "$host_pid_file" ]; then
        pid=$(cat "$host_pid_file" 2>/dev/null) || pid=
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            n=0
            while kill -0 "$pid" 2>/dev/null && [ "$n" -lt 100 ]; do
                sleep 0.1
                n=$((n + 1))
            done
            kill -9 "$pid" 2>/dev/null || true
        fi
    fi

    if [ -f "$agent_pid_file" ]; then
        pid=$(cat "$agent_pid_file" 2>/dev/null) || pid=
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    fi

    rm -f "$ready" "$host_pid_file" "$agent_pid_file"
}

attach() {
    if ! host_alive; then
        echo "agent $agent_id is not running" >&2
        if [ -f "$status" ]; then
            echo "  $(cat "$status")" >&2
        fi
        if [ -s "$err" ]; then
            tail -n 20 "$err" >&2
        fi
        exit 1
    fi

    host_pid=$(cat "$host_pid_file")

    case "$offset" in
        -1)
            offset=$(wc -c < "$out")
            ;;
        ''|*[!0-9]*)
            offset=0
            ;;
    esac

    # A reconnecting client starts at a byte offset, which would skip the
    # initialize response. Replay that one line first so every client has it.
    if [ "$offset" -gt 0 ]; then
        grep -m1 'harold-host-init' "$out" 2>/dev/null || true
    fi

    # stdout: replay from the byte offset, then follow the append-only log.
    # This is the fan-out. Every client reads the same file.
    tail -c +$((offset + 1)) -f "$out" &
    tail_pid=$!

    # Exit the bridge when the host exits so the app sees a closed channel and
    # can start a replacement instead of waiting on a dead tail.
    parent_pid=$$
    (
        while kill -0 "$host_pid" 2>/dev/null && [ -f "$ready" ]; do
            sleep 1
        done
        kill -TERM "$parent_pid" 2>/dev/null || true
    ) &
    watchdog_pid=$!

    tmp=$dir/.in.$$
    : > "$tmp"

    cleanup_attach() {
        code=$?
        trap - EXIT
        if [ -n "${tail_pid:-}" ] && kill -0 "$tail_pid" 2>/dev/null; then
            kill "$tail_pid" 2>/dev/null || true
        fi
        if [ -n "${watchdog_pid:-}" ] && kill -0 "$watchdog_pid" 2>/dev/null; then
            kill "$watchdog_pid" 2>/dev/null || true
        fi
        rm -f "$tmp"
        exit "$code"
    }
    trap cleanup_attach EXIT
    trap 'exit 0' TERM INT

    # stdin: read complete lines only. A client that disconnects mid-line
    # leaves no partial JSON in the FIFO. Each write is serialized so two
    # clients cannot interleave their bytes.
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        printf '%s\n' "$line" > "$tmp" || break
        if ! flock "$lock" sh -c 'cat "$1" > "$2"' sh "$tmp" "$fifo"; then
            break
        fi
    done
}

case "$mode" in
    host)
        run_host
        ;;
    stop)
        stop_host
        ;;
    connect)
        start_host || exit 1
        attach
        ;;
esac
