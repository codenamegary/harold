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
        val pluginLines = plugins.lines()
            .map { it.substringBefore("//").trim() }
            .filter { it.isNotEmpty() }

        assertEquals(
            listOf(
                "alias(libs.plugins.harold.android.application)",
                "alias(libs.plugins.harold.android.compose)",
                "alias(libs.plugins.harold.android.hilt)",
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

    @Test
    fun settingsIncludesDomainModules() {
        val settings = File(androidRoot(), "settings.gradle.kts").readText()
        listOf(
            ":app",
            ":navigation",
            ":contracts",
            ":api",
            ":auth",
            ":live",
            ":voice",
            ":design",
            ":testing",
            ":pairing",
            ":chat",
            ":workspaces",
            ":shell",
        ).forEach { module ->
            assertTrue(settings, settings.contains(module))
        }
    }

    @Test
    fun featureModulesUseTheFeatureConvention() {
        val root = androidRoot()
        listOf("pairing", "chat", "workspaces", "shell").forEach { name ->
            val buildFile = File(root, "$name/build.gradle.kts").readText()
            assertTrue(buildFile, buildFile.contains("alias(libs.plugins.harold.android.feature)"))
        }
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
