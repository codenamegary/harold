package harold.android.transport.ssh

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AcpSessionListTest {
    private fun json(value: String) = Json.parseToJsonElement(value)

    @Test
    fun parsesSessionsAndPaginationCursor() {
        val page = parseSessionListPage(
            agentId = "opencode",
            response = json(
                """
                {
                  "sessions": [
                    {
                      "sessionId": "sess_1",
                      "cwd": "/home/dev/project",
                      "title": "Fix the parser",
                      "updatedAt": "2026-11-07T10:00:00+02:00"
                    }
                  ],
                  "nextCursor": "page-2"
                }
                """.trimIndent(),
            ),
        )

        assertEquals(1, page.sessions.size)
        val session = page.sessions.single()
        assertEquals("opencode", session.agentId)
        assertEquals("sess_1", session.sessionId)
        assertEquals("/home/dev/project", session.cwd)
        assertEquals("Fix the parser", session.title)
        // Timestamps are normalized to UTC so string sorting stays stable.
        assertEquals("2026-11-07T08:00:00Z", session.updatedAt)
        assertEquals("page-2", page.nextCursor)
    }

    @Test
    fun dropsRowsWithoutTheRequiredFields() {
        val page = parseSessionListPage(
            agentId = "cursor",
            response = json(
                """
                {
                  "sessions": [
                    {"sessionId": "good", "cwd": "/repo"},
                    {"sessionId": "missing-cwd"},
                    {"cwd": "/repo"},
                    "not an object"
                  ]
                }
                """.trimIndent(),
            ),
        )

        assertEquals(listOf("good"), page.sessions.map { session -> session.sessionId })
        assertNull(page.nextCursor)
    }

    @Test
    fun mergeDeduplicatesAndSortsNewestFirst() {
        val older = session("opencode", "sess_1", "2026-11-01T00:00:00Z")
        val newer = session("cursor", "sess_2", "2026-11-03T00:00:00Z")
        val duplicate = older.copy(title = "renamed")

        val merged = mergeSessionLists(
            listOf(
                listOf(older, newer),
                listOf(duplicate),
            ),
        )

        assertEquals(listOf("sess_2", "sess_1"), merged.map { it.sessionId })
        assertEquals("renamed", merged.last().title)
    }

    @Test
    fun sessionsWithoutAnUpdatedAtSortLast() {
        val dated = session("cursor", "sess_1", "2026-11-01T00:00:00Z")
        val undated = session("opencode", "sess_2", null)

        val merged = mergeSessionLists(listOf(listOf(undated, dated)))

        assertEquals(listOf("sess_1", "sess_2"), merged.map { it.sessionId })
    }

    @Test
    fun parsesSessionInfoUpdatesWithoutTreatingAMissingTitleAsAClear() {
        val patch = parseSessionInfoUpdate(
            jsonObject(
                """
                {
                  "sessionUpdate": "session_info_update",
                  "updatedAt": "2026-11-07T10:00:00Z"
                }
                """.trimIndent(),
            ),
        )
        requireNotNull(patch)
        assertFalse(patch.titleChanged)
        assertNull(patch.title)
        assertEquals("2026-11-07T10:00:00Z", patch.updatedAt)

        val cleared = parseSessionInfoUpdate(
            jsonObject(
                """
                {
                  "sessionUpdate": "session_info_update",
                  "title": null
                }
                """.trimIndent(),
            ),
        )
        requireNotNull(cleared)
        assertTrue(cleared.titleChanged)
        assertNull(cleared.title)
    }

    @Test
    fun onlySessionInfoUpdatesProduceAPatch() {
        assertNull(
            parseSessionInfoUpdate(
                jsonObject(
                    """
                    {"sessionUpdate": "agent_message_chunk", "content": {"type": "text"}}
                    """.trimIndent(),
                ),
            ),
        )
    }

    @Test
    fun catalogKeepsSessionsForAgentsThatDidNotAnswer() {
        val catalog = SshSessionCatalog()
        val opencode = session("opencode", "sess_1", "2026-11-01T00:00:00Z")
        val amp = session("amp-acp", "sess_2", "2026-11-02T00:00:00Z")
        catalog.replaceAll("conn", listOf(opencode, amp))

        val merged = catalog.merge(
            connectionId = "conn",
            sessions = listOf(opencode.copy(title = "renamed")),
            refreshedAgentIds = setOf("opencode"),
            attemptedAgentIds = setOf("opencode", "amp-acp"),
        )

        assertEquals(2, merged.size)
        assertEquals("renamed", catalog.find("conn", "opencode", "sess_1")?.title)
        assertEquals(amp, catalog.find("conn", "amp-acp", "sess_2"))
    }

    @Test
    fun catalogDropsSessionsForAgentsThatAreNoLongerEnabled() {
        val catalog = SshSessionCatalog()
        val opencode = session("opencode", "sess_1", "2026-11-01T00:00:00Z")
        val disabled = session("cursor", "sess_2", "2026-11-02T00:00:00Z")
        catalog.replaceAll("conn", listOf(opencode, disabled))

        catalog.merge(
            connectionId = "conn",
            sessions = listOf(opencode),
            refreshedAgentIds = setOf("opencode"),
            attemptedAgentIds = setOf("opencode"),
        )

        assertNull(catalog.find("conn", "cursor", "sess_2"))
    }

    @Test
    fun filteredCatalogRefreshKeepsOtherFolders() {
        val catalog = SshSessionCatalog()
        val inFolder = session("opencode", "sess_1", "2026-11-01T00:00:00Z")
        val elsewhere = session("opencode", "sess_2", "2026-11-02T00:00:00Z")
            .copy(cwd = "/other")
        catalog.replaceAll("conn", listOf(inFolder, elsewhere))

        catalog.merge(
            connectionId = "conn",
            sessions = emptyList(),
            refreshedAgentIds = setOf("opencode"),
            cwd = "/repo",
        )

        assertNull(catalog.find("conn", "opencode", "sess_1"))
        assertEquals(elsewhere, catalog.find("conn", "opencode", "sess_2"))
    }

    @Test
    fun catalogUpdatesAndRemovesSessions() {
        val catalog = SshSessionCatalog()
        val opencode = session("opencode", "sess_1", "2026-11-01T00:00:00Z")
        catalog.replaceAll("conn", listOf(opencode))

        catalog.updateInfo(
            connectionId = "conn",
            agentId = "opencode",
            sessionId = "sess_1",
            patch = AcpSessionInfoPatch(
                titleChanged = true,
                title = "Named by the agent",
                updatedAt = "2026-11-07T10:00:00Z",
            ),
        )

        assertEquals("Named by the agent", catalog.find("conn", "opencode", "sess_1")?.title)
        catalog.remove("conn", "opencode", "sess_1")
        assertNull(catalog.find("conn", "opencode", "sess_1"))
    }

    @Test
    fun capabilityDetectionRequiresAnEntryAndRejectsNull() {
        val supported = json(
            """
            {"agentCapabilities": {"sessionCapabilities": {"list": {}, "delete": {}}}}
            """.trimIndent(),
        )
        assertTrue(supported.advertisesSessionCapability("list"))
        assertTrue(supported.advertisesSessionCapability("delete"))
        assertFalse(supported.advertisesSessionCapability("close"))

        val nulled = json(
            """
            {"agentCapabilities": {"sessionCapabilities": {"list": null}}}
            """.trimIndent(),
        )
        assertFalse(nulled.advertisesSessionCapability("list"))
    }

    private fun session(
        agentId: String,
        sessionId: String,
        updatedAt: String?,
    ) = AcpSessionInfo(
        agentId = agentId,
        sessionId = sessionId,
        cwd = "/repo",
        title = sessionId,
        updatedAt = updatedAt,
    )

    private fun jsonObject(value: String): JsonObject = json(value).jsonObject
}
