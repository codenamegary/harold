package harold.android.host

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentLaunchConfigTest {
    private fun row(
        displayName: String? = null,
        path: String? = null,
        args: List<String> = emptyList(),
        binDir: String? = null,
        enabled: Boolean = true,
    ) = HostAgentConfigRow(
        id = "pi-acp",
        displayName = displayName,
        path = path,
        args = args,
        binDir = binDir,
        enabled = enabled,
        updatedAt = "now",
    )

    @Test
    fun changingOnlyTheDisplayNameDoesNotRestartTheProcess() {
        assertFalse(
            agentLaunchConfigChanged(
                before = row(displayName = "pi"),
                after = row(displayName = "pi ACP"),
            ),
        )
    }

    @Test
    fun changingTheRuntimeOrItsInputsRestartsTheProcess() {
        assertTrue(
            agentLaunchConfigChanged(
                before = row(binDir = "/old/node/bin"),
                after = row(binDir = "/new/node/bin"),
            ),
        )
        assertTrue(
            agentLaunchConfigChanged(
                before = row(path = "/old/npx"),
                after = row(path = "/new/npx"),
            ),
        )
        assertTrue(
            agentLaunchConfigChanged(
                before = row(args = listOf("-y", "pi-acp@0.0.33")),
                after = row(args = listOf("-y", "pi-acp@0.0.34")),
            ),
        )
        assertTrue(
            agentLaunchConfigChanged(
                before = row(enabled = true),
                after = row(enabled = false),
            ),
        )
    }
}
