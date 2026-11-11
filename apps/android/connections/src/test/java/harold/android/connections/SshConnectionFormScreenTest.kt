package harold.android.connections

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import harold.android.credentials.SshCredentialKind
import harold.android.ui.components.HaroldFormSection
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
class SshConnectionFormScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun addModeOrdersNameConnectionAuthTestAppearanceAndSave() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SshConnectionFormScreen(
                    state = addState(),
                    actions = noopActions(),
                )
            }
        }

        composeTestRule.onNodeWithTag("ssh_connection_section").assertExists()
        composeTestRule.onNodeWithTag("ssh_auth_section").assertExists()
        composeTestRule.onNodeWithTag("ssh_appearance_section").assertExists()
        composeTestRule.onNodeWithTag("ssh_test_button").assertExists()
        composeTestRule.onNodeWithTag("ssh_save_button").assertExists()
        composeTestRule.onAllNodesWithTag("ssh_name_field").assertCountEquals(1)

        assertTrue(topOf("ssh_name_field") < topOf("ssh_host_field"))
        assertTrue(topOf("ssh_test_button") < topOf("ssh_appearance_section"))
        assertTrue(topOf("ssh_appearance_section") < topOf("ssh_save_button"))
    }

    @Test
    fun testFailureErrorSitsBelowTheTestButton() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SshConnectionFormScreen(
                    state = addState().copy(errorMessage = "Could not connect to the host."),
                    actions = noopActions(),
                )
            }
        }

        composeTestRule.onNodeWithTag("ssh_error").performScrollTo().assertIsDisplayed()
        assertTrue(topOf("ssh_test_button") < topOf("ssh_error"))
        assertTrue(topOf("ssh_error") < topOf("ssh_appearance_section"))
    }

    @Test
    fun credentialNameSitsAboveTheGeneratedPublicKey() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SshConnectionFormScreen(
                    state = addState(),
                    actions = noopActions(),
                )
            }
        }

        assertTrue(topOf("ssh_credential_name_field") < topOf("ssh_public_key"))
    }

    @Test
    fun credentialNameIsFirstBelowTheDropdownForEachNewCredentialMode() {
        var state by mutableStateOf(addState(authMode = SshAuthMode.GeneratedKey))
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SshConnectionFormScreen(
                    state = state,
                    actions = noopActions(),
                )
            }
        }

        assertTrue(topOf("ssh_auth_dropdown") < topOf("ssh_credential_name_field"))
        assertTrue(topOf("ssh_credential_name_field") < topOf("ssh_public_key"))

        state = addState(authMode = SshAuthMode.ImportedKey)
        composeTestRule.waitForIdle()
        assertTrue(topOf("ssh_credential_name_field") < topOf("ssh_imported_key_field"))

        state = addState(authMode = SshAuthMode.Password)
        composeTestRule.waitForIdle()
        assertTrue(topOf("ssh_credential_name_field") < topOf("ssh_password_field"))
    }

    @Test
    fun addModeAuthDropdownListsSavedAndNewCredentialsAndReportsSelection() {
        var authMode = SshAuthMode.GeneratedKey
        var selectedCredentialId: String? = null
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SshConnectionFormScreen(
                    state = addState(
                        savedCredentials = listOf(
                            SavedSshCredential(
                                id = "key_1",
                                name = "Work key",
                                kind = SshCredentialKind.PrivateKey,
                                publicKey = "ssh-ed25519 AAAA work",
                            ),
                        ),
                    ),
                    actions = noopActions().copy(
                        onAuthModeChanged = { authMode = it },
                        onCredentialSelected = { selectedCredentialId = it },
                    ),
                )
            }
        }

        composeTestRule.onNodeWithTag("ssh_auth_dropdown").performScrollTo().performClick()
        composeTestRule.onNodeWithTag("ssh_auth_generate").assertIsDisplayed()
        composeTestRule.onNodeWithTag("ssh_auth_import").assertIsDisplayed()
        composeTestRule.onNodeWithTag("ssh_auth_password").assertIsDisplayed()
        composeTestRule.onNodeWithTag("ssh_saved_credential_key_1").assertIsDisplayed()

        composeTestRule.onNodeWithTag("ssh_auth_password").performClick()
        assertEquals(SshAuthMode.Password, authMode)
        assertEquals(null, selectedCredentialId)

        composeTestRule.onNodeWithTag("ssh_auth_dropdown").performClick()
        composeTestRule.onNodeWithTag("ssh_saved_credential_key_1").performClick()
        assertEquals("key_1", selectedCredentialId)
    }

    @Test
    fun selectedSavedCredentialShowsItsPublicKeyWithoutANewCredentialName() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SshConnectionFormScreen(
                    state = addState(
                        savedCredentials = listOf(
                            SavedSshCredential(
                                id = "key_1",
                                name = "Work key",
                                kind = SshCredentialKind.PrivateKey,
                                publicKey = "ssh-ed25519 AAAA work",
                            ),
                        ),
                        selectedCredentialId = "key_1",
                    ),
                    actions = noopActions(),
                )
            }
        }

        composeTestRule.onNodeWithTag("ssh_public_key").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithText("ssh-ed25519 AAAA work").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("ssh_credential_name_field").assertCountEquals(0)
    }

    @Test
    fun editModeReusesTheFormWithReadOnlyConnectionAndExtraSections() {
        var selectedCredentialId: String? = null
        val editTags = editTags()
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SshConnectionFormScreen(
                    state = editState(
                        savedCredentials = listOf(
                            SavedSshCredential(
                                id = "key_1",
                                name = "Work key",
                                kind = SshCredentialKind.PrivateKey,
                                publicKey = "ssh-ed25519 AAAA work",
                            ),
                        ),
                    ),
                    actions = noopActions().copy(
                        onCredentialSelected = { selectedCredentialId = it },
                    ),
                    tags = editTags,
                    editExtras = {
                        HaroldFormSection(
                            title = "Defaults",
                            modifier = Modifier.testTag("settings_defaults_section"),
                        ) {}
                        HaroldFormSection(
                            title = "Danger zone",
                            modifier = Modifier.testTag("settings_danger_section"),
                        ) {}
                    },
                )
            }
        }

        composeTestRule.onNodeWithTag("settings_name").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("settings_endpoint").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithText("127.0.0.1").assertIsDisplayed()
        composeTestRule.onNodeWithTag("settings_fingerprint").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("settings_auth_summary").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("settings_defaults_section").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("settings_danger_section").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("settings_save").performScrollTo().assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("ssh_test_button").assertCountEquals(0)

        composeTestRule.onNodeWithTag("settings_credential_picker").performScrollTo().performClick()
        composeTestRule.onNodeWithTag("settings_credential_keep").assertIsDisplayed()
        composeTestRule.onNodeWithTag("settings_credential_key_1").performClick()
        assertEquals("key_1", selectedCredentialId)
    }

    private fun topOf(tag: String): Float =
        composeTestRule.onNodeWithTag(tag).fetchSemanticsNode().positionInRoot.y

    private fun addState(
        savedCredentials: List<SavedSshCredential> = emptyList(),
        selectedCredentialId: String? = null,
        authMode: SshAuthMode = SshAuthMode.GeneratedKey,
    ): SshConnectionFormState = SshConnectionFormState(
        mode = SshConnectionFormMode.Add,
        name = "Demo host",
        host = "127.0.0.1",
        port = "2223",
        user = "gary",
        authMode = authMode,
        savedCredentials = savedCredentials,
        selectedCredentialId = selectedCredentialId,
        publicKey = "ssh-ed25519 AAAA generated",
        importedKey = "",
        password = "",
        credentialName = "Demo SSH key",
        colorId = "tide",
        iconId = "terminal",
        testing = false,
        testedFingerprint = null,
        trusted = false,
        canTest = true,
        canSave = false,
        errorMessage = null,
        endpointPreview = "gary@127.0.0.1:2223",
    )

    private fun editState(
        savedCredentials: List<SavedSshCredential> = emptyList(),
    ): SshConnectionFormState = SshConnectionFormState(
        mode = SshConnectionFormMode.Edit,
        name = "Demo host",
        host = "127.0.0.1",
        port = "2223",
        user = "gary",
        authMode = SshAuthMode.GeneratedKey,
        savedCredentials = savedCredentials,
        selectedCredentialId = null,
        publicKey = null,
        importedKey = "",
        password = "",
        credentialName = "",
        colorId = "tide",
        iconId = "terminal",
        testing = false,
        testedFingerprint = null,
        trusted = false,
        canTest = false,
        canSave = true,
        errorMessage = null,
        endpointPreview = "ssh://gary@127.0.0.1:2223",
        savedFingerprint = "SHA256:abc123",
        currentAuthSummary = "Private key stored on this phone",
    )

    private fun editTags(): SshFormTags = SshFormTags(
        back = "settings_back",
        name = "settings_name",
        host = "settings_endpoint",
        user = "settings_user",
        port = "settings_port",
        fingerprint = "settings_fingerprint",
        authDropdown = "settings_credential_picker",
        authSummary = "settings_auth_summary",
        colorPrefix = "settings_color_",
        iconPrefix = "settings_icon_",
        save = "settings_save",
        error = "settings_error",
        savedCredentialPrefix = "settings_credential_",
        keepCurrentOption = "settings_credential_keep",
    )

    private fun noopActions(): SshConnectionFormActions = SshConnectionFormActions(
        onBack = {},
        onNameChanged = {},
        onColorSelected = {},
        onIconSelected = {},
        onSave = {},
    )
}
