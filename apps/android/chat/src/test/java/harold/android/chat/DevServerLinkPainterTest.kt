package harold.android.chat

import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.sp
import com.mikepenz.markdown.compose.extendedspans.ExtendedSpans
import com.mikepenz.markdown.compose.extendedspans.SpanDrawInstructions
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Drives the painter on an annotated string shaped like the markdown renderer's
 * output. The colour of the underline is not observable here, but the tag, the
 * link styles, the laid-out range and the pixels the instructions paint are.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class DevServerLinkPainterTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private val painter = DevServerLinkSpanPainter(
        linkColor = Color.White,
        underlineColor = Color.White,
        markColor = Color.Green,
    )
    private val extendedSpans = ExtendedSpans(painter)
    private val ordinaryLinkStyles = TextLinkStyles(
        style = SpanStyle(fontWeight = FontWeight.Bold, textDecoration = TextDecoration.Underline),
    )

    @Test
    fun tagsTheUrlTextAndDropsTheSolidUnderline() {
        val extended = extendedSpans.extend(linkSource(DEV_SERVER_LINK_MARK + "localhost:5173"))

        val tag = extended.getStringAnnotations(DEV_SERVER_LINK_TAG, 0, extended.length).single()
        assertEquals("localhost:5173", extended.text.substring(tag.start, tag.end))

        val link = extended.getLinkAnnotations(0, extended.length).single().item as LinkAnnotation.Url
        assertEquals(TextDecoration.None, link.styles?.style?.textDecoration)
        val pressed = requireNotNull(link.styles?.pressedStyle)
        assertTrue("a press dims the link text", pressed.color.alpha < 1f)

        val mark = extended.spanStyles.single { span ->
            span.start == PREFIX.length && span.end == PREFIX.length + DEV_SERVER_LINK_MARK.length
        }
        assertEquals(MARK_FONT_SIZE, mark.item.fontSize)
        assertEquals(FontWeight.Bold, mark.item.fontWeight)
        assertEquals("the mark carries the brand accent", Color.Green, mark.item.color)
    }

    @Test
    fun leavesAnOrdinaryLinkStyleAlone() {
        val extended = extendedSpans.extend(linkSource("docs.example.com"))

        assertTrue(extended.getStringAnnotations(DEV_SERVER_LINK_TAG, 0, extended.length).isEmpty())
        val link = extended.getLinkAnnotations(0, extended.length).single().item as LinkAnnotation.Url
        assertSame(ordinaryLinkStyles, link.styles)
    }

    @Test
    fun paintsTheUnderlineBeneathTheUrlTextOnlyForATaggedLink() {
        val tagged = extendedSpans.extend(linkSource(DEV_SERVER_LINK_MARK + "localhost:5173"))
        val tag = tagged.getStringAnnotations(DEV_SERVER_LINK_TAG, 0, tagged.length).single()
        val layout = measurer.measure(tagged)
        val first = layout.getBoundingBox(tag.start)
        val last = layout.getBoundingBox(tag.end - 1)
        assertTrue("the url text occupies the tag range", last.right > first.left && last.bottom > 0f)

        assertTrue(
            "the dotted underline is stroked",
            paintedPixels(painter.drawInstructionsFor(layout, null)) > 0,
        )
        val ordinary = measurer.measure(extendedSpans.extend(linkSource("docs.example.com")))
        assertEquals(
            "an ordinary link keeps its plain underline",
            0,
            paintedPixels(painter.drawInstructionsFor(ordinary, null)),
        )
    }

    /** How many pixels of [instructions] land on the canvas, which starts empty. */
    private fun paintedPixels(instructions: SpanDrawInstructions): Int {
        val image = ImageBitmap(CANVAS_WIDTH, CANVAS_HEIGHT)
        CanvasDrawScope().draw(
            density = Density(1f),
            layoutDirection = LayoutDirection.Ltr,
            canvas = Canvas(image),
            size = Size(CANVAS_WIDTH.toFloat(), CANVAS_HEIGHT.toFloat()),
        ) {
            with(instructions) { draw() }
        }
        val pixels = image.toPixelMap()
        var painted = 0
        for (y in 0 until pixels.height) {
            for (x in 0 until pixels.width) {
                if (pixels[x, y].alpha > 0f) {
                    painted += 1
                }
            }
        }
        return painted
    }

    private fun linkSource(label: String): AnnotatedString = buildAnnotatedString {
        append(PREFIX)
        pushLink(LinkAnnotation.Url(LOOPBACK_URL, ordinaryLinkStyles))
        append(label)
        pop()
    }

    // The rule only allows one setContent call per test, so the measurer is
    // borrowed from a single empty composition.
    private val measurer: TextMeasurer by lazy {
        lateinit var captured: TextMeasurer
        composeTestRule.setContent { captured = rememberTextMeasurer() }
        composeTestRule.waitForIdle()
        captured
    }

    private companion object {
        const val PREFIX = "Dev at "
        const val LOOPBACK_URL = "http://localhost:5173/"
        const val CANVAS_WIDTH = 240
        const val CANVAS_HEIGHT = 80
        val MARK_FONT_SIZE = 12.sp
    }
}
