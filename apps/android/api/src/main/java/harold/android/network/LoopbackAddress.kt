package harold.android.network

/**
 * A loopback address printed by an agent, for example `http://localhost:8765`.
 * The port is required, because only the port tells us which host service the
 * phone should forward. Nothing else in the URL is trusted.
 */
data class LoopbackAddress(
    val host: String,
    val port: Int,
    val path: String = "/",
    val secure: Boolean = false,
) {
    /** Host and port in URL form. IPv6 literals keep their brackets. */
    val authority: String
        get() = if (host.contains(':')) "[$host]:$port" else "$host:$port"

    /** The address as the host sees it. */
    val hostUrl: String
        get() = "${if (secure) "https" else "http"}://$authority$path"

    companion object {
        val LOOPBACK_HOSTS: Set<String> = setOf(
            "localhost",
            "127.0.0.1",
            "0.0.0.0",
            "::1",
        )
    }
}

/** The loopback hosts Android can reach, plus the bracketed IPv6 form. */
fun isLoopbackHost(host: String): Boolean {
    val bare = host.removePrefix("[").removeSuffix("]").lowercase()
    return bare in LoopbackAddress.LOOPBACK_HOSTS
}

private val LOOPBACK_URL = Regex(
    pattern = """^(?:(https?)://)?(\[[0-9a-fA-F:]+\]|[A-Za-z0-9.\-]+):(\d{1,5})(/[^\s]*)?$""",
)

/**
 * Parses a URL or bare `host:port` string that points at the host's own
 * loopback. Returns null for any other host, a missing port, or a bad port,
 * so an agent cannot make the app forward something it did not ask for.
 */
fun parseLoopbackUrl(raw: String): LoopbackAddress? {
    val trimmed = raw.trim().trimEnd(')', '.', ',', ';', '"', '\'')
    if (trimmed.isEmpty() || trimmed.length > 2048) {
        return null
    }
    val match = LOOPBACK_URL.matchEntire(trimmed) ?: return null
    val (scheme, host, portText, path) = match.destructured
    val bareHost = host.removePrefix("[").removeSuffix("]")
    if (!isLoopbackHost(bareHost)) {
        return null
    }
    val port = portText.toIntOrNull() ?: return null
    if (port !in 1..65535) {
        return null
    }
    // A userinfo prefix or an empty path would make the forwarded URL lie
    // about what the host serves, so it is rejected rather than repaired.
    if (trimmed.contains('@')) {
        return null
    }
    val suffix = path.ifEmpty { "/" }
    return LoopbackAddress(
        host = bareHost,
        port = port,
        path = if (suffix.startsWith("/")) suffix else "/$suffix",
        secure = scheme.equals("https", ignoreCase = true),
    )
}
