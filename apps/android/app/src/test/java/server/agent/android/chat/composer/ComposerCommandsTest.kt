package server.agent.android.chat.composer

import androidx.compose.ui.text.TextRange
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import server.agent.android.contracts.AvailableCommand

class ComposerCommandsTest {
    private val catalog = listOf(
        AvailableCommand(name = "plan", description = "Draft a plan"),
        AvailableCommand(name = "search", description = "Plan-free web search"),
        AvailableCommand(name = "review", description = "Review the changes"),
    )

    @Test
    fun detectsTheCommandQueryUnderTheCaret() {
        assertEquals("", activeCommandQuery("/", TextRange(1)))
        assertEquals("pla", activeCommandQuery("hello /pla", TextRange(10)))
        assertEquals("pla", activeCommandQuery("hello /pla", TextRange(8)))
    }

    @Test
    fun detectsACommandQueryMidSentence() {
        assertEquals("pla", activeCommandQuery("hello /pla world", TextRange(10)))
    }

    @Test
    fun hasNoQueryWhenTheCaretSitsOutsideTheToken() {
        assertNull(activeCommandQuery("hello /pla world", TextRange(16)))
        assertNull(activeCommandQuery("hello /pla", TextRange(6)))
        assertNull(activeCommandQuery("no slash here", TextRange(13)))
        assertNull(activeCommandQuery("path/segment", TextRange(12)))
    }

    @Test
    fun hasNoQueryWhileTextIsSelected() {
        assertNull(activeCommandQuery("hello /pla", TextRange(6, 10)))
    }

    @Test
    fun emptyQueryKeepsCatalogOrder() {
        assertEquals(catalog, filterCommands(catalog, ""))
    }

    @Test
    fun ranksNameMatchesAboveDescriptionMatches() {
        val matches = filterCommands(catalog, "plan")

        assertEquals(listOf("plan", "search"), matches.map { command -> command.name })
    }

    @Test
    fun dropsCommandsWithoutAnyMatch() {
        assertEquals(emptyList<AvailableCommand>(), filterCommands(catalog, "zzz"))
    }

    @Test
    fun completesTheCommandUnderTheCaret() {
        val edit = completeSlashCommand("hello /pla", TextRange(10), "plan")

        assertEquals("hello /plan ", edit.text)
        assertEquals(TextRange(12), edit.selection)
    }

    @Test
    fun completesMidSentenceWithoutDoublingTheSpace() {
        val edit = completeSlashCommand("hello /pla world", TextRange(10), "plan")

        assertEquals("hello /plan world", edit.text)
        assertEquals(TextRange(12), edit.selection)
    }

    @Test
    fun completingWithoutAnActiveTokenChangesNothing() {
        val edit = completeSlashCommand("untouched", TextRange(9), "plan")

        assertEquals("untouched", edit.text)
        assertEquals(TextRange(9), edit.selection)
    }

    @Test
    fun removesTheCommandTokenUnderTheCaret() {
        assertEquals("hello", removeCommandToken("hello /pla", TextRange(10)).text)
        assertEquals("", removeCommandToken("/", TextRange(1)).text)
        assertEquals("untouched", removeCommandToken("untouched", TextRange(9)).text)
    }

    @Test
    fun removingAMidSentenceTokenKeepsTheSurroundingText() {
        val edit = removeCommandToken("hello /pla world", TextRange(10))

        assertEquals("hello  world", edit.text)
        assertEquals(TextRange(6), edit.selection)
    }

    @Test
    fun insertsSlashShortcutWithSpacingRules() {
        assertEquals("/", insertSlashShortcut(""))
        assertEquals("draft /", insertSlashShortcut("draft"))
        assertEquals("draft /", insertSlashShortcut("draft "))
    }
}
