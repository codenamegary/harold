package harold.android.chat

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import harold.android.ui.theme.HaroldTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class WorkspacesScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsIconBackWithoutBackText() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                WorkspacesScreen(
                    uiState = WorkspacesUiState(loadState = WorkspacesLoadState.Empty),
                    onBack = {},
                    onAddClick = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("workspaces_back").assertIsDisplayed()
        composeTestRule.onAllNodesWithText("Back").assertCountEquals(0)
    }
}
