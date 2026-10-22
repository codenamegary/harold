package harold.android.pairing

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import harold.android.ui.theme.HaroldTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class PairingScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsIconBackWithoutBackText() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                PairingScreen(
                    uiState = PairingUiState(),
                    onManualEntryClick = {},
                    onScannerClick = {},
                    onEndpointChanged = {},
                    onCodeChanged = {},
                    onSubmitManual = {},
                    onQrScanned = {},
                    onBack = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("pairing_back").assertIsDisplayed()
        composeTestRule.onAllNodesWithText("Back").assertCountEquals(0)
    }

    @Test
    fun confirmStepShowsTheNameAndChoices() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                PairingScreen(
                    uiState = PairingUiState(
                        phase = PairingPhase.Confirm,
                        name = "laptop",
                        colorId = "ink",
                        iconId = "mark",
                    ),
                    onManualEntryClick = {},
                    onScannerClick = {},
                    onEndpointChanged = {},
                    onCodeChanged = {},
                    onSubmitManual = {},
                    onQrScanned = {},
                    onBack = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("pairing_name_field").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("pairing_color_ink").performScrollTo().assertIsDisplayed().assertIsSelected()
        composeTestRule.onNodeWithTag("pairing_icon_mark").performScrollTo().assertIsDisplayed().assertIsSelected()
        composeTestRule.onNodeWithTag("pairing_confirm").performScrollTo().assertIsDisplayed()
    }
}
