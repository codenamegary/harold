package harold.android.transport.ssh

import harold.android.contracts.AgentAuthStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class KnownAgentsTest {
    private fun row(
        id: String,
        path: String? = null,
        enabled: Boolean = true,
        dismissed: Boolean = false,
        custom: Boolean = false,
        displayName: String? = null,
        args: List<String> = emptyList(),
    ) = HostAgentConfigRow(
        id = id,
        displayName = displayName,
        path = path,
        args = args,
        enabled = enabled,
        dismissed = dismissed,
        custom = custom,
        updatedAt = "now",
    )

    @Test
    fun catalogCoversTheMajorAcpAgents() {
        listOf("claude-acp", "cursor", "opencode", "codex-acp", "gemini").forEach { id ->
            assertTrue("expected known agent $id", knownAgent(id) != null)
        }
    }

    @Test
    fun knownAgentsWithABinaryUseItsCommandTemplate() {
        val opencode = knownAgent("opencode")!!
        assertEquals("opencode", opencode.binaryName)
        assertEquals(listOf("acp"), opencode.command.drop(1))
    }

    @Test
    fun presenceProbeAsksAboutEveryKnownBinary() {
        val script = presenceProbeScript()
        listOf("cursor-agent", "opencode", "claude").forEach { binary ->
            assertTrue(script.contains(binary))
        }
    }

    @Test
    fun presenceProbeParseReadsTabSeparatedOutput() {
        val entries = parsePresenceProbe("opencode\t/usr/bin/opencode\nnoise\n\t/x\n")
        assertEquals(listOf(AgentScanEntry("opencode", "/usr/bin/opencode")), entries)
    }

    @Test
    fun scanAddsNewRowsWithTheCommandTemplate() {
        val merged = mergeScanRows(emptyList(), listOf(AgentScanEntry("opencode", "/usr/bin/oc")))
        assertEquals(1, merged.size)
        val row = merged.single()
        assertEquals("opencode", row.id)
        assertEquals("/usr/bin/oc", row.path)
        assertTrue(row.enabled)
        assertTrue(row.present)
        assertEquals(listOf("acp"), row.args)
    }

    @Test
    fun scanNeverOverwritesUserOwnedFields() {
        val existing = listOf(
            row(
                id = "opencode",
                path = "/custom/path/opencode",
                enabled = false,
                displayName = "My OpenCode",
                args = listOf("acp", "--portable"),
            ),
        )
        val merged = mergeScanRows(existing, listOf(AgentScanEntry("opencode", "/usr/bin/oc")))
        val row = merged.single()
        assertEquals("/custom/path/opencode", row.path)
        assertFalse(row.enabled)
        assertEquals("My OpenCode", row.displayName)
        assertEquals(listOf("acp", "--portable"), row.args)
    }

    @Test
    fun scanKeepsDismissedAgentsDismissed() {
        val existing = listOf(row(id = "cursor", dismissed = true, enabled = false))
        val merged = mergeScanRows(existing, listOf(AgentScanEntry("cursor", "/usr/bin/cursor-agent")))
        assertTrue(merged.single().dismissed)
        assertFalse(merged.single().enabled)
    }

    @Test
    fun scanMarksAbsentAgentsNotPresent() {
        val existing = listOf(row(id = "opencode", path = "/usr/bin/oc"))
        val merged = mergeScanRows(existing, listOf(AgentScanEntry("cursor", "/usr/bin/cursor-agent")))
        // The user pointed at an explicit path, so the view still counts the
        // agent as present even though the scan did not see it on PATH.
        assertTrue(agentSettingsView(merged).find { it.id == "opencode" }!!.present)
        assertTrue(merged.find { it.id == "cursor" }!!.present)
    }

    @Test
    fun viewListsEveryKnownAgentAndSortsEnabledFirst() {
        val rows = listOf(
            row(id = "goose", path = "/usr/bin/goose"),
            row(id = "cursor", path = "/usr/bin/cursor-agent", enabled = false),
        )
        val view = agentSettingsView(rows)
        val ids = view.map { it.id }
        assertTrue(ids.containsAll(listOf("cursor", "goose", "opencode", "claude-acp")))
        assertEquals("goose", view.first().id)
        assertFalse(view.find { it.id == "cursor" }!!.enabled)
        assertFalse(view.find { it.id == "goose" }!!.dismissed)
    }

    @Test
    fun viewHidesDismissedAgentsFromEnabledAndAvailability() {
        val rows = listOf(row(id = "cursor", dismissed = true))
        val view = agentSettingsView(rows).find { it.id == "cursor" }!!
        assertTrue(view.dismissed)
        assertFalse(view.enabled)
    }

    @Test
    fun customAgentIdsGetCollisionSuffixes() {
        val existing = listOf(
            row(id = "custom-helper", custom = true),
            row(id = "custom-helper-2", custom = true),
        )
        assertEquals("custom-helper-3", allocateCustomAgentId("helper", existing))
        assertEquals("custom-my-agent", allocateCustomAgentId("My Agent!!", emptyList()))
        assertEquals("custom-agent", allocateCustomAgentId("###", emptyList()))
    }

    @Test
    fun customDisplayNamesAllocateSequentialNames() {
        assertEquals("Custom Agent", allocateCustomDisplayName(emptyList()))
        val existing = listOf(row(id = "custom-a", custom = true, displayName = "Custom Agent"))
        assertEquals("Custom Agent 1", allocateCustomDisplayName(existing))
    }
}
