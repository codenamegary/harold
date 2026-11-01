package harold.android.live

/** The cumulative session cost carried by an ACP `usage_update`. */
data class UsageCost(
    val amount: Double,
    val currency: String,
)

/** The watched session's latest context window usage, reported by `usage_update`. */
data class ContextUsage(
    val used: Long,
    val size: Long,
    val cost: UsageCost? = null,
)
