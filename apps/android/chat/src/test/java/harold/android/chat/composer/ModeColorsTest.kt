package harold.android.chat.composer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import harold.android.ui.theme.Lime
import harold.android.ui.theme.Sky
import harold.android.ui.theme.Violet

class ModeColorsTest {
    @Test
    fun agentAndBuildAreLime() {
        assertEquals(Lime, modeColorOf("agent"))
        assertEquals(Lime, modeColorOf("build"))
    }

    @Test
    fun askAndPlanAreSky() {
        assertEquals(Sky, modeColorOf("ask"))
        assertEquals(Sky, modeColorOf("plan"))
    }

    @Test
    fun editIsViolet() {
        assertEquals(Violet, modeColorOf("edit"))
    }

    @Test
    fun unknownModeHasNoColor() {
        assertNull(modeColorOf("review"))
    }
}
