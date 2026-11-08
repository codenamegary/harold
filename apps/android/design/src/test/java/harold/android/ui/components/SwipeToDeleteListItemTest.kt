package harold.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.unit.dp
import harold.android.ui.theme.HaroldTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class SwipeToDeleteListItemTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun swipingRevealsDeleteAndInvokesCallback() {
        var deleted = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SwipeToDeleteListItem(
                    rowTag = "row",
                    deleteLabel = "Delete",
                    onDelete = { deleted = true },
                    deleteActionTag = "delete_row",
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(64.dp)
                            .background(Color.Gray)
                            .testTag("row_content"),
                    ) {
                        Text(text = "Row")
                    }
                }
            }
        }

        composeTestRule.onNodeWithTag("delete_row").assertDoesNotExist()

        composeTestRule
            .onNodeWithTag("swipe_delete_row")
            .performTouchInput { swipeLeft() }

        composeTestRule
            .onNodeWithTag("delete_row")
            .assertIsDisplayed()
            .performClick()

        assertTrue(deleted)
    }
}
