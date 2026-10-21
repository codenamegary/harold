package harold.android.pairing

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import harold.android.ui.theme.HaroldTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class SavedHaroldsScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsEachHaroldNameColorAndIcon() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SavedHaroldsScreen(
                    uiState = SavedHaroldsUiState(
                        rows = listOf(
                            SavedHaroldRow(
                                serverOrigin = "http://laptop.local:3847",
                                deviceId = "device_laptop",
                                name = "laptop",
                                colorId = "tide",
                                iconId = "bolt",
                            ),
                        ),
                    ),
                    onBack = {},
                    onEdit = {},
                    onRemove = {},
                    onNameChanged = {},
                    onColorSelected = {},
                    onIconSelected = {},
                    onSave = {},
                    onCancelEdit = {},
                )
            }
        }

        composeTestRule.onNodeWithText("laptop").assertIsDisplayed()
        composeTestRule.onNodeWithText("tide · bolt").assertIsDisplayed()
    }
}
