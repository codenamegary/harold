import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidHiltConventionPluginTest {
    @Test
    fun hiltConventionAppliesKspAndHilt() {
        val output = runConventionFixture(
            versionCatalog = versionCatalog(),
            buildScript = """
            plugins {
                id("harold.android.application")
                id("harold.android.hilt")
            }

            android {
                namespace = "harold.fixture"
            }

            tasks.register("printHilt") {
                doLast {
                    println("KSP=${'$'}{project.plugins.hasPlugin("com.google.devtools.ksp")}")
                    println("HILT=${'$'}{project.plugins.hasPlugin("com.google.dagger.hilt.android")}")
                }
            }
            """,
            task = "printHilt",
        )

        assertTrue(output, output.contains("KSP=true"))
        assertTrue(output, output.contains("HILT=true"))
    }

    private fun versionCatalog(): File {
        var dir = File("").absoluteFile
        while (true) {
            val catalog = File(dir, "gradle/libs.versions.toml")
            if (catalog.isFile) {
                return catalog
            }
            dir = dir.parentFile ?: error("libs.versions.toml not found from ${File("").absoluteFile}")
        }
    }
}
