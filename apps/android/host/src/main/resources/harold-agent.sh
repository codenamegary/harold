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
#   harold-agent.sh connect <agent-id> <shell-command> [offset] [client-id]
#   harold-agent.sh host <agent-id> <shell-command>
#   harold-agent.sh stop <agent-id>
#   harold-agent.sh logs
#   harold-agent.sh cleanup [all-inactive]
#   harold-agent.sh usage <agent-id> [latest [run-id] [offset]]
#
# client-id identifies the app process. The host gives each ACP session one
# owner client and routes agent-to-client requests only to that owner. A
# client that cannot answer drops the request instead of replying with an
# error. Pending requests stay on disk until the owner answers, so a
# reconnect can replay them.
#
# offset is a byte position in the active run's out.jsonl:
#   0   replay the whole log
#   N   replay from byte N
#   -1  follow only new output (the initialize response is still replayed)
#
# State, under ${HAROLD_RUN_DIR:-$HOME/.harold/run}/<agent-id>:
#   logs/active            active run id, written atomically
#   logs/<run-id>/out.jsonl agent output, one ACP message per line
#   logs/<run-id>/err.log   agent stderr
#   in        FIFO, client input (client-id<TAB>JSON when protocol is 2)
#   agent.in  FIFO, agent stdin
#   out.pipe  FIFO, agent stdout to the router
#   clients/<client>/route.jsonl  requests owned by that attached client
#   owners/<session-key>   owner client for one ACP session
#   pending/<session-key>/<request-id>  unanswered client requests
#   pending/by-id/<request-id>          owner and session for one request
#   newreq/<request-id>    client waiting for a session/new response
#   last-owner             most recently active owner client
#   protocol  host protocol version, 2 when request routing is available
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
client_id=${5:-}

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
        echo "usage: harold-agent.sh <connect|host|stop|logs|cleanup|usage> <agent-id> [command] [offset] [client-id]" >&2
        exit 2
        ;;
esac

base=${HAROLD_RUN_DIR:-$HOME/.harold/run}
dir=$base/$agent_id
logs=$dir/logs
active_file=$logs/active
fifo=$dir/in
agent_fifo=$dir/agent.in
out_pipe=$dir/out.pipe
lock=$dir/in.lock
host_pid_file=$dir/host.pid
agent_pid_file=$dir/agent.pid
ready=$dir/ready
status=$dir/status
protocol_file=$dir/protocol
clients_dir=$dir/clients
owners_dir=$dir/owners
pending_dir=$dir/pending
pending_by_id=$dir/pending/by-id
new_request_dir=$dir/newreq
last_owner_file=$dir/last-owner
tab=$(printf '\t')
sep=$(printf '\037')

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

safe_name() {
    printf '%s' "${1:-}" | sed 's/[^A-Za-z0-9_.-]/_/g'
}

# Extracts the routing fields from one JSON-RPC line. Mode `input` keeps the
# method position for every client message. Mode `request` emits only for an
# agent-to-client request. Mode `response` emits only for an agent response.
# Only a top-level id makes a message a request: the method key appears before
# params in ACP messages, so a nested id after it is ignored.
parse_fields() {
    printf '%s\n' "${2:-}" | awk -v mode="$1" -v sep="$sep" '
        function value(line, name,   p, rest, i, n, parts) {
            p = index(line, "\"" name "\"")
            if (p == 0) return ""
            rest = substr(line, p + length(name) + 2)
            sub(/^[ \t]*:[ \t]*/, "", rest)
            if (substr(rest, 1, 1) == "\"") {
                rest = substr(rest, 2)
                i = index(rest, "\"")
                if (i == 0) return ""
                return substr(rest, 1, i - 1)
            }
            n = split(rest, parts, /[,} \t\r\n]/)
            return parts[1]
        }
        {
            if (mode == "response") {
                if (index($0, "\"method\"") != 0) exit
                printf "%s%s%s\n", value($0, "id"), sep, value($0, "sessionId")
                exit
            }
            mpos = index($0, "\"method\"")
            ipos = index($0, "\"id\"")
            if (mode == "input") {
                if (mpos == 0) {
                    printf "%s%s%s%s%s\n", "", sep, value($0, "id"), sep, value($0, "sessionId")
                    exit
                }
                if (ipos == 0 || ipos > mpos) {
                    printf "%s%s%s%s\n", value($0, "method"), sep, "", sep
                    exit
                }
                printf "%s%s%s%s%s\n", value($0, "method"), sep, value($0, "id"), sep, value($0, "sessionId")
                exit
            }
            if (mpos == 0 || ipos == 0 || ipos > mpos) exit
            method = value($0, "method")
            id = value($0, "id")
            if (method == "" || id == "") exit
            printf "%s%s%s%s%s\n", method, sep, id, sep, value($0, "sessionId")
        }
    '
}

# Makes client the owner of session and replays every unanswered request.
set_owner() {
    _so_client=$1
    _so_session=$2
    _so_key=$(safe_name "$_so_session")
    [ -n "$_so_key" ] || return 0
    printf '%s\n' "$_so_client" > "$owners_dir/$_so_key"
    printf '%s\n' "$_so_client" > "$last_owner_file"
    flush_pending "$_so_client" "$_so_key"
}

# Replays stored requests to an attached owner. The pending files stay until
# the owner actually answers, so a client that dies mid-question can reconnect
# and see it again.
flush_pending() {
    _fp_client=$1
    _fp_key=$2
    [ -d "$pending_dir/$_fp_key" ] || return 0
    [ -d "$clients_dir/$_fp_client" ] || return 0
    for _fp_file in "$pending_dir/$_fp_key"/*; do
        [ -f "$_fp_file" ] || continue
        _fp_req=${_fp_file##*/}
        cat "$_fp_file" >> "$clients_dir/$_fp_client/route.jsonl" || continue
        printf '%s\037%s\037%s\n' "$_fp_client" "$_fp_key" "$_fp_req" \
            > "$pending_by_id/$_fp_req"
    done
}

# Indexes one answer with the client that owns the request.
accept_client_response() {
    _ac_client=$1
    _ac_id=$2
    _ac_key=$(safe_name "$_ac_id")
    [ -f "$pending_by_id/$_ac_key" ] || return 0
    _ac_index=$(cat "$pending_by_id/$_ac_key" 2>/dev/null) || return 0
    _ac_owner=${_ac_index%%"$sep"*}
    [ -z "$_ac_owner" ] || [ "$_ac_owner" = "$_ac_client" ]
}

clear_pending_response() {
    _cr_key=$(safe_name "$1")
    [ -f "$pending_by_id/$_cr_key" ] || return 0
    _cr_index=$(cat "$pending_by_id/$_cr_key" 2>/dev/null) || return 0
    _cr_rest=${_cr_index#*"$sep"}
    _cr_session=${_cr_rest%%"$sep"*}
    _cr_request=${_cr_rest#*"$sep"}
    rm -f "$pending_by_id/$_cr_key"
    [ -n "$_cr_session" ] && [ -n "$_cr_request" ] || return 0
    rm -f "$pending_dir/$_cr_session/$_cr_request"
}

# Records the owner of a session created by session/new. The response id is the
# only link between the creating client and the agent's new session id.
record_new_session() {
    _rn_id=$1
    _rn_session=$2
    _rn_key=$(safe_name "$_rn_id")
    [ -f "$new_request_dir/$_rn_key" ] || return 0
    _rn_owner=$(cat "$new_request_dir/$_rn_key" 2>/dev/null) || _rn_owner=
    rm -f "$new_request_dir/$_rn_key"
    [ -n "$_rn_owner" ] || return 0
    [ -n "$_rn_session" ] || return 0
    _rn_key=$(safe_name "$_rn_session")
    [ -n "$_rn_key" ] || return 0
    printf '%s\n' "$_rn_owner" > "$owners_dir/$_rn_key"
    printf '%s\n' "$_rn_owner" > "$last_owner_file"
}

# Stores an agent-to-client request and sends it to its owner when connected.
handle_agent_request() {
    _hr_method=$1
    _hr_id=$2
    _hr_session=$3
    _hr_line=$4
    _hr_key=$(safe_name "$_hr_id")
    [ -n "$_hr_key" ] || return 0
    _hr_skey=$(safe_name "$_hr_session")
    if [ -n "$_hr_skey" ]; then
        _hr_owner=$(cat "$owners_dir/$_hr_skey" 2>/dev/null) || _hr_owner=
        mkdir -p "$pending_dir/$_hr_skey"
        printf '%s\n' "$_hr_line" > "$pending_dir/$_hr_skey/$_hr_key"
        printf '%s\037%s\037%s\n' "$_hr_owner" "$_hr_skey" "$_hr_key" \
            > "$pending_by_id/$_hr_key"
        if [ -n "$_hr_owner" ] && [ -d "$clients_dir/$_hr_owner" ]; then
            printf '%s\n' "$_hr_line" >> "$clients_dir/$_hr_owner/route.jsonl"
        fi
        return 0
    fi

    # A request without a session belongs to whoever is active right now.
    _hr_owner=$(cat "$last_owner_file" 2>/dev/null) || _hr_owner=
    mkdir -p "$pending_dir/global"
    printf '%s\n' "$_hr_line" > "$pending_dir/global/$_hr_key"
    printf '%s\037global\037%s\n' "$_hr_owner" "$_hr_key" > "$pending_by_id/$_hr_key"
    if [ -n "$_hr_owner" ] && [ -d "$clients_dir/$_hr_owner" ]; then
        printf '%s\n' "$_hr_line" >> "$clients_dir/$_hr_owner/route.jsonl"
    fi
}

# Fills in session ownership from client input. The host is the only writer of
# agent stdin, so it can route by owner and drop answers from other clients.
read_client_input() {
    while IFS= read -r raw; do
        [ -z "$raw" ] && continue
        case "$raw" in
            *"$tab"*)
                _rc_client=${raw%%"$tab"*}
                _rc_line=${raw#*"$tab"}
                ;;
            *)
                _rc_client=legacy
                _rc_line=$raw
                ;;
        esac
        [ -n "$_rc_client" ] || _rc_client=legacy
        _rc_fields=$(parse_fields input "$_rc_line")
        IFS=$sep
        set -- $_rc_fields
        IFS=$tab
        _rc_method=${1:-}
        _rc_id=${2:-}
        _rc_session=${3:-}
        IFS=' '
        case "$_rc_method" in
            session/new)
                if [ -n "$_rc_id" ]; then
                    _rc_key=$(safe_name "$_rc_id")
                    [ -n "$_rc_key" ] &&
                        printf '%s\n' "$_rc_client" > "$new_request_dir/$_rc_key"
                fi
                ;;
            session/load|session/resume|session/prompt)
                if [ -n "$_rc_session" ]; then
                    set_owner "$_rc_client" "$_rc_session"
                fi
                ;;
            '')
                if [ -n "$_rc_id" ] && ! accept_client_response "$_rc_client" "$_rc_id"; then
                    continue
                fi
                ;;
        esac
        printf '%s\n' "$_rc_line" > "$agent_fifo" || continue
        if [ "$_rc_method" = "" ] && [ -n "$_rc_id" ]; then
            clear_pending_response "$_rc_id"
        fi
    done
}

# Copies agent output to out.jsonl and diverts agent-to-client requests to the
# owner's route file. A request never enters the shared log, so no other client
# can answer it.
route_agent_output() {
    while IFS= read -r _ra_line; do
        [ -z "$_ra_line" ] && continue
        case "$_ra_line" in
            *'"method"'*)
                _ra_prefix=${_ra_line%%\"method\"*}
                case "$_ra_prefix" in
                    *'"id"'*)
                        _ra_fields=$(parse_fields request "$_ra_line")
                        if [ -n "$_ra_fields" ]; then
                            IFS=$sep
                            set -- $_ra_fields
                            IFS=' '
                            handle_agent_request "${1:-}" "${2:-}" "${3:-}" "$_ra_line"
                            continue
                        fi
                        ;;
                esac
                printf '%s\n' "$_ra_line" >> "$out"
                ;;
            *'"id"'*)
                _ra_fields=$(parse_fields response "$_ra_line")
                IFS=$sep
                set -- $_ra_fields
                IFS=' '
                printf '%s\n' "$_ra_line" >> "$out"
                record_new_session "${1:-}" "${2:-}"
                ;;
            *)
                printf '%s\n' "$_ra_line" >> "$out"
                ;;
        esac
    done
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
    rm -f "$ready" "$status" "$fifo" "$agent_fifo" "$out_pipe" "$protocol_file"
    rm -rf "$clients_dir" "$owners_dir" "$pending_dir" "$new_request_dir"
    rm -f "$last_owner_file"

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

    mkdir -p "$clients_dir" "$owners_dir" "$pending_by_id" "$new_request_dir" || exit 1
    chmod 700 "$clients_dir" "$owners_dir" "$pending_dir" "$new_request_dir" 2>/dev/null || true
    printf '2\n' > "$protocol_file" || exit 1

    # `active` is the only pointer to the live run. Write it before the agent
    # starts so a reconnect can always find this process's logs.
    printf '%s\n' "$run_id" > "$active_tmp" || exit 1
    mv "$active_tmp" "$active_file" || exit 1

    agent_pid=
    holder_pid=
    client_holder_pid=
    input_pid=
    router_pid=
    init_writer_pid=

    cleanup() {
        code=$?
        trap - EXIT
        rm -f "$ready" "$protocol_file"
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
        for _cleanup_pid in "${router_pid:-}" "${input_pid:-}" \
            "${client_holder_pid:-}" "${holder_pid:-}"; do
            if [ -n "$_cleanup_pid" ] && kill -0 "$_cleanup_pid" 2>/dev/null; then
                kill "$_cleanup_pid" 2>/dev/null || true
            fi
        done
        exit "$code"
    }
    trap cleanup EXIT
    trap 'exit 143' TERM INT

    mkfifo -m 600 "$fifo" "$agent_fifo" "$out_pipe" || exit 1

    # The host is the only agent stdin writer. Client input goes through a
    # router so ownership and pending requests are known before each write.
    read_client_input < "$fifo" &
    input_pid=$!
    # A FIFO reader sees EOF when every writer closes. These holders keep one
    # writer open so both loops survive while no phone is attached.
    sleep 2147483647 > "$fifo" 8>&- &
    client_holder_pid=$!
    sleep 2147483647 > "$agent_fifo" 8>&- &
    holder_pid=$!

    route_agent_output < "$out_pipe" &
    router_pid=$!

    # The agent's stdio belongs to this detached process, not to sshd.
    bash -lc "$command" < "$agent_fifo" > "$out_pipe" 2>> "$err" 8>&- &
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
    ( printf '%s\n' "$init" > "$agent_fifo" ) 8>&- &
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

    protocol_version=$(cat "$protocol_file" 2>/dev/null) || protocol_version=
    attach_id=$(safe_name "$client_id")
    [ -n "$attach_id" ] || attach_id=client
    attach_id="${attach_id}-$$"
    client_dir=

    case "$offset" in
        -1)
            offset=$(wc -c < "$out")
            ;;
        ''|*[!0-9]*)
            offset=0
            ;;
    esac

    # Protocol 2 routes agent-to-client requests per client. An older host
    # keeps the shared fan-out and the app falls back to dropping requests it
    # cannot answer.
    if [ "$protocol_version" = "2" ]; then
        client_dir=$clients_dir/$attach_id
        mkdir -p "$client_dir" || exit 1
        : > "$client_dir/route.jsonl" || exit 1
        tail -c +1 -f "$client_dir/route.jsonl" &
        route_tail_pid=$!
    else
        route_tail_pid=
    fi

    # A reconnecting client starts at a byte offset, which would skip the
    # initialize response. Replay that one line first so every client has it.
    if [ "$offset" -gt 0 ]; then
        grep -m1 'harold-host-init' "$out" 2>/dev/null || true
    fi

    # stdout: replay from the byte offset, then follow the append-only log.
    # Every client also gets its own owner-routed request stream.
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
        if [ -n "${route_tail_pid:-}" ] && kill -0 "$route_tail_pid" 2>/dev/null; then
            kill "$route_tail_pid" 2>/dev/null || true
        fi
        if [ -n "${watchdog_pid:-}" ] && kill -0 "$watchdog_pid" 2>/dev/null; then
            kill "$watchdog_pid" 2>/dev/null || true
        fi
        if [ -n "${client_dir:-}" ]; then
            rm -rf "$client_dir"
        fi
        rm -f "$tmp"
        exit "$code"
    }
    trap cleanup_attach EXIT
    trap 'exit 0' TERM INT

    # stdin: read complete lines only. A client that disconnects mid-line
    # leaves no partial JSON in the FIFO. Each write is serialized so two
    # clients cannot interleave their bytes. Protocol 2 prefixes the client id
    # so the host can give every session one owner.
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        if [ -n "$client_dir" ]; then
            printf '%s\t%s\n' "$attach_id" "$line" > "$tmp" || break
        else
            printf '%s\n' "$line" > "$tmp" || break
        fi
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
