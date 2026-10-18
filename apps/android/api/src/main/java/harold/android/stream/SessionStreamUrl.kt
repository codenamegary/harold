package harold.android.stream

import harold.android.contracts.AgentId
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * `GET /v1/sessions/:sessionId/events?agentId=…` — opening this stream is the
 * subscribe. Null when the origin is not a parseable URL.
 */
fun sessionEventsUrl(serverOrigin: String, agentId: AgentId, sessionId: String): HttpUrl? {
    val base = serverOrigin.trim().trimEnd('/').toHttpUrlOrNull() ?: return null
    return base.newBuilder()
        .addPathSegments("v1/sessions")
        .addPathSegment(sessionId)
        .addPathSegment("events")
        .addQueryParameter("agentId", agentId)
        .build()
}
