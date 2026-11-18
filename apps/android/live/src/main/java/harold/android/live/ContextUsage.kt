package harold.android.live

/** Kept in this package so existing chat and test imports do not move. */
typealias UsageCost = harold.android.contracts.UsageCost

/** The watched session's latest context window usage, reported by `usage_update`. */
data class ContextUsage(
    val used: Long,
    val size: Long,
    val cost: UsageCost? = null,
)
