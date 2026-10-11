package harold.android

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BuildConventionsTest {
    @Test
    fun appModuleUsesTheVersionCatalogAndConventionPlugins() {
        val androidRoot = androidRoot()
        val appBuild = File(androidRoot, "app/build.gradle.kts").readText()
        val plugins = appBuild.substringAfter("plugins {").substringBefore("}")
        val pluginLines = plugins.lines().map { it.trim() }.filter { it.isNotEmpty() }

        assertEquals(
            listOf(
                "alias(libs.plugins.harold.android.application)",
                "alias(libs.plugins.harold.android.compose)",
            ),
            pluginLines,
        )
        assertFalse(
            appBuild,
            Regex("""["'][A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+:[0-9]""").containsMatchIn(appBuild),
        )
        assertTrue(
            File(androidRoot, "gradle.properties")
                .readLines()
                .any { it.trim() == "android.enableJetifier=false" },
        )
        assertTrue(File(androidRoot, "gradle/libs.versions.toml").readText().contains("turbine"))
    }

    private fun androidRoot(): File {
        var dir = File("").absoluteFile
        while (true) {
            if (File(dir, "settings.gradle.kts").isFile && File(dir, "app/build.gradle.kts").isFile) {
                return dir
            }
            dir = dir.parentFile ?: error("android project root not found from ${File("").absoluteFile}")
        }
    }
}
