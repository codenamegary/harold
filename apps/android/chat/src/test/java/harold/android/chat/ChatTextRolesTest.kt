package harold.android.chat

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import harold.android.ui.theme.HaroldTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class ChatTextRolesTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun exposesTheNamedChatRoles() {
        var roles: ChatTextRoles? = null

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                roles = chatTextRoles()
            }
        }
        composeTestRule.waitForIdle()

        val resolved = requireNotNull(roles)
        assertEquals(16.sp, resolved.prompt.fontSize)
        assertEquals(FontWeight.Medium, resolved.prompt.fontWeight)
        assertEquals(16.sp, resolved.body.fontSize)
        assertEquals(FontWeight.Normal, resolved.body.fontWeight)
        assertEquals(12.sp, resolved.meta.fontSize)
        assertEquals(FontFamily.Monospace, resolved.meta.fontFamily)
        assertEquals(13.sp, resolved.thinking.fontSize)
        assertEquals(FontStyle.Italic, resolved.thinking.fontStyle)
    }
}
