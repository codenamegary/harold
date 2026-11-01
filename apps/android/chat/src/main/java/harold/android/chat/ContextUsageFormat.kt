package harold.android.chat

import harold.android.live.ContextUsage
import harold.android.live.UsageCost
import java.util.Locale
import kotlin.math.roundToInt

/**
 * The subheader line, for example `84.2k / 200k (42%) · $0.045`.
 * Null when the context window size is unknown, which hides the line.
 */
internal fun formatContextUsage(usage: ContextUsage): String? {
    if (usage.size <= 0) {
        return null
    }
    val percent = (usage.used.toDouble() / usage.size * 100).roundToInt().coerceIn(0, 100)
    val base = "${compactTokenCount(usage.used)} / ${compactTokenCount(usage.size)} ($percent%)"
    return usage.cost?.let { cost -> "$base · ${formatUsageCost(cost)}" } ?: base
}

internal fun compactTokenCount(tokens: Long): String = when {
    tokens < 1_000 -> tokens.toString()
    tokens < 1_000_000 -> "${fixedOneDecimal(tokens / 1_000.0)}k"
    else -> "${fixedOneDecimal(tokens / 1_000_000.0)}M"
}

internal fun formatUsageCost(cost: UsageCost): String {
    val amount = moneyAmount(cost.amount)
    return if (cost.currency.equals("USD", ignoreCase = true)) {
        "$$amount"
    } else {
        "$amount ${cost.currency.uppercase(Locale.US)}"
    }
}

private fun fixedOneDecimal(value: Double): String =
    String.format(Locale.US, "%.1f", value).removeSuffix(".0")

/** Up to three decimals, at least two, without trailing noise: 0.045, 0.50, 1.00. */
private fun moneyAmount(amount: Double): String {
    val fixed = String.format(Locale.US, "%.3f", amount)
    val trimmed = fixed.trimEnd('0')
    val decimals = trimmed.substringAfter('.', "")
    return when {
        '.' !in trimmed -> "$trimmed.00"
        decimals.length >= 2 -> trimmed
        else -> trimmed.padEnd(trimmed.length + (2 - decimals.length), '0')
    }
}
