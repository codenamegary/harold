package harold.android.chat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import harold.android.network.LoopbackAddress
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import harold.android.ui.theme.HaroldTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class MarkdownMessageComposeTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun paintsCompletedTextOnTheFirstFrame() {
        composeTestRule.mainClock.autoAdvance = false

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                MarkdownMessage(text = "Added.")
            }
        }

        composeTestRule.onNodeWithText("Added.").assertIsDisplayed()
    }

    @Test
    fun clickingAMarkedLoopbackLinkAsksForAForward() {
        val requested = mutableListOf<LoopbackAddress>()
        val opened = mutableListOf<String>()
        composeTestRule.setContent {
            RecordingUriHandler(opened) {
                HaroldTheme(dynamicColor = false) {
                    MarkdownMessage(
                        text = "Dev server: localhost:5173",
                        onLoopbackLink = { address -> requested += address },
                    )
                }
            }
        }

        composeTestRule.linkNodes().onFirst().performSemanticsAction(SemanticsActions.OnClick)

        assertEquals(listOf(LoopbackAddress(host = "localhost", port = 5173)), requested)
        assertTrue(opened.isEmpty())
    }

    @Test
    fun clickingAForeignLinkUsesTheUriHandler() {
        val requested = mutableListOf<LoopbackAddress>()
        val opened = mutableListOf<String>()
        composeTestRule.setContent {
            RecordingUriHandler(opened) {
                HaroldTheme(dynamicColor = false) {
                    MarkdownMessage(
                        text = "Docs: https://docs.example.com",
                        onLoopbackLink = { address -> requested += address },
                    )
                }
            }
        }

        composeTestRule.linkNodes().onFirst().performSemanticsAction(SemanticsActions.OnClick)

        assertEquals(listOf("https://docs.example.com"), opened)
        assertTrue(requested.isEmpty())
    }

    @Test
    fun tagsOnlyTheLoopbackLinkInACompletedMessage() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                MarkdownMessage(text = "Docs: https://docs.example.com. Dev server: localhost:5173")
            }
        }

        composeTestRule.onNodeWithTag("markdown_message").assertExists()

        val paragraphs = composeTestRule
            .onAllNodesWithText("localhost:5173", substring = true)
            .fetchSemanticsNodes()
            .flatMap { node -> node.config.getOrNull(SemanticsProperties.Text).orEmpty() }
            .distinct()
        val tagged = paragraphs.flatMap { paragraph ->
            paragraph.getStringAnnotations(DEV_SERVER_LINK_TAG, 0, paragraph.length)
                .map { annotation -> paragraph to annotation }
        }

        assertEquals(1, tagged.size)
        val (paragraph, tag) = tagged.single()
        assertTrue(
            "loopback label carries the mark: ${paragraph.text}",
            paragraph.text.contains(DEV_SERVER_LINK_MARK + "localhost:5173"),
        )
        assertTrue(
            "ordinary link is still rendered: ${paragraph.text}",
            paragraph.text.contains("docs.example.com"),
        )
        assertEquals("localhost:5173", paragraph.text.substring(tag.start, tag.end))
    }

    /**
     * The links inside a rendered message, in text order. Compose exposes one
     * semantics node per link, so a click does not need a text coordinate.
     */
    private fun ComposeContentTestRule.linkNodes() = onAllNodes(
        SemanticsMatcher.keyIsDefined(SemanticsProperties.LinkTestMarker),
    )
}

/** Stands in for the platform browser so a click can be observed. */
@Composable
private fun RecordingUriHandler(
    opened: MutableList<String>,
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(
        LocalUriHandler provides remember {
            object : UriHandler {
                override fun openUri(uri: String) {
                    opened += uri
                }
            }
        },
        content = content,
    )
}
