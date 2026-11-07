package harold.android.ui.components

import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
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
class HaroldFormComponentsTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun segmentedControlSelectsOptionOnClick() {
        var selected by mutableStateOf("first")
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldSegmentedControl(
                    options = listOf(
                        HaroldSegmentOption("first", "First", testTag = "seg_first"),
                        HaroldSegmentOption("second", "Second", testTag = "seg_second"),
                    ),
                    selected = selected,
                    onSelect = { selected = it },
                )
            }
        }

        composeTestRule.onNodeWithTag("seg_first").assertIsSelected()
        composeTestRule.onNodeWithTag("seg_second").performClick()
        assertEquals("second", selected)
        composeTestRule.onNodeWithTag("seg_second").assertIsSelected()
    }

    @Test
    fun passwordFieldUpdatesValueAndTogglesVisibility() {
        var value by mutableStateOf("")
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldPasswordField(
                    value = value,
                    onValueChange = { value = it },
                    label = "SSH password",
                    fieldTestTag = "pwd_field",
                    visibilityToggleTag = "pwd_toggle",
                )
            }
        }

        composeTestRule.onNodeWithTag("pwd_field").performTextInput("secret123")
        assertEquals("secret123", value)
        composeTestRule.onNodeWithTag("pwd_toggle").assertIsDisplayed().performClick()
        composeTestRule.onNodeWithText("secret123").assertIsDisplayed()
    }

    @Test
    fun codeBoxRendersAndInvokesCopy() {
        var copied = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldCodeBox(
                    code = "ssh-ed25519 AAAA",
                    label = "Public key",
                    hint = "Add to authorized_keys",
                    copyLabel = "Copy public key",
                    copiedLabel = "Copied",
                    onCopy = { copied = true },
                    codeTestTag = "code_text",
                    copyButtonTestTag = "copy_btn",
                )
            }
        }

        composeTestRule.onNodeWithTag("code_text").assertIsDisplayed()
        composeTestRule.onNodeWithText("Copy public key").assertIsDisplayed()
        composeTestRule.onNodeWithTag("copy_btn").performClick()
        assertTrue(copied)
        composeTestRule.onNodeWithText("Copied").assertIsDisplayed()
    }

    @Test
    fun checkboxRowTogglesWhenRowOrBoxClicked() {
        var checked by mutableStateOf(false)
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldCheckboxRow(
                    checked = checked,
                    onCheckedChange = { checked = it },
                    label = "Save for reuse",
                    subtitle = "Encrypted on device",
                    checkboxTestTag = "reuse_cb",
                )
            }
        }

        composeTestRule.onNodeWithTag("reuse_cb").assertIsOff()
        composeTestRule.onNodeWithText("Save for reuse").performClick()
        assertTrue(checked)
        composeTestRule.onNodeWithTag("reuse_cb").assertIsOn()
    }

    @Test
    fun formSectionRendersTitleAndContent() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldFormSection(
                    title = "Authentication",
                    subtitle = "Choose how to sign in",
                ) {
                    Text(text = "Section body")
                }
            }
        }

        composeTestRule.onNodeWithText("Authentication").assertIsDisplayed()
        composeTestRule.onNodeWithText("Choose how to sign in").assertIsDisplayed()
        composeTestRule.onNodeWithText("Section body").assertIsDisplayed()
    }
}
