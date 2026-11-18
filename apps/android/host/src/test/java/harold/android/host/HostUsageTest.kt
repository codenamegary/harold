package harold.android.host

import harold.android.contracts.SessionUsage
import harold.android.contracts.UsageCost
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HostUsageTest {
    @Test
    fun foldsTheLatestUsagePerSessionAndCarriesCostForward() {
        val scan = parseHostUsage(
            usage(
                run = "20261117T100000Z-1",
                offset = 10,
                session = "ses_1",
                used = 100,
                cost = UsageCost(0.01, "USD"),
            ) +
                end("20261117T100000Z-1", 200) +
                usage(
                    run = "20261117T110000Z-2",
                    offset = 20,
                    session = "ses_1",
                    used = 300,
                ) +
                usage(
                    run = "20261117T110000Z-2",
                    offset = 40,
                    session = "ses_2",
                    used = 7,
                ) +
                end("20261117T110000Z-2", 400) +
                "done\topencode\n",
        )

        assertTrue(scan.complete)
        val newest = scan.sessions.single { session -> session.sessionId == "ses_1" }
        assertEquals(300L, newest.used)
        assertEquals(UsageCost(0.01, "USD"), newest.cost)
        assertEquals("20261117T110000Z-2", newest.lastRunId)
        assertEquals(20L, newest.lastOffset)
        assertEquals(Instant.parse("2026-11-17T11:00:00Z"), newest.updatedAt)
        assertEquals("20261117T110000Z-2", scan.newestRunId)
        assertEquals(400L, scan.newestRunOffset)
    }

    @Test
    fun ignoresToolOutputAndMalformedLines() {
        val falsePositive =
            """{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"ses_1","update":{"sessionUpdate":"tool_call_update","content":[{"type":"text","text":"\"sessionUpdate\": \"usage_update\""}]}}}"""
        val scan = parseHostUsage(
            "usage\topencode\t20261117T100000Z-1\t0\t$falsePositive\n" +
                "usage\topencode\t20261117T100000Z-1\t10\tnot json\n" +
                "usage\topencode\t20261117T100000Z-1\t20\t{\"method\":\"session/update\",\"params\":{\"sessionId\":\"ses_1\",\"update\":{\"sessionUpdate\":\"usage_update\",\"used\":5}}}\n",
        )

        assertEquals(emptySet<SessionUsage>(), scan.sessions.toSet())
        assertFalse(scan.complete)
    }

    @Test
    fun acceptsWhitespaceBetweenJsonFields() {
        val json =
            """{"jsonrpc": "2.0", "method" : "session/update", "params" : {"sessionId" : "ses_1", "update" : {"sessionUpdate" : "usage_update", "used" : 12, "size" : 1000}}}"""
        val scan = parseHostUsage("usage\tcursor\t20261117T100000Z-1\t0\t$json\n")

        assertEquals(1, scan.sessions.size)
        assertEquals(12L, scan.sessions.single().used)
        assertEquals(1000L, scan.sessions.single().size)
    }

    @Test
    fun cacheReplacesOnFullScanAndMergesNewerLatestRecords() {
        val cache = SessionUsageCache()
        val first = usageRecord("ses_1", run = "20261117T100000Z-1", offset = 10, used = 100)
        cache.replaceAgent("c", "opencode", listOf(first), "20261117T100000Z-1", 200)

        assertEquals(first, cache.cachedSessionUsage("c", "opencode", "ses_1"))
        assertEquals(
            UsageAgentCursor("20261117T100000Z-1", 200, fullyScanned = true),
            cache.cursor("c", "opencode"),
        )

        val other = usageRecord("ses_2", run = "20261117T100000Z-1", offset = 20, used = 5)
        cache.mergeAgent("c", "opencode", listOf(other), "20261117T100000Z-1", 300)

        assertEquals(first, cache.cachedSessionUsage("c", "opencode", "ses_1"))
        assertEquals(other, cache.cachedSessionUsage("c", "opencode", "ses_2"))
        assertEquals(300L, cache.cursor("c", "opencode")?.newestRunOffset)

        val newer = usageRecord("ses_1", run = "20261117T110000Z-2", offset = 1, used = 400)
        cache.mergeAgent("c", "opencode", listOf(newer), "20261117T110000Z-2", 80)

        assertEquals(newer, cache.cachedSessionUsage("c", "opencode", "ses_1"))
        assertEquals("20261117T110000Z-2", cache.cursor("c", "opencode")?.newestRunId)
        assertEquals(80L, cache.cursor("c", "opencode")?.newestRunOffset)
    }

    @Test
    fun anOlderIncrementalRecordDoesNotOverwriteANewerOne() {
        val cache = SessionUsageCache()
        val newer = usageRecord("ses_1", run = "20261117T110000Z-2", offset = 10, used = 400)
        cache.replaceAgent("c", "opencode", listOf(newer), "20261117T110000Z-2", 80)

        val older = usageRecord("ses_1", run = "20261117T100000Z-1", offset = 99, used = 1)
        cache.mergeAgent("c", "opencode", listOf(older), "20261117T100000Z-1", 120)

        assertEquals(newer, cache.cachedSessionUsage("c", "opencode", "ses_1"))
    }

    @Test
    fun forgettingRemovesOnlyTheRequestedRows() {
        val cache = SessionUsageCache()
        cache.replaceAgent(
            "c",
            "opencode",
            listOf(
                usageRecord("ses_1", "20261117T100000Z-1", 1, 1),
                usageRecord("ses_2", "20261117T100000Z-1", 2, 2),
            ),
            "20261117T100000Z-1",
            100,
        )
        cache.replaceAgent(
            "d",
            "opencode",
            listOf(usageRecord("ses_1", "20261117T100000Z-1", 1, 1)),
            "20261117T100000Z-1",
            100,
        )

        cache.forgetSession("c", "opencode", "ses_1")

        assertNull(cache.cachedSessionUsage("c", "opencode", "ses_1"))
        assertTrue(cache.cachedSessionUsage("c", "opencode", "ses_2") != null)
        assertTrue(cache.cachedSessionUsage("d", "opencode", "ses_1") != null)

        cache.forgetConnection("c")

        assertNull(cache.cachedSessionUsage("c", "opencode", "ses_2"))
        assertTrue(cache.cachedSessionUsage("d", "opencode", "ses_1") != null)
    }

    private fun usage(
        run: String,
        offset: Long,
        session: String,
        used: Long,
        cost: UsageCost? = null,
    ): String {
        val costJson = cost?.let {
            ""","cost":{"amount":${it.amount},"currency":"${it.currency}"}"""
        }.orEmpty()
        val json =
            """{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"$session","update":{"sessionUpdate":"usage_update","used":$used,"size":1000$costJson}}}"""
        return "usage\topencode\t$run\t$offset\t$json\n"
    }

    private fun end(run: String, offset: Long): String =
        "end\topencode\t$run\t$offset\n"

    private fun usageRecord(
        session: String,
        run: String,
        offset: Long,
        used: Long,
    ): SessionUsage = SessionUsage(
        agentId = "opencode",
        sessionId = session,
        used = used,
        size = 1000,
        cost = null,
        lastRunId = run,
        lastOffset = offset,
        updatedAt = null,
    )
}
