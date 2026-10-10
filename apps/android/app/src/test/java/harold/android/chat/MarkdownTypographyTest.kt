package harold.android.chat

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.TextUnit
import harold.android.ui.theme.HaroldTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class MarkdownTypographyTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun bodyKeepsTheThemeBodyLargeSize() {
        var body = TextUnit.Unspecified
        var expected = TextUnit.Unspecified

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                body = haroldMarkdownTypography().text.fontSize
                expected = MaterialTheme.typography.bodyLarge.fontSize
            }
        }
        composeTestRule.waitForIdle()

        assertEquals(expected, body)
    }

    @Test
    fun headingsStayCompactAndStepDown() {
        val sizes = mutableListOf<Float>()
        var body = 0f

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                val typography = haroldMarkdownTypography()
                body = typography.text.fontSize.value
                sizes += listOf(
                    typography.h1,
                    typography.h2,
                    typography.h3,
                    typography.h4,
                    typography.h5,
                    typography.h6,
                ).map { it.fontSize.value }
            }
        }
        composeTestRule.waitForIdle()

        assertEquals(6, sizes.size)
        assertTrue("h1 must be at most 24sp, was ${sizes.first()}", sizes.first() <= 24f)
        assertTrue("headings must not grow with depth: $sizes", sizes.zipWithNext().all { (a, b) -> a >= b })
        assertTrue("h6 must not be smaller than body ($body), was ${sizes.last()}", sizes.last() >= body)
    }
}
