package harold.android.host

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class AgentLaunchCommandTest {
    @Test
    fun launchCommandKeepsTheLoginShellWhenNoBinDirectoryIsChosen() {
        val command = agentLaunchInnerCommand(
            binary = "npx",
            args = listOf("-y", "pi-acp@0.0.34"),
            binDir = null,
        )
        assertEquals("exec 'npx' '-y' 'pi-acp@0.0.34'", command)
        assertFalse(command.contains("PATH"))
    }

    @Test
    fun launchCommandPrependsTheChosenBinDirectoryToPath() {
        val command = agentLaunchInnerCommand(
            binary = "npx",
            args = listOf("-y", "pi-acp@0.0.34"),
            binDir = "/home/u/.nvm/versions/node/v22.19.0/bin",
        )
        assertEquals(
            "export PATH='/home/u/.nvm/versions/node/v22.19.0/bin':\"\$PATH\"; " +
                "exec 'npx' '-y' 'pi-acp@0.0.34'",
            command,
        )
    }

    @Test
    fun launchCommandQuotesABinDirectoryWithSpaces() {
        val command = agentLaunchInnerCommand(
            binary = "node",
            args = emptyList(),
            binDir = "/home/u/node bin",
        )
        assertEquals(
            "export PATH='/home/u/node bin':\"\$PATH\"; exec 'node'",
            command,
        )
    }
}
