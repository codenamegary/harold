package harold.android.connections

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import harold.android.credentials.SshCredential
import harold.android.credentials.SshCredentialKind
import harold.android.ui.theme.HaroldTheme
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
}
