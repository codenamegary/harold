package harold.android.chat

import org.junit.Assert.assertEquals
import org.junit.Test

class DevServerLinkRenderingTest {
    private fun render(text: String): String = markDevServerLinks(linkifyLoopbackUrls(text))

    @Test
    fun marksTheLoopbackLinkThatLinkifyProduced() {
        assertEquals(
            "Dev server on [${DEV_SERVER_LINK_MARK}localhost:5173](http://localhost:5173/)",
            render("Dev server on localhost:5173"),
        )
    }

    @Test
    fun leavesOrdinaryLinksUntouched() {
        assertEquals(
            "Docs [here](https://docs.example.com) and dev " +
                "[${DEV_SERVER_LINK_MARK}localhost:3000](http://localhost:3000/)",
            render("Docs [here](https://docs.example.com) and dev localhost:3000"),
        )
    }

    @Test
    fun marksALoopbackLinkAnAgentWroteItself() {
        assertEquals(
            "Open [${DEV_SERVER_LINK_MARK}the app](http://127.0.0.1:3000/)",
            render("Open [the app](http://127.0.0.1:3000/)"),
        )
    }

    @Test
    fun keepsAnIpv6LabelInOnePiece() {
        assertEquals(
            "On [${DEV_SERVER_LINK_MARK}[::1]:9000](http://[::1]:9000/)",
            render("On [::1]:9000"),
        )
    }

    @Test
    fun keepsTheTitleOfALoopbackLink() {
        assertEquals(
            "Dev [${DEV_SERVER_LINK_MARK}server](http://localhost:3000/ \"Dev server\")",
            render("Dev [server](http://localhost:3000/ \"Dev server\")"),
        )
    }

    @Test
    fun leavesCodeSpansAndFencedBlocksUntouched() {
        val text = "Run `[x](http://localhost:3000/)` or\n" +
            "```\n[x](http://localhost:3000/)\n```\n" +
            "Then localhost:9000"

        assertEquals(
            "Run `[x](http://localhost:3000/)` or\n" +
                "```\n[x](http://localhost:3000/)\n```\n" +
                "Then [${DEV_SERVER_LINK_MARK}localhost:9000](http://localhost:9000/)",
            render(text),
        )
    }

    @Test
    fun marksALoopbackLinkWrappedInAngleBrackets() {
        assertEquals(
            "Dev [${DEV_SERVER_LINK_MARK}server](<http://localhost:3000/>)",
            render("Dev [server](<http://localhost:3000/>)"),
        )
    }

    @Test
    fun marksALoopbackLinkWhoseTitleFollowsATab() {
        assertEquals(
            "Dev [${DEV_SERVER_LINK_MARK}server](http://localhost:3000/\t\"Dev server\")",
            render("Dev [server](http://localhost:3000/\t\"Dev server\")"),
        )
    }

    @Test
    fun leavesAFencedBlockInsideABlockQuoteUntouched() {
        val text = "> ```\n> [x](http://localhost:3000/)\n> ```"

        assertEquals(text, render(text))
    }

    @Test
    fun leavesImagesAndReferenceDefinitionsUntouched() {
        val text = "![shot](http://localhost:3000/shot.png)\n\n[dev]: http://localhost:3000/start"

        assertEquals(text, render(text))
    }

    @Test
    fun marksEachLinkOnlyOnce() {
        val once = render("Dev on localhost:3000 and localhost:4000")

        assertEquals(once, markDevServerLinks(once))
    }
}
