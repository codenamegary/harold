package server.agent.android.chat.composer

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
    fun detectsSlashQueryAtEndOfComposer() {
        assertEquals("", activeSlashQuery("/"))
        assertEquals("pla", activeSlashQuery("hello /pla"))
        assertNull(activeSlashQuery("hello /pla world"))
        assertNull(activeSlashQuery("no slash here"))
        assertNull(activeSlashQuery("path/segment"))
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
    fun completesTrailingSlashToken() {
        assertEquals("hello /plan ", completeSlashCommand("hello /pla", "plan"))
        assertEquals("/review ", completeSlashCommand("/", "review"))
        assertEquals("untouched", completeSlashCommand("untouched", "plan"))
    }

    @Test
    fun removesTrailingSlashToken() {
        assertEquals("hello", removeTrailingSlashToken("hello /pla"))
        assertEquals("", removeTrailingSlashToken("/"))
        assertEquals("untouched", removeTrailingSlashToken("untouched"))
    }

    @Test
    fun insertsSlashShortcutWithSpacingRules() {
        assertEquals("/", insertSlashShortcut(""))
        assertEquals("draft /", insertSlashShortcut("draft"))
        assertEquals("draft /", insertSlashShortcut("draft "))
    }
}
