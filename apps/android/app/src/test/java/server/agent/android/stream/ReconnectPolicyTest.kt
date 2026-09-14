package server.agent.android.stream

import org.junit.Assert.assertEquals
import org.junit.Test

class ReconnectPolicyTest {
    @Test
    fun doublesFromTwoFiftyMilliseconds() {
        assertEquals(250L, ReconnectPolicy.delayMillis(1))
        assertEquals(500L, ReconnectPolicy.delayMillis(2))
        assertEquals(1_000L, ReconnectPolicy.delayMillis(3))
        assertEquals(2_000L, ReconnectPolicy.delayMillis(4))
    }

    @Test
    fun capsAtFourSeconds() {
        assertEquals(4_000L, ReconnectPolicy.delayMillis(5))
        assertEquals(4_000L, ReconnectPolicy.delayMillis(6))
        assertEquals(4_000L, ReconnectPolicy.delayMillis(64))
    }

    @Test
    fun treatsNonPositiveAttemptsAsTheFirstAttempt() {
        assertEquals(250L, ReconnectPolicy.delayMillis(0))
        assertEquals(250L, ReconnectPolicy.delayMillis(-3))
    }

    @Test
    fun isDeterministicSoBackoffCarriesNoJitter() {
        val samples = (1..8).map { attempt -> ReconnectPolicy.delayMillis(attempt) }
        val repeated = (1..8).map { attempt -> ReconnectPolicy.delayMillis(attempt) }

        assertEquals(samples, repeated)
    }
}
