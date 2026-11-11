package harold.android.ui.components

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
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
class HaroldAppearanceTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun pickerShowsColorAndIconChoicesAndReportsSelection() {
        var colorId by mutableStateOf("tide")
        var iconId by mutableStateOf("terminal")
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldAppearancePicker(
                    colorId = colorId,
                    iconId = iconId,
                    onColorSelected = { colorId = it },
                    onIconSelected = { iconId = it },
                    colorLabel = "Color",
                    iconLabel = "Icon",
                    colorTagPrefix = "test_color_",
                    iconTagPrefix = "test_icon_",
                )
            }
        }

        composeTestRule.onNodeWithTag("test_color_tide").assertIsDisplayed().assertIsSelected()
        composeTestRule.onNodeWithTag("test_color_leaf").performClick()
        assertEquals("leaf", colorId)
        composeTestRule.onNodeWithTag("test_color_leaf").assertIsSelected()

        composeTestRule.onNodeWithTag("test_icon_terminal").assertIsDisplayed().assertIsSelected()
        composeTestRule.onNodeWithTag("test_icon_bolt").performClick()
        assertEquals("bolt", iconId)
        composeTestRule.onNodeWithTag("test_icon_bolt").assertIsSelected()
    }

    @Test
    fun previewShowsNameAndEndpoint() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                HaroldAppearancePreview(
                    name = "Demo host",
                    colorId = "tide",
                    iconId = "terminal",
                    endpointSubtitle = "gary@127.0.0.1:2223",
                )
            }
        }

        composeTestRule.onNodeWithText("Demo host").assertIsDisplayed()
        composeTestRule.onNodeWithText("gary@127.0.0.1:2223").assertIsDisplayed()
    }
}
