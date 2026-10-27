package harold.android.ui.components

import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import harold.android.ui.theme.HaroldTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class HaroldButtonTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun haroldButtonTriggersOnClick() {
        var clicked = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldButton(
                    text = "Submit",
                    onClick = { clicked = true },
                    modifier = Modifier.testTag("submit_btn"),
                )
            }
        }

        composeTestRule.onNodeWithTag("submit_btn")
            .assertIsDisplayed()
            .assertIsEnabled()
            .assertHasClickAction()
            .performClick()

        assertTrue(clicked)
    }

    @Test
    fun haroldButtonSmallSizeRendersAndClicks() {
        var clicked = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldButton(
                    text = "Small action",
                    onClick = { clicked = true },
                    size = HaroldButtonSize.Small,
                    variant = HaroldButtonVariant.Secondary,
                    modifier = Modifier.testTag("small_btn"),
                )
            }
        }

        composeTestRule.onNodeWithTag("small_btn")
            .assertIsDisplayed()
            .assertIsEnabled()
            .performClick()

        assertTrue(clicked)
    }

    @Test
    fun haroldCardRendersContent() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldCard(modifier = Modifier.testTag("card")) {
                    Text(text = "Card content", modifier = Modifier.testTag("card_text"))
                }
            }
        }

        composeTestRule.onNodeWithTag("card").assertIsDisplayed()
        composeTestRule.onNodeWithTag("card_text").assertIsDisplayed()
    }
}
