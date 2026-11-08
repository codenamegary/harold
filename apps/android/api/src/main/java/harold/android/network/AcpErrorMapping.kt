package harold.android.network

import harold.android.contracts.AgentId

/** True when an ACP error reports that the agent needs a host-side sign-in. */
fun isAcpAuthRequiredError(code: Int?, message: String?): Boolean {
    if (code == AUTH_REQUIRED_CODE) {
        return true
    }
    val normalized = message?.lowercase()?.replace('_', ' ') ?: return false
    return "auth required" in normalized || "authentication required" in normalized
}

const val AUTH_REQUIRED_CODE = -32000

/**
 * Tells the chat UI what to tell the user when an agent needs a host sign-in.
 * Agents with a known host CLI get that command; everything else falls back
 * to the catalog display name when the caller has one.
 */
fun hostLoginInstructions(agentId: AgentId, displayName: String? = null): String {
    val command = when (agentId) {
        "claude-acp" -> "claude"
        "cursor" -> "cursor-agent"
        else -> displayName ?: agentId
    }
    return "Sign in as $command on the host (run it once in a terminal there), " +
        "then restart the agent from this screen."
}
