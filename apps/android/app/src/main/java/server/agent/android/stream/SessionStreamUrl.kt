package server.agent.android.stream

const val SESSIONS_STREAM_PATH = "/v1/sessions/stream"

fun sessionStreamUrl(serverOrigin: String): String {
    val origin = serverOrigin.trim().trimEnd('/')
    val socketOrigin = when {
        origin.startsWith("https://") -> "wss://${origin.removePrefix("https://")}"
        origin.startsWith("http://") -> "ws://${origin.removePrefix("http://")}"
        else -> origin
    }

    return "$socketOrigin$SESSIONS_STREAM_PATH"
}
