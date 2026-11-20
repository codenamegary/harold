package harold.android.chat.composer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import harold.android.ui.theme.LightPrimary
import harold.android.ui.theme.LightSecondary
import harold.android.ui.theme.LightSkyAccent
import harold.android.ui.theme.Lime
import harold.android.ui.theme.Sky
import harold.android.ui.theme.Violet

class ModeColorsTest {
    @Test
    fun darkAgentAndBuildAreLime() {
        assertEquals(Lime, modeColorOf("agent", dark = true))
        assertEquals(Lime, modeColorOf("build", dark = true))
    }

    @Test
    fun darkAskAndPlanAreSky() {
        assertEquals(Sky, modeColorOf("ask", dark = true))
        assertEquals(Sky, modeColorOf("plan", dark = true))
    }

    @Test
    fun darkEditIsViolet() {
        assertEquals(Violet, modeColorOf("edit", dark = true))
    }

    @Test
    fun lightAgentAndBuildUseTheAccessibleGreen() {
        assertEquals(LightPrimary, modeColorOf("agent", dark = false))
        assertEquals(LightPrimary, modeColorOf("build", dark = false))
    }

    @Test
    fun lightAskAndPlanUseTheAccessibleBlue() {
        assertEquals(LightSkyAccent, modeColorOf("ask", dark = false))
        assertEquals(LightSkyAccent, modeColorOf("plan", dark = false))
    }

    @Test
    fun lightEditUsesTheAccessibleViolet() {
        assertEquals(LightSecondary, modeColorOf("edit", dark = false))
    }

    @Test
    fun unknownModeHasNoColor() {
        assertNull(modeColorOf("review", dark = true))
        assertNull(modeColorOf("review", dark = false))
    }
}
