package harold.android.chat

import harold.android.live.ContextUsage
import harold.android.live.UsageCost
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ContextUsageFormatTest {
    @Test
    fun formatsTokensPercentAndUsdCost() {
        assertEquals(
            "84.2k / 200k (42%) · $0.045",
            formatContextUsage(
                ContextUsage(
                    used = 84200,
                    size = 200000,
                    cost = UsageCost(amount = 0.045, currency = "USD"),
                ),
            ),
        )
    }

    @Test
    fun omitsTheCostSegmentWhenAbsent() {
        assertEquals(
            "84.2k / 200k (42%)",
            formatContextUsage(ContextUsage(used = 84200, size = 200000)),
        )
    }

    @Test
    fun hidesWhenTheWindowSizeIsUnknown() {
        assertNull(formatContextUsage(ContextUsage(used = 84200, size = 0)))
    }

    @Test
    fun compactsSmallAndLargeTokenCounts() {
        assertEquals(
            "999 / 200k (0%)",
            formatContextUsage(ContextUsage(used = 999, size = 200000)),
        )
        assertEquals(
            "1.5k / 1.3M (0%)",
            formatContextUsage(ContextUsage(used = 1500, size = 1250000)),
        )
    }

    @Test
    fun roundsThePercentToTheNearestWholeNumber() {
        assertEquals(
            "1k / 200k (1%)",
            formatContextUsage(ContextUsage(used = 1000, size = 200000)),
        )
        assertEquals(
            "200k / 200k (100%)",
            formatContextUsage(ContextUsage(used = 200000, size = 200000)),
        )
    }

    @Test
    fun showsTheCurrencyCodeForNonUsdCosts() {
        assertEquals(
            "84.2k / 200k (42%) · 0.045 EUR",
            formatContextUsage(
                ContextUsage(
                    used = 84200,
                    size = 200000,
                    cost = UsageCost(amount = 0.045, currency = "EUR"),
                ),
            ),
        )
    }

    @Test
    fun computesPercentBeyondOneHundredWhenTokensExceedContextSize() {
        assertEquals(
            "210k / 200k (105%)",
            formatContextUsage(ContextUsage(used = 210000, size = 200000)),
        )
    }
}
