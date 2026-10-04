package harold.android.chat

import org.junit.Assert.assertEquals
import org.junit.Test

class VoskHypothesisParserTest {
    @Test
    fun parsesPartialText() {
        assertEquals(
            "hello there",
            VoskHypothesisParser.partialText("""{"partial" : "hello there"}"""),
        )
    }

    @Test
    fun parsesFinalText() {
        assertEquals(
            "hello world",
            VoskHypothesisParser.finalText("""{"text" : "hello world"}"""),
        )
    }

    @Test
    fun emptyOrInvalidReturnsEmpty() {
        assertEquals("", VoskHypothesisParser.partialText(""))
        assertEquals("", VoskHypothesisParser.partialText("not-json"))
        assertEquals("", VoskHypothesisParser.finalText("""{"partial":"x"}"""))
    }
}
