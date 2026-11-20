package harold.android.ui.theme

import android.graphics.Color
import harold.android.design.R
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class WindowBackgroundTest {
    @Test
    @Config(qualifiers = "notnight")
    fun lightWindowBackgroundMatchesTheLightCanvas() {
        assertEquals(
            Color.parseColor("#F5F6F8"),
            RuntimeEnvironment.getApplication().getColor(R.color.window_background),
        )
    }

    @Test
    @Config(qualifiers = "night")
    fun darkWindowBackgroundMatchesTheDarkCanvas() {
        assertEquals(
            Color.parseColor("#080A0D"),
            RuntimeEnvironment.getApplication().getColor(R.color.window_background),
        )
    }
}
