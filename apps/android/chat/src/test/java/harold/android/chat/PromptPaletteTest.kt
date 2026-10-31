package harold.android.chat

import harold.android.ui.theme.LightOnSurface
import harold.android.ui.theme.LightOnSurfaceVariant
import harold.android.ui.theme.LightPanel2
import harold.android.ui.theme.LightSurfaceVariant
import org.junit.Assert.assertEquals
import org.junit.Test

class PromptPaletteTest {
    @Test
    fun thePromptPanelIsLightWithDarkInk() {
        val palette = promptPalette()

        assertEquals(LightPanel2, palette.background)
        assertEquals(LightOnSurface, palette.content)
        assertEquals(LightOnSurfaceVariant, palette.muted)
        assertEquals(LightSurfaceVariant, palette.chipBackground)
    }
}
