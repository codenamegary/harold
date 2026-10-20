package harold.android.stream

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SseEventParserTest {
    @Test
    fun dispatchesSingleLineDataOnBlankLine() {
        val parser = SseEventParser()

        assertNull(parser.feed("""data: {"type":"subscribed"}"""))
        assertEquals(SseEvent("""{"type":"subscribed"}"""), parser.feed(""))
    }

    @Test
    fun joinsMultipleDataLinesWithNewlines() {
        val parser = SseEventParser()

        assertNull(parser.feed("data: first"))
        assertNull(parser.feed("data: second"))
        assertEquals(SseEvent("first\nsecond"), parser.feed(""))
    }

    @Test
    fun heartbeatCommentBlockDispatchesNothing() {
        val parser = SseEventParser()

        assertNull(parser.feed(": ping"))
        assertNull(parser.feed(": keepalive 42"))
        assertNull(parser.feed(""))
    }

    @Test
    fun capturesTheEventIdAlongsideData() {
        val parser = SseEventParser()

        assertNull(parser.feed("event: session_update"))
        assertNull(parser.feed("id: epoch:17"))
        assertNull(parser.feed("retry: 2500"))
        assertNull(parser.feed("""data: {"type":"subscribed"}"""))
        assertEquals(
            SseEvent("""{"type":"subscribed"}""", id = "epoch:17"),
            parser.feed(""),
        )
    }

    @Test
    fun stripsASingleSpaceAfterTheFieldColon() {
        val parser = SseEventParser()

        assertNull(parser.feed("data: one space"))
        assertEquals("one space", parser.feed("")?.data)

        assertNull(parser.feed("data:  two spaces"))
        assertEquals(" two spaces", parser.feed("")?.data)
    }

    @Test
    fun colonlessDataFieldCarriesAnEmptyValue() {
        val parser = SseEventParser()

        assertNull(parser.feed("data"))
        assertNull(parser.feed(""))
    }

    @Test
    fun consecutiveEventsDoNotLeakDataOrIdsBetweenThem() {
        val parser = SseEventParser()

        assertNull(parser.feed("id: first"))
        assertNull(parser.feed("data: a"))
        assertEquals(SseEvent("a", id = "first"), parser.feed(""))
        assertNull(parser.feed("data: b"))
        assertEquals(SseEvent("b"), parser.feed(""))
    }

    @Test
    fun otherColonlessFieldsAreIgnored() {
        val parser = SseEventParser()

        assertNull(parser.feed("event"))
        assertNull(parser.feed("""data: {"ok":true}"""))
        assertEquals("""{"ok":true}""", parser.feed("")?.data)
    }
}
