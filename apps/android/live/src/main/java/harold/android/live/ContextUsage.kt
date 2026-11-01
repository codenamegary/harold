package harold.android.live

/** The watched session's latest context window usage, reported by `usage_update`. */
data class ContextUsage(
    val used: Long,
    val size: Long,
    val cost: UsageCost? = null,
)

fun ParsedAcpUpdate.Usage.toContextUsage(): ContextUsage =
    ContextUsage(used = used, size = size, cost = cost)
