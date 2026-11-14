package harold.android.ui.components

import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import harold.android.ui.theme.HaroldTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class HaroldFormScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsTitleBodyAndBackAction() {
        var backClicks = 0
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldFormScreen(
                    title = "SSH host",
                    onBack = { backClicks++ },
                    backContentDescription = "Back",
                    backTestTag = "form_back",
                ) {
                    Text(text = "Form body", modifier = Modifier.testTag("form_body"))
                }
            }
        }

        composeTestRule.onNodeWithText("SSH host").assertIsDisplayed()
        composeTestRule.onNodeWithTag("form_body").assertIsDisplayed()
        composeTestRule.onNodeWithTag("form_back").performClick()
        assertEquals(1, backClicks)
    }
}
