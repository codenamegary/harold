package harold.android.chat

import androidx.compose.material3.Badge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getUnclippedBoundsInRoot
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
class BadgeDiagnosticTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun dumpBadgeCases() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                Text("10", modifier = Modifier.testTag("plain_text"))
                Text(
                    "10",
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.testTag("label_small_text"),
                )
                Text(
                    "10",
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.testTag("body_large_text"),
                )
                Badge(modifier = Modifier.testTag("badge_default")) { Text("10") }
                Badge(modifier = Modifier.testTag("badge_label_small")) {
                    Text("10", style = MaterialTheme.typography.labelSmall)
                }
                Badge(modifier = Modifier.testTag("badge_maxlines")) {
                    Text("10", maxLines = 1, softWrap = false)
                }
                println("bodyLarge=" + MaterialTheme.typography.bodyLarge)
                println("labelSmall=" + MaterialTheme.typography.labelSmall)
                println("labelMedium=" + MaterialTheme.typography.labelMedium)
            }
        }
        for (tag in listOf(
            "plain_text",
            "label_small_text",
            "body_large_text",
            "badge_default",
            "badge_label_small",
            "badge_maxlines",
        )) {
            println("$tag = " + composeTestRule.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot())
        }
    }
}
