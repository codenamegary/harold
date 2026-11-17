package harold.android.connections

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import harold.android.contracts.AgentLogs
import harold.android.contracts.HostLogs
import harold.android.contracts.LogRun
import harold.android.credentials.SshCredential
import harold.android.credentials.SshCredentialKind
import harold.android.ui.theme.HaroldTheme
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class ConnectionSettingsScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun editConnectionUsesTheSharedFormAndKeepsEditOnlySections() {
        var saved = false
        var selectedCredentialId: String? = null
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ConnectionSettingsScreen(
                    uiState = ConnectionSettingsUiState(
                        connectionId = "ssh://gary@127.0.0.1:2223",
                        name = "Demo host",
                        endpoint = "ssh://gary@127.0.0.1:2223",
                        host = "127.0.0.1",
                        port = "2223",
                        user = "gary",
                        fingerprint = "SHA256:abc123",
                        authSummary = "Private key stored on this phone",
                        credentials = listOf(
                            SshCredential(
                                id = "key_1",
                                name = "Work key",
                                kind = SshCredentialKind.PrivateKey,
                                privateKeyPem = "pem",
                                publicKey = "ssh-ed25519 AAAA work",
                                createdAt = "2026-01-01T00:00:00Z",
                            ),
                        ),
                        colorId = "tide",
                        iconId = "terminal",
                        loaded = true,
                    ),
                    onBack = {},
                    onNameChanged = {},
                    onColorSelected = {},
                    onIconSelected = {},
                    onDefaultAgentSelected = {},
                    onDefaultWorkspaceChanged = {},
                    onCredentialSelected = { selectedCredentialId = it },
                    onSave = { saved = true },
                    onShowForgetConfirm = {},
                    onHideForgetConfirm = {},
                    onForget = {},
                    onShowLogsCleanup = {},
                    onHideLogsCleanup = {},
                    onCleanupLogs = {},
                    onReloadLogs = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Connection settings").assertIsDisplayed()
        composeTestRule.onNodeWithTag("settings_name").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("settings_endpoint").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("settings_auth_summary").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("settings_defaults_section").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("settings_danger_section").performScrollTo().assertIsDisplayed()

        composeTestRule.onNodeWithTag("settings_save").performScrollTo().performClick()
        assertTrue(saved)

        composeTestRule.onNodeWithTag("settings_credential_picker").performScrollTo().performClick()
        composeTestRule.onNodeWithTag("settings_credential_key_1").performClick()
        assertEquals("key_1", selectedCredentialId)
    }

    @Test
    fun agentLogsShowTheirTotalWarnAboveTheLimitAndOpenCleanup() {
        var cleanupRequested = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ConnectionSettingsScreen(
                    uiState = settingsState().copy(
                        agentLogs = AgentLogsUiState(logs = oversizedLogs()),
                    ),
                    onBack = {},
                    onNameChanged = {},
                    onColorSelected = {},
                    onIconSelected = {},
                    onDefaultAgentSelected = {},
                    onDefaultWorkspaceChanged = {},
                    onCredentialSelected = {},
                    onSave = {},
                    onShowForgetConfirm = {},
                    onHideForgetConfirm = {},
                    onForget = {},
                    onShowLogsCleanup = { cleanupRequested = true },
                    onHideLogsCleanup = {},
                    onCleanupLogs = {},
                    onReloadLogs = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("settings_agent_logs_section")
            .performScrollTo()
            .assertIsDisplayed()
        composeTestRule.onNodeWithTag("settings_agent_logs_total")
            .performScrollTo()
            .assertIsDisplayed()
        composeTestRule.onNodeWithTag("settings_agent_logs_agent_opencode")
            .performScrollTo()
            .assertIsDisplayed()
        composeTestRule.onNodeWithTag("settings_agent_logs_run_opencode_20260102T000000Z-2")
            .performScrollTo()
            .assertIsDisplayed()
        composeTestRule.onNodeWithTag("settings_agent_logs_warning")
            .performScrollTo()
            .assertIsDisplayed()

        composeTestRule.onNodeWithTag("settings_agent_logs_cleanup")
            .performScrollTo()
            .performClick()

        assertTrue(cleanupRequested)
    }

    @Test
    fun cleanupConfirmationStatesRunsBytesAndKeepsTheCurrentRun() {
        var confirmed = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ConnectionSettingsScreen(
                    uiState = settingsState().copy(
                        agentLogs = AgentLogsUiState(
                            logs = oversizedLogs(),
                            cleanupConfirmVisible = true,
                        ),
                    ),
                    onBack = {},
                    onNameChanged = {},
                    onColorSelected = {},
                    onIconSelected = {},
                    onDefaultAgentSelected = {},
                    onDefaultWorkspaceChanged = {},
                    onCredentialSelected = {},
                    onSave = {},
                    onShowForgetConfirm = {},
                    onHideForgetConfirm = {},
                    onForget = {},
                    onShowLogsCleanup = {},
                    onHideLogsCleanup = {},
                    onCleanupLogs = { confirmed = true },
                    onReloadLogs = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("settings_agent_logs_cleanup_dialog")
            .assertIsDisplayed()
        composeTestRule.onNodeWithText("This deletes 2 runs and frees 5 MB.", substring = true)
            .assertIsDisplayed()
        composeTestRule.onNodeWithText("current run is kept", substring = true)
            .assertIsDisplayed()

        composeTestRule.onNodeWithTag("settings_agent_logs_cleanup_confirm")
            .performClick()

        assertTrue(confirmed)
    }

    @Test
    fun cleanupResultShowsTheFreedSize() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ConnectionSettingsScreen(
                    uiState = settingsState().copy(
                        agentLogs = AgentLogsUiState(
                            logs = oversizedLogs(),
                            cleanupResult = harold.android.contracts.LogCleanupResult(
                                deletedRuns = 2,
                                removedBytes = 5L * 1024 * 1024,
                            ),
                        ),
                    ),
                    onBack = {},
                    onNameChanged = {},
                    onColorSelected = {},
                    onIconSelected = {},
                    onDefaultAgentSelected = {},
                    onDefaultWorkspaceChanged = {},
                    onCredentialSelected = {},
                    onSave = {},
                    onShowForgetConfirm = {},
                    onHideForgetConfirm = {},
                    onForget = {},
                    onShowLogsCleanup = {},
                    onHideLogsCleanup = {},
                    onCleanupLogs = {},
                    onReloadLogs = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("settings_agent_logs_cleanup_result")
            .performScrollTo()
            .assertIsDisplayed()
        composeTestRule.onNodeWithText("Deleted 2 runs and freed 5 MB.", substring = true)
            .assertIsDisplayed()
    }

    private fun settingsState(): ConnectionSettingsUiState = ConnectionSettingsUiState(
        connectionId = "ssh://gary@127.0.0.1:2223",
        name = "Demo host",
        endpoint = "ssh://gary@127.0.0.1:2223",
        host = "127.0.0.1",
        port = "2223",
        user = "gary",
        fingerprint = "SHA256:abc123",
        authSummary = "Private key stored on this phone",
        colorId = "tide",
        iconId = "terminal",
        loaded = true,
    )

    private fun oversizedLogs(): HostLogs = HostLogs(
        agents = listOf(
            AgentLogs(
                agentId = "opencode",
                displayName = "OpenCode",
                hostRunning = true,
                activeRunId = "20260102T000000Z-2",
                runs = listOf(
                    LogRun(
                        id = "20260102T000000Z-2",
                        startedAt = Instant.parse("2026-01-02T00:00:00Z"),
                        outBytes = 512L * 1024 * 1024,
                        errBytes = 0,
                        active = true,
                    ),
                    LogRun(
                        id = "20260101T000000Z-1",
                        startedAt = Instant.parse("2026-01-01T00:00:00Z"),
                        outBytes = 5L * 1024 * 1024,
                        errBytes = 0,
                        active = false,
                    ),
                ),
            ),
            AgentLogs(
                agentId = "claude",
                displayName = "Claude Agent",
                hostRunning = false,
                activeRunId = "20260102T000000Z-2",
                runs = listOf(
                    LogRun(
                        id = "20260102T000000Z-2",
                        startedAt = Instant.parse("2026-01-02T00:00:00Z"),
                        outBytes = 1,
                        errBytes = 0,
                        active = true,
                    ),
                    LogRun(
                        id = "20260101T000000Z-1",
                        startedAt = Instant.parse("2026-01-01T00:00:00Z"),
                        outBytes = 1,
                        errBytes = 0,
                        active = false,
                    ),
                ),
            ),
        ),
        fetchedAt = Instant.parse("2026-11-17T15:00:00Z"),
    )
}
