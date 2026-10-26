package harold.android.chat

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import harold.android.ui.theme.HaroldTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class SessionsScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun emptyCacheShowsSkeletonRowsWhileLoading() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SessionsListContent(
                    uiState = SessionsUiState(loading = true),
                    onSearchChanged = {},
                    onSessionClick = {},
                    onDeleteSession = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("sessions_list_loading").assertIsDisplayed()
    }
}
