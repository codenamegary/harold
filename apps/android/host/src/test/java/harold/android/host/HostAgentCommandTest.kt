package harold.android.host

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HostAgentCommandTest {
    @Test
    fun hostScriptIsPackagedWithTheApp() {
        val script = hostAgentScript()

        assertTrue(script.contains("harold-agent.sh connect"))
        assertTrue(script.contains("harold-host-init"))
        assertTrue(script.contains("mkfifo"))
        assertFalse(script.contains("setsid"))
    }

    @Test
    fun connectEmbedsTheScriptAndFollowsNewOutput() {
        val command = hostAgentCommand(
            script = "echo host-script\n",
            mode = "connect",
            agentId = "opencode",
            command = "exec 'opencode' 'acp'",
            offset = LIVE_OFFSET,
        )

        assertTrue(command.startsWith("export HAROLD_AGENT_SCRIPT='echo host-script"))
        assertTrue(command.contains("exec sh -c "))
        assertTrue(command.contains("harold-agent connect 'opencode' 'exec '\\''opencode'\\''"))
        assertTrue(command.endsWith(" -1"))
    }

    @Test
    fun connectPassesTheClientIdToTheHost() {
        val command = hostAgentCommand(
            script = "echo host-script\n",
            mode = "connect",
            agentId = "opencode",
            command = "exec 'opencode' 'acp'",
            offset = LIVE_OFFSET,
            clientId = "client-a",
        )

        assertTrue(command.endsWith(" -1 'client-a'"))
    }

    @Test
    fun stopNeedsOnlyTheAgentId() {
        val command = hostAgentCommand(
            script = "echo host-script\n",
            mode = "stop",
            agentId = "opencode",
            command = "",
            offset = 0,
        )

        assertTrue(command.contains("harold-agent stop 'opencode'"))
        assertFalse(command.contains("harold-agent stop 'opencode' "))
    }
}
