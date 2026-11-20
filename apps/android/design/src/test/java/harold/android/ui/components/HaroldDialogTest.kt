package harold.android.ui.components

import android.view.MotionEvent
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import harold.android.ui.theme.HaroldTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowDialog

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class HaroldDialogTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun haroldDialogRendersTitleAndBodyAndConfirms() {
        var confirmed = 0
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldDialog(
                    onDismissRequest = {},
                    confirmLabel = "Open link",
                    onConfirm = { confirmed += 1 },
                    title = { Text(text = "Open this address?") },
                    body = { Text(text = "localhost:3000") },
                    dismissLabel = "Cancel",
                    confirmModifier = Modifier.testTag("dialog_confirm"),
                    dismissModifier = Modifier.testTag("dialog_dismiss"),
                )
            }
        }

        composeTestRule.onNodeWithText("Open this address?").assertIsDisplayed()
        composeTestRule.onNodeWithText("localhost:3000").assertIsDisplayed()

        composeTestRule.onNodeWithTag("dialog_confirm")
            .assertIsDisplayed()
            .assertIsEnabled()
            .performClick()

        assertEquals(1, confirmed)
    }

    @Test
    fun haroldDialogDismissButtonInvokesOnDismiss() {
        var dismissed = 0
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldDialog(
                    onDismissRequest = {},
                    confirmLabel = "Remove",
                    onConfirm = {},
                    dismissLabel = "Cancel",
                    onDismiss = { dismissed += 1 },
                    confirmModifier = Modifier.testTag("dialog_confirm"),
                    dismissModifier = Modifier.testTag("dialog_dismiss"),
                )
            }
        }

        composeTestRule.onNodeWithTag("dialog_dismiss")
            .assertIsDisplayed()
            .performClick()

        assertEquals(1, dismissed)
    }

    @Test
    fun haroldDialogWithoutDismissLabelRendersNoDismissButton() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldDialog(
                    onDismissRequest = {},
                    confirmLabel = "Close",
                    onConfirm = {},
                    dismissModifier = Modifier.testTag("dialog_dismiss"),
                )
            }
        }

        composeTestRule.onNodeWithText("Close").assertIsDisplayed()
        composeTestRule.onNodeWithTag("dialog_dismiss").assertDoesNotExist()
    }

    @Test
    fun haroldDialogBusyShowsSpinnerAndDisablesBothButtons() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldDialog(
                    onDismissRequest = {},
                    confirmLabel = "Open link",
                    onConfirm = {},
                    dismissLabel = "Cancel",
                    busy = true,
                    busyLabel = "Connecting",
                    confirmModifier = Modifier.testTag("dialog_confirm"),
                    dismissModifier = Modifier.testTag("dialog_dismiss"),
                )
            }
        }

        // The spinner sits inside the confirm button's merged semantics.
        composeTestRule
            .onNodeWithTag("harold_dialog_busy", useUnmergedTree = true)
            .assertIsDisplayed()
        composeTestRule.onNodeWithText("Connecting").assertIsDisplayed()
        composeTestRule.onNodeWithTag("dialog_confirm").assertIsNotEnabled()
        composeTestRule.onNodeWithTag("dialog_dismiss").assertIsNotEnabled()
    }

    @Test
    fun haroldDialogBusyIgnoresDismissRequest() {
        var dismissRequests = 0
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldDialog(
                    onDismissRequest = { dismissRequests += 1 },
                    confirmLabel = "Open link",
                    onConfirm = {},
                    dismissLabel = "Cancel",
                    busy = true,
                    confirmModifier = Modifier.testTag("dialog_confirm"),
                )
            }
        }

        tapOutsideDialog()

        assertEquals(0, dismissRequests)
        composeTestRule.onNodeWithTag("dialog_confirm").assertIsDisplayed()
    }

    @Test
    fun haroldDialogBusyWithoutBusyLabelKeepsConfirmLabel() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldDialog(
                    onDismissRequest = {},
                    confirmLabel = "Open link",
                    onConfirm = {},
                    busy = true,
                )
            }
        }

        composeTestRule.onNodeWithText("Open link").assertIsDisplayed()
    }

    @Test
    fun haroldDialogBusyConfirmTapDoesNotConfirm() {
        var confirmed = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldDialog(
                    onDismissRequest = {},
                    confirmLabel = "Open link",
                    onConfirm = { confirmed = true },
                    busy = true,
                    confirmModifier = Modifier.testTag("dialog_confirm"),
                )
            }
        }

        composeTestRule.onNodeWithTag("dialog_confirm").performClick()

        assertTrue(!confirmed)
    }

    /**
     * A scrim tap reaches the dialog window as a touch outside its content,
     * which is where Material requests a dismissal. Robolectric does not drive
     * window input itself, so the event goes straight to the shown dialog.
     */
    private fun tapOutsideDialog() {
        composeTestRule.waitForIdle()
        composeTestRule.runOnUiThread {
            val dialog = ShadowDialog.getLatestDialog()
            assertNotNull("HaroldDialog should be shown in a dialog window", dialog)
            val outsideX = 10_000f
            val outsideY = 10_000f
            val down = MotionEvent.obtain(0L, 0L, MotionEvent.ACTION_DOWN, outsideX, outsideY, 0)
            val up = MotionEvent.obtain(0L, 0L, MotionEvent.ACTION_UP, outsideX, outsideY, 0)
            try {
                dialog!!.onTouchEvent(down)
                dialog.onTouchEvent(up)
            } finally {
                down.recycle()
                up.recycle()
            }
        }
        composeTestRule.waitForIdle()
    }
}
