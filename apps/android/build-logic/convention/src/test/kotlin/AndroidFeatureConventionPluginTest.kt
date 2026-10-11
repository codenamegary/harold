import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidFeatureConventionPluginTest {
    @Test
    fun featureConventionIsAComposeLibrary() {
        val output = runConventionFixture(
            buildScript = """
            plugins {
                id("harold.android.feature")
            }

            android {
                namespace = "harold.fixture"
            }

            tasks.register("printFeature") {
                doLast {
                    val android = project.extensions.getByType(com.android.build.api.dsl.LibraryExtension::class.java)
                    println("LIBRARY=${'$'}{project.plugins.hasPlugin("com.android.library")}")
                    println("APPLICATION=${'$'}{project.plugins.hasPlugin("com.android.application")}")
                    println("COMPOSE=${'$'}{android.buildFeatures.compose}")
                    println("MIN_SDK=${'$'}{android.defaultConfig.minSdk}")
                }
            }
            """,
            task = "printFeature",
        )

        assertTrue(output, output.contains("LIBRARY=true"))
        assertTrue(output, output.contains("APPLICATION=false"))
        assertTrue(output, output.contains("COMPOSE=true"))
        assertTrue(output, output.contains("MIN_SDK=30"))
    }
}
