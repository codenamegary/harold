import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidComposeConventionPluginTest {
    @Test
    fun composeConventionEnablesCompose() {
        val output = runConventionFixture(
            buildScript = """
            plugins {
                id("harold.android.library")
                id("harold.android.compose")
            }

            android {
                namespace = "harold.fixture"
            }

            tasks.register("printCompose") {
                doLast {
                    val android = project.extensions.getByType(com.android.build.api.dsl.LibraryExtension::class.java)
                    println("COMPOSE=${'$'}{android.buildFeatures.compose}")
                    println("COMPOSE_PLUGIN=${'$'}{project.plugins.hasPlugin("org.jetbrains.kotlin.plugin.compose")}")
                }
            }
            """,
            task = "printCompose",
        )

        assertTrue(output, output.contains("COMPOSE=true"))
        assertTrue(output, output.contains("COMPOSE_PLUGIN=true"))
    }
}
