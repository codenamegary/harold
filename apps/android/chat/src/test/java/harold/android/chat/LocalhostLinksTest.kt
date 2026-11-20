package harold.android.chat

import org.junit.Assert.assertEquals
import org.junit.Test

class LocalhostLinksTest {
    @Test
    fun leavesAnEmptyMessageAlone() {
        assertEquals("", linkifyLoopbackUrls(""))
    }

    @Test
    fun decoratesBothFormsAgentsPrint() {
        val text = "Local: http://localhost:8765/\nNetwork: localhost:8765"
        assertEquals(
            "Local: [http://localhost:8765/](http://localhost:8765/)\n" +
                "Network: [localhost:8765](http://localhost:8765/)",
            linkifyLoopbackUrls(text),
        )
    }

    @Test
    fun keepsTheOriginalLabel() {
        assertEquals(
            "Serving [http://127.0.0.1:3000/app](http://127.0.0.1:3000/app)",
            linkifyLoopbackUrls("Serving http://127.0.0.1:3000/app"),
        )
    }

    @Test
    fun leavesForeignHostsAlone() {
        assertEquals(
            "See http://example.com:3000 and 192.168.1.5:3000",
            linkifyLoopbackUrls("See http://example.com:3000 and 192.168.1.5:3000"),
        )
    }

    @Test
    fun leavesFencedCodeAlone() {
        val text = "Run this:\n```\ncurl http://localhost:8765/health\n```\nDone"
        assertEquals(text, linkifyLoopbackUrls(text))
    }

    @Test
    fun leavesAFencedBlockInsideABlockQuoteAlone() {
        val text = "Run it:\n> ~~~\n> curl http://localhost:8765/health\n> ~~~\nDone"
        assertEquals(text, linkifyLoopbackUrls(text))
    }

    @Test
    fun leavesAnEscapedAddressAlone() {
        assertEquals(
            "Escaped \\localhost:3000 and \\http://localhost:4000",
            linkifyLoopbackUrls("Escaped \\localhost:3000 and \\http://localhost:4000"),
        )
    }

    @Test
    fun leavesInlineCodeAlone() {
        val text = "It listens on `localhost:8765` when ready"
        assertEquals(text, linkifyLoopbackUrls(text))
    }

    @Test
    fun leavesAnExistingLinkAlone() {
        val text = "[open the app](http://localhost:3000/start)"
        assertEquals(text, linkifyLoopbackUrls(text))
    }

    @Test
    fun stopsAtSentencePunctuation() {
        assertEquals(
            "Open [http://localhost:3000/](http://localhost:3000/).",
            linkifyLoopbackUrls("Open http://localhost:3000/."),
        )
    }

    @Test
    fun linksAnAddressBeforeASentencePeriodMidParagraph() {
        assertEquals(
            "Dev at [http://localhost:5173](http://localhost:5173/). Open it.",
            linkifyLoopbackUrls("Dev at http://localhost:5173. Open it."),
        )
    }

    @Test
    fun linksABareAddressBeforeAFinalPeriod() {
        assertEquals(
            "Dev at [localhost:5173](http://localhost:5173/).",
            linkifyLoopbackUrls("Dev at localhost:5173."),
        )
    }

    @Test
    fun linksAnAddressBeforeAClosingBracketAndComma() {
        assertEquals(
            "See ([http://localhost:5173](http://localhost:5173/)), then open it",
            linkifyLoopbackUrls("See (http://localhost:5173), then open it"),
        )
    }

    @Test
    fun linksAnAddressAtTheEndOfTheInput() {
        assertEquals(
            "Dev at [http://localhost:5173](http://localhost:5173/)",
            linkifyLoopbackUrls("Dev at http://localhost:5173"),
        )
    }

    @Test
    fun leavesALongerTokenAlone() {
        assertEquals("localhost:5173abc", linkifyLoopbackUrls("localhost:5173abc"))
        assertEquals("127.0.0.10:5173", linkifyLoopbackUrls("127.0.0.10:5173"))
        assertEquals("localhost:5173.5", linkifyLoopbackUrls("localhost:5173.5"))
    }

    @Test
    fun doesNotTreatTimeOrVersionsAsHosts() {
        assertEquals("At 12:30 we ship v1.2.3", linkifyLoopbackUrls("At 12:30 we ship v1.2.3"))
    }

    @Test
    fun keepsBoldMarkersOutsideTheLink() {
        assertEquals(
            "**Serving [http://127.0.0.1:8765/](http://127.0.0.1:8765/)**",
            linkifyLoopbackUrls("**Serving http://127.0.0.1:8765/**"),
        )
    }

    @Test
    fun leavesALinkWhoseLabelIsALoopbackAddressAlone() {
        val text = "[localhost:3000](http://localhost:3000)"
        assertEquals(text, linkifyLoopbackUrls(text))
    }

    @Test
    fun leavesAutolinksAlone() {
        val text = "See <http://localhost:3000> or <localhost:3000> for the dev server"
        assertEquals(text, linkifyLoopbackUrls(text))
    }

    @Test
    fun leavesReferenceDefinitionsAndTheirUsesAlone() {
        val text = "[dev]: http://localhost:3000/start\n\nOpen [dev] or [the app][dev]"
        assertEquals(text, linkifyLoopbackUrls(text))
    }

    @Test
    fun leavesImagesAlone() {
        val alt = "![dev server](http://localhost:3000/shot.png)"
        assertEquals(alt, linkifyLoopbackUrls(alt))
        val loopbackAlt = "![localhost:3000](http://localhost:3000/shot.png)"
        assertEquals(loopbackAlt, linkifyLoopbackUrls(loopbackAlt))
    }

    @Test
    fun leavesLinkTitlesAlone() {
        val titled = "[x](http://localhost:3000 \"dev server\")"
        assertEquals(titled, linkifyLoopbackUrls(titled))
        val loopbackLabel = "[localhost:3000](http://localhost:3000 \"dev server\")"
        assertEquals(loopbackLabel, linkifyLoopbackUrls(loopbackLabel))
    }

    @Test
    fun stopsAtADanglingReferenceDefinition() {
        val text = "[dev]: localhost:3000/start"
        assertEquals(text, linkifyLoopbackUrls(text))
    }

    @Test
    fun keepsIPv6LiteralLinksWorking() {
        assertEquals(
            "Forward [http://[::1]:3000/](http://[::1]:3000/) now",
            linkifyLoopbackUrls("Forward http://[::1]:3000/ now"),
        )
        assertEquals(
            "Bare [[::1]:3000](http://[::1]:3000/)",
            linkifyLoopbackUrls("Bare [::1]:3000"),
        )
    }

    @Test
    fun decoratesEveryOccurrence() {
        val text = "localhost:3000 or localhost:4000"
        assertEquals(
            "[localhost:3000](http://localhost:3000/) or " +
                "[localhost:4000](http://localhost:4000/)",
            linkifyLoopbackUrls(text),
        )
    }
}
