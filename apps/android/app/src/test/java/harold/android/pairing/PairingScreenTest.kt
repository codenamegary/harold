package harold.android.pairing

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
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
}
