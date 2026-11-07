package harold.android.pairing

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import harold.android.credentials.SshCredentialKind
import harold.android.transport.ssh.GeneratedSshKey
import harold.android.ui.theme.HaroldTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class SshSetupScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsAuthModeSegmentedControlAndGeneratedPublicKey() {
        var selectedMode = SshAuthMode.GeneratedKey
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SshSetupScreen(
                    uiState = SshSetupUiState(
                        host = "laptop.local",
                        user = "gary",
                        generatedKey = GeneratedSshKey(
                            algorithm = "ed25519",
                            privateKeyPem = "pem",
                            publicKey = "ssh-ed25519 AAAA test@android",
                        ),
                    ),
                    onBack = {},
                    onHostChanged = {},
                    onPortChanged = {},
                    onUserChanged = {},
                    onNameChanged = {},
                    onAuthModeChanged = { selectedMode = it },
                    onImportedKeyChanged = {},
                    onPasswordChanged = {},
                    onColorSelected = {},
                    onIconSelected = {},
                    onTrustChanged = {},
                    onTest = {},
                    onSave = {},
                    onCredentialSelected = {},
                    onCredentialNameChanged = {},
                    onSaveCredentialForReuseChanged = {},
                    onDeleteCredential = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("ssh_auth_generate").performScrollTo().assertIsDisplayed().assertIsSelected()
        composeTestRule.onNodeWithTag("ssh_public_key").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("ssh_auth_password").performScrollTo().performClick()
        assertEquals(SshAuthMode.Password, selectedMode)
    }

    @Test
    fun switchesBetweenSavedCredentialAndNewCredentialModes() {
        var selectedCredentialId: String? = "key_1"
        val savedKey = SavedSshCredential(
            id = "key_1",
            name = "Work key",
            kind = SshCredentialKind.PrivateKey,
            publicKey = "ssh-ed25519 AAAA work",
        )
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SshSetupScreen(
                    uiState = SshSetupUiState(
                        savedCredentials = listOf(savedKey),
                        selectedCredentialId = selectedCredentialId,
                    ),
                    onBack = {},
                    onHostChanged = {},
                    onPortChanged = {},
                    onUserChanged = {},
                    onNameChanged = {},
                    onAuthModeChanged = {},
                    onImportedKeyChanged = {},
                    onPasswordChanged = {},
                    onColorSelected = {},
                    onIconSelected = {},
                    onTrustChanged = {},
                    onTest = {},
                    onSave = {},
                    onCredentialSelected = { selectedCredentialId = it },
                    onCredentialNameChanged = {},
                    onSaveCredentialForReuseChanged = {},
                    onDeleteCredential = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("ssh_credential_mode_saved").performScrollTo().assertIsDisplayed().assertIsSelected()
        composeTestRule.onNodeWithTag("ssh_saved_credential_key_1").performScrollTo().assertIsDisplayed().assertIsSelected()
        composeTestRule.onNodeWithTag("ssh_auth_generate").performScrollTo().performClick()
        assertEquals(null, selectedCredentialId)
    }

    @Test
    fun showsPasswordFieldWithVisibilityToggleInPasswordMode() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SshSetupScreen(
                    uiState = SshSetupUiState(
                        authMode = SshAuthMode.Password,
                        password = "my-secret-password",
                    ),
                    onBack = {},
                    onHostChanged = {},
                    onPortChanged = {},
                    onUserChanged = {},
                    onNameChanged = {},
                    onAuthModeChanged = {},
                    onImportedKeyChanged = {},
                    onPasswordChanged = {},
                    onColorSelected = {},
                    onIconSelected = {},
                    onTrustChanged = {},
                    onTest = {},
                    onSave = {},
                    onCredentialSelected = {},
                    onCredentialNameChanged = {},
                    onSaveCredentialForReuseChanged = {},
                    onDeleteCredential = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("ssh_password_field").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("ssh_password_visibility_toggle").performClick()
        composeTestRule.onNodeWithText("my-secret-password").assertIsDisplayed()
    }
}
