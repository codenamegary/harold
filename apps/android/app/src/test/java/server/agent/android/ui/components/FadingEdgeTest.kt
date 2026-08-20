package server.agent.android.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import server.agent.android.ui.theme.AgentServerTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class FadingEdgeTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun fadingEdgeModifierRendersContentCleanly() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                Box(
                    modifier = Modifier
                        .size(100.dp)
                        .fadingEdge(top = 20.dp, bottom = 20.dp)
                        .testTag("fading_box"),
                ) {
                    Text(text = "Fading content")
                }
            }
        }

        composeTestRule.onNodeWithTag("fading_box").assertIsDisplayed()
    }
}
