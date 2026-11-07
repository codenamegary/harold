package harold.android.transport.ssh

import harold.android.contracts.AgentAuthStatus
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentAuthAdaptersTest {
    @Test
    fun claudeAndCursorHaveAdapters() {
        assertEquals(setOf("claude-acp", "cursor"), AgentAuthAdapters.knownAgentIds)
        assertTrue(AgentAuthAdapters.resolve("claude-acp") != null)
        assertTrue(AgentAuthAdapters.resolve("cursor") != null)
        assertNull(AgentAuthAdapters.resolve("opencode"))
    }

    @Test
    fun claudeProbeMapsTheStatusJson() {
        val adapter = AgentAuthAdapters.resolve("claude-acp")!!
        val authenticated = adapter.probeResult(
            SshCommandResult(0, """{"loggedIn": true}""", ""),
        )
        assertEquals(AgentAuthStatus.Authenticated, authenticated.status)
        assertTrue(authenticated.canLogout)

        // Signed out exits non-zero but still prints JSON.
        val signedOut = adapter.probeResult(
            SshCommandResult(1, """{"loggedIn": false}""", "not logged in"),
        )
        assertEquals(AgentAuthStatus.NeedsAuth, signedOut.status)
        assertFalse(signedOut.canLogout)
    }

    @Test
    fun claudeProbeSurfacesErrorField() {
        val adapter = AgentAuthAdapters.resolve("claude-acp")!!
        val error = adapter.probeResult(
            SshCommandResult(0, """{"error": "door stuck"}""", ""),
        )
        assertEquals(AgentAuthStatus.Error, error.status)
        assertEquals("door stuck", error.error)
    }

    @Test
    fun cursorProbeMapsStatusAndAuthentication() {
        val adapter = AgentAuthAdapters.resolve("cursor")!!
        assertEquals(
            AgentAuthStatus.Authenticated,
            adapter.probeResult(
                SshCommandResult(0, """{"isAuthenticated": true}""", ""),
            ).status,
        )
        assertEquals(
            AgentAuthStatus.NeedsAuth,
            adapter.probeResult(
                SshCommandResult(0, """{"status": "signed_out"}""", ""),
            ).status,
        )
    }

    @Test
    fun aFailedProbeWithNothingToParseDegradesToUnknown() {
        val adapter = AgentAuthAdapters.resolve("cursor")!!
        val probe = adapter.probeResult(SshCommandResult(127, "", "command not found"))
        assertEquals(AgentAuthStatus.Unknown, probe.status)
        assertEquals("command not found", probe.error)
    }

    @Test
    fun authCacheHonoursTtlAndInvalidation() {
        val cache = AgentAuthCache()
        cache.put("conn", "cursor", AgentAuthProbe(AgentAuthStatus.Authenticated, null, true))
        assertEquals(AgentAuthStatus.Authenticated, cache.get("conn", "cursor")?.status)
        cache.invalidate("conn", "cursor")
        assertNull(cache.get("conn", "cursor"))
    }

    @Test
    fun authRequiredDetectionMatchesCodeAndWording() {
        assertTrue(isAcpAuthRequiredError(-32000, null))
        assertTrue(isAcpAuthRequiredError(-32000, "nope"))
        assertTrue(isAcpAuthRequiredError(-32600, "authentication required"))
        assertTrue(isAcpAuthRequiredError(-32600, "auth_required by agent"))
        assertFalse(isAcpAuthRequiredError(-32600, "method not found"))
    }

    @Test
    fun hostLoginInstructionsNameTheHostCli() {
        assertTrue(hostLoginInstructions("claude-acp").contains("claude"))
        assertTrue(hostLoginInstructions("cursor").contains("cursor-agent"))
    }
}
