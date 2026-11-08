package harold.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
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
    fun swipingRevealsDeleteAndAsksForConfirmation() {
        var deleted = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                TestItem(onDelete = { deleted = true })
            }
        }

        composeTestRule.onNodeWithTag("delete_row").assertDoesNotExist()

        composeTestRule
            .onNodeWithTag("swipe_delete_row")
            .performTouchInput { swipeLeft() }

        composeTestRule.onNodeWithContentDescription("Delete").assertIsDisplayed()

        composeTestRule
            .onNodeWithTag("delete_row")
            .assertIsDisplayed()
            .performClick()

        composeTestRule.onNodeWithText("Delete row?").assertIsDisplayed()
        composeTestRule.onNodeWithText("This cannot be undone.").assertIsDisplayed()

        composeTestRule
            .onNodeWithTag("swipe_delete_confirm_action_row")
            .performClick()

        assertTrue(deleted)
    }

    @Test
    fun cancellingConfirmationDoesNotDelete() {
        var deleted = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                TestItem(onDelete = { deleted = true })
            }
        }

        composeTestRule
            .onNodeWithTag("swipe_delete_row")
            .performTouchInput { swipeLeft() }
        composeTestRule.onNodeWithTag("delete_row").performClick()
        composeTestRule
            .onNodeWithTag("swipe_delete_confirm_cancel_row")
            .performClick()

        assertTrue(!deleted)
        composeTestRule.onNodeWithTag("swipe_delete_confirm_row").assertDoesNotExist()
    }

    @Test
    fun confirmationCanBeDisabled() {
        var deleted = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                TestItem(
                    onDelete = { deleted = true },
                    confirmationEnabled = false,
                )
            }
        }

        composeTestRule
            .onNodeWithTag("swipe_delete_row")
            .performTouchInput { swipeLeft() }
        composeTestRule.onNodeWithTag("delete_row").performClick()

        assertTrue(deleted)
        composeTestRule.onNodeWithTag("swipe_delete_confirm_row").assertDoesNotExist()
    }
}

@Composable
private fun TestItem(
    onDelete: () -> Unit,
    confirmationEnabled: Boolean = true,
) {
    SwipeToDeleteListItem(
        rowTag = "row",
        deleteLabel = "Delete",
        onDelete = onDelete,
        deleteActionTag = "delete_row",
        confirmationEnabled = confirmationEnabled,
        confirmationTitle = "Delete row?",
        confirmationText = "This cannot be undone.",
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
