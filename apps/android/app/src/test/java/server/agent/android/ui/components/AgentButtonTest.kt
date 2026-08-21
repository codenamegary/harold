package server.agent.android.ui.components

import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import server.agent.android.ui.theme.AgentServerTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class AgentButtonTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun agentButtonTriggersOnClickWhenEnabled() {
        var clicked = false
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                AgentButton(
                    onClick = { clicked = true },
                    variant = AgentButtonVariant.Primary,
                    size = AgentButtonSize.Medium,
                    modifier = Modifier.testTag("test_btn"),
                ) {
                    Text(text = "Confirm")
                }
            }
        }

        composeTestRule.onNodeWithTag("test_btn")
            .assertIsDisplayed()
            .assertIsEnabled()
            .assertHasClickAction()
            .performClick()

        assertTrue(clicked)
    }

    @Test
    fun agentButtonDoesNotClickWhenDisabled() {
        var clicked = false
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                AgentButton(
                    onClick = { clicked = true },
                    variant = AgentButtonVariant.Primary,
                    enabled = false,
                    modifier = Modifier.testTag("disabled_btn"),
                ) {
                    Text(text = "Disabled")
                }
            }
        }

        composeTestRule.onNodeWithTag("disabled_btn")
            .assertIsDisplayed()
            .assertIsNotEnabled()

        assertEquals(false, clicked)
    }

    @Test
    fun agentChipDisplaysLabelAndClicks() {
        var chipClicked = false
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                AgentChip(
                    onClick = { chipClicked = true },
                    label = "Start over",
                    variant = AgentButtonVariant.Frosted,
                    modifier = Modifier.testTag("test_chip"),
                )
            }
        }

        composeTestRule.onNodeWithTag("test_chip")
            .assertIsDisplayed()
            .assertIsEnabled()
            .performClick()

        composeTestRule.onNodeWithText("Start over").assertIsDisplayed()
        assertTrue(chipClicked)
    }

    @Test
    fun agentIconButtonSupportsAccessibilityAndClicks() {
        var iconClicked = false
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                AgentIconButton(
                    onClick = { iconClicked = true },
                    icon = { Text(text = "X") },
                    contentDescription = "Close dialog",
                    modifier = Modifier.testTag("test_icon_btn"),
                )
            }
        }

        composeTestRule.onNodeWithTag("test_icon_btn")
            .assertIsDisplayed()
            .assertIsEnabled()
            .performClick()

        assertTrue(iconClicked)
    }
}
