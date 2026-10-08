package harold.android

import org.junit.Assert.assertEquals
import org.junit.Test

class AppVersionTest {
    @Test
    fun versionCodeIsDerivedFromVersionName() {
        val (major, minor, patch) = BuildConfig.VERSION_NAME
            .removeSuffix("-debug")
            .split(".")
            .map(String::toInt)

        assertEquals(major * 10000 + minor * 100 + patch, BuildConfig.VERSION_CODE)
    }

    @Test
    fun debugBuildUsesSeparateApplicationId() {
        assertEquals("harold.android.debug", BuildConfig.APPLICATION_ID)
        assertEquals(true, BuildConfig.VERSION_NAME.endsWith("-debug"))
    }
}
