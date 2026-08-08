package server.agent.android.chat

import org.junit.Assert.assertEquals
import org.junit.Test

class MarkdownMessageTest {
    @Test
    fun appendsSuffixWhenTextGrows() {
        val update = markdownStreamUpdate("Hello ", "Hello **world**")

        assertEquals(MarkdownStreamUpdate.Append("**world**"), update)
    }

    @Test
    fun noChangeWhenTextUnchanged() {
        val update = markdownStreamUpdate("done", "done")

        assertEquals(MarkdownStreamUpdate.NoChange, update)
    }

    @Test
    fun restartsWhenTextIsReplaced() {
        val update = markdownStreamUpdate("draft answer", "final answer")

        assertEquals(MarkdownStreamUpdate.Restart, update)
    }

    @Test
    fun appendsFullTextFromEmptyBuffer() {
        val update = markdownStreamUpdate("", "# Title\n\nBody")

        assertEquals(MarkdownStreamUpdate.Append("# Title\n\nBody"), update)
    }
}
