#!/bin/sh
# One idempotent host entry point for a persistent ACP agent.
#
# The app sends this file inline in the SSH exec command, so nothing is
# installed on the host. The same file runs in six roles:
#
#   connect  Start the detached host if needed, then attach this SSH channel.
#   host     Own the agent's stdin FIFO and stdout log, detached from SSH.
#   stop     Stop the host and its agent.
#   logs     List every run for every agent.
#   cleanup  Delete whole inactive run directories.
#   usage    Print ACP usage updates without reading whole logs into memory.
#
# Usage:
#   harold-agent.sh connect <agent-id> <shell-command> [offset]
#   harold-agent.sh host <agent-id> <shell-command>
#   harold-agent.sh stop <agent-id>
#   harold-agent.sh logs
#   harold-agent.sh cleanup [all-inactive]
#   harold-agent.sh usage <agent-id> [latest [run-id] [offset]]
#
# offset is a byte position in the active run's out.jsonl:
#   0   replay the whole log
#   N   replay from byte N
#   -1  follow only new output (the initialize response is still replayed)
#
# State, under ${HAROLD_RUN_DIR:-$HOME/.harold/run}/<agent-id>:
#   logs/active            active run id, written atomically
#   logs/<run-id>/out.jsonl agent stdout, one ACP JSON-RPC message per line
#   logs/<run-id>/err.log   agent stderr
#   in        FIFO, agent stdin
#   ready     present once the host initialize response is in the active run
#   status    why the host exited
#   host.pid  detached host process
#   agent.pid agent process
#   host.lock held for the host lifetime
#   in.lock   serializes complete input lines from every client
#
# A host start creates a new run directory. Previous runs are never truncated,
# reopened, or renamed. Deleting a run is `rm -rf` of one directory.

set -u

mode=${1:-}
agent_id=${2:-}
command=${3:-}
offset=${4:-0}

case "$mode" in
    connect|host|stop)
        if [ -z "$agent_id" ]; then
            echo "harold-agent: missing agent id" >&2
            exit 2
        fi
        ;;
    logs) ;;
    cleanup) ;;
    usage) ;;
    *)
        echo "usage: harold-agent.sh <connect|host|stop|logs|cleanup|usage> <agent-id> [command] [offset]" >&2
        exit 2
        ;;
esac

base=${HAROLD_RUN_DIR:-$HOME/.harold/run}
dir=$base/$agent_id
logs=$dir/logs
active_file=$logs/active
fifo=$dir/in
lock=$dir/in.lock
host_pid_file=$dir/host.pid
agent_pid_file=$dir/agent.pid
ready=$dir/ready
status=$dir/status

valid_run_id() {
    _valid_id=${1:-}
    [ -n "$_valid_id" ] || return 1
    case "$_valid_id" in
        */*|*' '*) return 1 ;;
    esac
    # UTC start timestamp plus the host pid, for example 20261117T142530Z-12345.
    case "$_valid_id" in
        [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z-*) ;;
        *) return 1 ;;
    esac
    _valid_pid=${_valid_id##*-}
    [ -n "$_valid_pid" ] || return 1
    case "$_valid_pid" in
        *[!0-9]*) return 1 ;;
    esac
    return 0
}

active_run_id() {
    [ -f "$active_file" ] || return 1
    _active_id=$(cat "$active_file" 2>/dev/null) || return 1
    valid_run_id "$_active_id" || return 1
    printf '%s' "$_active_id"
}

newest_run_id() {
    [ -d "$logs" ] || return 1
    _newest_id=$(
        for _candidate_dir in "$logs"/*; do
            [ -d "$_candidate_dir" ] || continue
            _candidate=${_candidate_dir##*/}
            valid_run_id "$_candidate" || continue
            printf '%s\n' "$_candidate"
        done | sort | tail -n 1
    )
    valid_run_id "${_newest_id:-}" || return 1
    printf '%s' "$_newest_id"
}

run_out() {
    printf '%s/%s/out.jsonl' "$logs" "$1"
}

run_err() {
    printf '%s/%s/err.log' "$logs" "$1"
}

host_running() {
    [ -f "$host_pid_file" ] || return 1
    pid=$(cat "$host_pid_file" 2>/dev/null) || return 1
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

host_alive() {
    host_running || return 1
    [ -f "$ready" ] || return 1
    _alive_run=$(active_run_id) || return 1
    [ -d "$logs/$_alive_run" ] || return 1
}

print_last_error() {
    _error_file=
    if _error_run=$(active_run_id); then
        _error_file=$(run_err "$_error_run")
    elif _error_run=$(newest_run_id); then
        _error_file=$(run_err "$_error_run")
    fi
    if [ -n "$_error_file" ] && [ -s "$_error_file" ]; then
        tail -n 20 "$_error_file" >&2
    fi
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
    print_last_error
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

    run_id=$(date -u +%Y%m%dT%H%M%SZ)-$$
    run_dir=$logs/$run_id
    out=$(run_out "$run_id")
    err=$(run_err "$run_id")
    active_tmp=$logs/.active.$$

    mkdir -p "$logs" || exit 1
    chmod 700 "$logs" 2>/dev/null || true
    mkdir -p "$run_dir" || exit 1
    chmod 700 "$run_dir" 2>/dev/null || true
    : > "$out" || exit 1
    : > "$err" || exit 1
    chmod 600 "$out" "$err" 2>/dev/null || true

    # `active` is the only pointer to the live run. Write it before the agent
    # starts so a reconnect can always find this process's logs.
    printf '%s\n' "$run_id" > "$active_tmp" || exit 1
    mv "$active_tmp" "$active_file" || exit 1

    agent_pid=
    holder_pid=
    init_writer_pid=

    cleanup() {
        code=$?
        trap - EXIT
        rm -f "$ready"
        if [ -n "${active_tmp:-}" ]; then
            rm -f "$active_tmp"
        fi
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
        print_last_error
        exit 1
    fi

    host_pid=$(cat "$host_pid_file")
    run_id=$(active_run_id)
    out=$(run_out "$run_id")
    err=$(run_err "$run_id")

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

list_logs() {
    [ -d "$base" ] || return 0
    for _agent_dir in "$base"/*; do
        [ -d "$_agent_dir" ] || continue
        _agent=${_agent_dir##*/}
        _agent_logs=$_agent_dir/logs
        [ -d "$_agent_logs" ] || continue

        dir=$_agent_dir
        logs=$_agent_logs
        active_file=$logs/active
        host_pid_file=$dir/host.pid
        ready=$dir/ready

        _listed_active=$(active_run_id 2>/dev/null) || _listed_active=
        if host_alive; then
            _listed_running=1
        else
            _listed_running=0
        fi

        for _run_dir in "$logs"/*; do
            [ -d "$_run_dir" ] || continue
            _run=${_run_dir##*/}
            valid_run_id "$_run" || continue
            _out=$_run_dir/out.jsonl
            _err=$_run_dir/err.log
            _out_bytes=0
            if [ -f "$_out" ]; then
                _out_bytes=$(wc -c < "$_out" | tr -d '[:space:]')
            fi
            _err_bytes=0
            if [ -f "$_err" ]; then
                _err_bytes=$(wc -c < "$_err" | tr -d '[:space:]')
            fi
            _is_active=0
            if [ -n "$_listed_active" ] && [ "$_run" = "$_listed_active" ]; then
                _is_active=1
            fi
            printf 'run\t%s\t%s\t%s\t%s\t%s\t%s\n' \
                "$_agent" "$_run" "$_out_bytes" "$_err_bytes" "$_is_active" "$_listed_running"
        done
    done
}

cleanup_logs() {
    _policy=${1:-all-inactive}
    case "$_policy" in
        all-inactive) ;;
        *)
            echo "harold-agent: unknown cleanup policy: $_policy" >&2
            return 2
            ;;
    esac

    _deleted_runs=0
    _removed_bytes=0
    if [ -d "$base" ]; then
        for _agent_dir in "$base"/*; do
            [ -d "$_agent_dir" ] || continue
            _agent_logs=$_agent_dir/logs
            [ -d "$_agent_logs" ] || continue

            logs=$_agent_logs
            active_file=$logs/active
            _cleanup_active=$(active_run_id 2>/dev/null) || _cleanup_active=
            _cleanup_newest=$(newest_run_id 2>/dev/null) || _cleanup_newest=

            for _run_dir in "$logs"/*; do
                [ -d "$_run_dir" ] || continue
                _run=${_run_dir##*/}
                valid_run_id "$_run" || continue

                # Never delete the live run, and never delete the newest run
                # (a crash may leave it unmarked while it is still starting).
                if [ -n "$_cleanup_active" ] && [ "$_run" = "$_cleanup_active" ]; then
                    continue
                fi
                if [ -n "$_cleanup_newest" ] && [ "$_run" = "$_cleanup_newest" ]; then
                    continue
                fi

                _run_bytes=0
                for _file in "$_run_dir"/*; do
                    [ -f "$_file" ] || continue
                    _file_bytes=$(wc -c < "$_file" | tr -d '[:space:]')
                    _run_bytes=$((_run_bytes + _file_bytes))
                done

                if rm -rf "$_run_dir"; then
                    _deleted_runs=$((_deleted_runs + 1))
                    _removed_bytes=$((_removed_bytes + _run_bytes))
                fi
            done
        done
    fi

    printf 'cleanup\t%s\t%s\n' "$_deleted_runs" "$_removed_bytes"
}

scan_usage_run() {
    _sur_agent=$1
    _sur_run=$2
    _sur_offset=$3
    _sur_out=$logs/$_sur_run/out.jsonl
    [ -f "$_sur_out" ] || return 0

    _sur_size=$(wc -c < "$_sur_out" | tr -d '[:space:]')
    case "$_sur_size" in
        ''|*[!0-9]*) return 0 ;;
    esac

    case "$_sur_offset" in
        ''|*[!0-9]*) _sur_offset=0 ;;
    esac
    if [ "$_sur_offset" -gt "$_sur_size" ]; then
        _sur_offset=0
    fi

    _sur_len=$((_sur_size - _sur_offset))
    if [ "$_sur_len" -gt 0 ]; then
        # Read only the new byte range. head stops at the size sampled above,
        # so bytes appended during the scan stay for the next call. awk keeps
        # one line, not the file, and holds the last line back until it knows
        # the line ended with a newline.
        tail -c +$((_sur_offset + 1)) "$_sur_out" \
            | head -c "$_sur_len" \
            | LC_ALL=C awk -v agent="$_sur_agent" -v run="$_sur_run" \
                -v base="$_sur_offset" -v size="$_sur_len" '
                function emit(line, start) {
                    if (line !~ /"method"[[:space:]]*:[[:space:]]*"session\/update"/) return
                    if (line !~ /"sessionUpdate"[[:space:]]*:[[:space:]]*"usage_update"/) return
                    printf "usage\t%s\t%s\t%d\t%s\n", agent, run, start + base, line
                }
                BEGIN { total = 0; have = 0 }
                {
                    if (have) emit(prev, prev_start)
                    prev = $0
                    prev_start = total
                    total += length($0) + 1
                    have = 1
                }
                END {
                    if (have) {
                        if (total <= size) {
                            emit(prev, prev_start)
                            safe = base + total
                        } else {
                            # The trailing line has no newline yet. Resume at
                            # its start so the next call reads it whole.
                            safe = base + prev_start
                        }
                    } else {
                        safe = base
                    }
                    printf "end\t%s\t%s\t%d\n", agent, run, safe
                }
            '
    else
        printf 'end\t%s\t%s\t%d\n' "$_sur_agent" "$_sur_run" "$_sur_offset"
    fi
}

list_usage() {
    _usage_agent=${1:-}
    _usage_mode=${2:-full}
    _usage_known_run=${3:-}
    _usage_known_offset=${4:-0}

    if [ -z "$_usage_agent" ]; then
        echo "harold-agent: usage needs an agent id" >&2
        return 2
    fi
    case "$_usage_agent" in
        */*|*' '*) echo "harold-agent: invalid agent id: $_usage_agent" >&2; return 2 ;;
    esac

    _usage_logs=$base/$_usage_agent/logs
    if [ ! -d "$_usage_logs" ]; then
        [ "$_usage_mode" = "latest" ] || printf 'done\t%s\n' "$_usage_agent"
        return 0
    fi

    logs=$_usage_logs
    active_file=$logs/active

    case "$_usage_mode" in
        latest)
            _usage_run=$(newest_run_id 2>/dev/null) || return 0
            if [ "$_usage_known_run" != "$_usage_run" ]; then
                _usage_known_offset=0
            fi
            scan_usage_run "$_usage_agent" "$_usage_run" "$_usage_known_offset"
            ;;
        full|'')
            for _usage_run_dir in "$_usage_logs"/*; do
                [ -d "$_usage_run_dir" ] || continue
                _usage_run=${_usage_run_dir##*/}
                valid_run_id "$_usage_run" || continue
                scan_usage_run "$_usage_agent" "$_usage_run" 0
            done
            printf 'done\t%s\n' "$_usage_agent"
            ;;
        *)
            echo "harold-agent: unknown usage mode: $_usage_mode" >&2
            return 2
            ;;
    esac
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
    logs)
        list_logs
        ;;
    cleanup)
        cleanup_logs "${2:-all-inactive}"
        ;;
    usage)
        list_usage "${2:-}" "${3:-full}" "${4:-}" "${5:-0}"
        ;;
esac
