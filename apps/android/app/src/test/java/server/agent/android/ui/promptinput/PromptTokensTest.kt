package server.agent.android.ui.promptinput

import androidx.compose.ui.text.TextRange
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PromptTokensTest {
    private val textPlugin = PromptPlugin(kind = "text")
    private val commandPlugin = PromptPlugin(
        kind = "command",
        match = matchTrigger("/", "command"),
    )
    private val mentionPlugin = PromptPlugin(
        kind = "mention",
        match = matchTrigger("@", "mention"),
    )
    private val plugins = listOf(textPlugin, commandPlugin, mentionPlugin)

    private fun token(kind: String, value: String, start: Int) =
        Token(kind = kind, value = value, start = start, end = start + value.length)

    private fun scan(text: String) = scanTokens(text, plugins).also { tokens ->
        assertTokensMatchValue(text, tokens)
    }

    @Test
    fun emptyTextHasNoTokens() {
        assertEquals(emptyList<Token>(), scan(""))
    }

    @Test
    fun textWithoutTriggersIsOneToken() {
        assertEquals(listOf(token("text", "hello world", 0)), scan("hello world"))
    }

    @Test
    fun matchedTokenIsFollowedByTheRemainingText() {
        assertEquals(
            listOf(token("command", "/cmd", 0), token("text", " foo", 4)),
            scan("/cmd foo"),
        )
    }

    @Test
    fun bareTriggerIsAToken() {
        assertEquals(listOf(token("command", "/", 0)), scan("/"))
    }

    @Test
    fun triggerMidWordStaysText() {
        assertEquals(listOf(token("text", "src/foo", 0)), scan("src/foo"))
        assertEquals(listOf(token("text", "https://x.com/a", 0)), scan("https://x.com/a"))
        assertEquals(listOf(token("text", "user@host", 0)), scan("user@host"))
    }

    @Test
    fun everyMatcherRunsInOneScan() {
        assertEquals(
            listOf(
                token("text", "see ", 0),
                token("command", "/cmd", 4),
                token("text", " and ", 8),
                token("mention", "@file", 13),
            ),
            scan("see /cmd and @file"),
        )
    }

    @Test
    fun triggerAfterANewlineStartsAToken() {
        assertEquals(
            listOf(token("command", "/cmd", 0), token("text", "\nmore", 4)),
            scan("/cmd\nmore"),
        )
        assertEquals(
            listOf(token("text", "  ", 0), token("command", "/x", 2)),
            scan("  /x"),
        )
    }

    @Test
    fun theFirstMatchingPluginWins() {
        val takeOne = PromptPlugin(
            kind = "short",
            match = { text, offset ->
                if (text[offset] == '/') {
                    Token(kind = "short", value = "/", start = offset, end = offset + 1)
                } else {
                    null
                }
            },
        )
        val takeAll = PromptPlugin(
            kind = "long",
            match = { text, offset ->
                if (text[offset] == '/') {
                    Token(
                        kind = "long",
                        value = text.substring(offset),
                        start = offset,
                        end = text.length,
                    )
                } else {
                    null
                }
            },
        )

        assertEquals(
            listOf(token("short", "/", 0), token("text", "xy", 1)),
            scanTokens("/xy", listOf(textPlugin, takeOne, takeAll)),
        )
        assertEquals(
            listOf(token("long", "/xy", 0)),
            scanTokens("/xy", listOf(textPlugin, takeAll, takeOne)),
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsPluginsWithoutATextPlugin() {
        scanTokens("hi", listOf(commandPlugin))
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsTwoTextPlugins() {
        scanTokens("hi", listOf(textPlugin, textPlugin))
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsTokensWithAGap() {
        val tokens = scan("hello /cmd ")
        assertTokensMatchValue("hello /cmd ", listOf(tokens.first(), tokens.last()))
    }

    @Test
    fun caretOnATokenEndIsInside() {
        val command = token("command", "/cmd", 6)

        assertTrue(caretIsInside(command, 6))
        assertTrue(caretIsInside(command, 10))
        assertFalse(caretIsInside(command, 5))
        assertFalse(caretIsInside(command, 11))
    }

    @Test
    fun caretOnABoundaryBelongsToTheTokenThatEndsThere() {
        val tokens = scan("look at /pl")

        assertEquals("/pl", tokenAtCaret(tokens, 10)?.value)
        assertEquals("/pl", tokenAtCaret(tokens, 11)?.value)
        assertEquals("text", tokenAtCaret(tokens, 8)?.kind)
        assertNull(tokenAtCaret(tokens, 99))
    }

    @Test
    fun rangeTouchesCoversCaretsAndSelections() {
        val command = token("command", "/cmd", 6)

        assertFalse(rangeTouches(command, TextRange(0)))
        assertTrue(rangeTouches(command, TextRange(6)))
        assertTrue(rangeTouches(command, TextRange(10)))
        assertTrue(rangeTouches(command, TextRange(0, 8)))
        assertFalse(rangeTouches(command, TextRange(10, 11)))
    }

    @Test
    fun looksCompleteWhenWhitespaceOrTheEndFollows() {
        val command = token("command", "/cmd", 0)

        assertTrue(looksComplete(command, "/cmd foo"))
        assertTrue(looksComplete(command, "/cmd\nmore"))
        assertTrue(looksComplete(command, "/cmd"))
        assertFalse(looksComplete(command, "/cmdx"))
    }

    @Test
    fun replaceTokenAddsATrailingSpace() {
        val edit = replaceToken("look at /pl", token("command", "/pl", 8), "/plan")

        assertEquals("look at /plan ", edit.text)
        assertEquals(TextRange(14), edit.selection)
    }

    @Test
    fun replaceTokenReusesASpaceThatAlreadyFollows() {
        val edit = replaceToken("look at /pl more", token("command", "/pl", 8), "/plan")

        assertEquals("look at /plan more", edit.text)
        assertEquals(TextRange(14), edit.selection)
    }
}
