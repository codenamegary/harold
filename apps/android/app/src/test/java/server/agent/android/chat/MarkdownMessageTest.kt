package server.agent.android.chat

import org.junit.Assert.assertEquals
import org.junit.Test

class MarkdownMessageTest {
    @Test
    fun splitsFencedCodeFromProse() {
        val segments = splitMarkdownSegments(
            """
            Hello **world**

            ```
            code here
            ```

            Done
            """.trimIndent(),
        )

        assertEquals(3, segments.size)
        assertEquals(MarkdownSegment.Prose("Hello **world**"), segments[0])
        assertEquals(MarkdownSegment.Code("code here\n"), segments[1])
        assertEquals(MarkdownSegment.Prose("Done"), segments[2])
    }

    @Test
    fun stylesInlineBoldAndCode() {
        val styled = styleInlineMarkdown("use `token` and **bold** text")
        assertEquals("use token and bold text", styled.text)
    }
}
