#!/bin/sh
# Fake ACP agent for the host routing tests. One session, one pending
# client request at a time. Records every client response so a test can
# prove that only the owning client reached the agent.
set -u

state=${HAROLD_FAKE_STATE:?}
prompt_id=

while IFS= read -r line; do
    case "$line" in
        *harold-host-init*)
            printf '%s\n' '{"jsonrpc":"2.0","id":"harold-host-init","result":{"protocolVersion":1,"agentCapabilities":{"loadSession":true}}}'
            continue
            ;;
    esac

    method=$(printf '%s' "$line" | sed -n 's/.*"method":"\([^"]*\)".*/\1/p')
    id=$(printf '%s' "$line" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

    case "$method" in
        session/new)
            printf '{"jsonrpc":"2.0","id":"%s","result":{"sessionId":"ses_one","configOptions":[]}}\n' "$id"
            ;;
        session/load|session/resume)
            printf '{"jsonrpc":"2.0","id":"%s","result":{"configOptions":[]}}\n' "$id"
            ;;
        session/prompt)
            prompt_id=$id
            case "$line" in
                *permission*)
                    printf '%s\n' '{"jsonrpc":"2.0","id":"p1","method":"session/request_permission","params":{"sessionId":"ses_one","toolCall":{"toolCallId":"tool-1"},"options":[{"optionId":"allow","name":"Allow"}]}}'
                    ;;
                *)
                    printf '%s\n' '{"jsonrpc":"2.0","id":"q1","method":"elicitation/create","params":{"sessionId":"ses_one","mode":"form","message":"Pick one","requestedSchema":{"type":"object","properties":{}}}}'
                    ;;
            esac
            ;;
        session/cancel)
            printf '%s\n' "$id" >> "$state/cancels.log"
            ;;
        '')
            response_id=$(printf '%s' "$line" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
            case "$response_id" in
                q1|p1)
                    printf 'answer %s\n' "$response_id" >> "$state/answers.log"
                    printf '{"jsonrpc":"2.0","id":"%s","result":{"stopReason":"end_turn"}}\n' "$prompt_id"
                    ;;
                '')
                    ;;
                *)
                    printf 'unknown %s\n' "$response_id" >> "$state/answers.log"
                    printf 'Got response to unknown request %s\n' "$response_id" >&2
                    ;;
            esac
            ;;
    esac
done
