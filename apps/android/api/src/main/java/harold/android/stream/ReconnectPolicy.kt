package harold.android.stream

/**
 * Bounded exponential backoff without jitter: `min(250 * 2^(attempt - 1), 4000)` ms.
 * A single device reconnecting to a single loopback server has no thundering herd
 * to spread out, and a deterministic schedule is testable.
 */
object ReconnectPolicy {
    const val BASE_DELAY_MS = 250L
    const val MAX_DELAY_MS = 4_000L

    /** How long a watched session keeps retrying a transport failure. */
    const val WINDOW_MILLIS = 120_000L

    private const val MAX_SHIFT = 4

    fun delayMillis(attempt: Int): Long {
        val exponent = (attempt.coerceAtLeast(1) - 1).coerceAtMost(MAX_SHIFT)

        return (BASE_DELAY_MS shl exponent).coerceAtMost(MAX_DELAY_MS)
    }

    fun windowExpired(startedAtNanos: Long, nowNanos: Long): Boolean =
        nowNanos - startedAtNanos >= WINDOW_MILLIS * 1_000_000L
}
