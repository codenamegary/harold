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

    @Test
    fun featureConventionRejectsADependencyOnAnotherFeature() {
        val output = runFailingMultiProjectFixture(
            projects = mapOf(
                ":shell" to """
                plugins {
                    id("harold.android.feature")
                }

                android {
                    namespace = "harold.fixture.shell"
                }
                """,
                ":chat" to """
                plugins {
                    id("harold.android.feature")
                }

                android {
                    namespace = "harold.fixture.chat"
                }

                dependencies {
                    implementation(project(":shell"))
                }
                """,
            ),
            task = ":chat:tasks",
        )

        assertTrue(output, output.contains(":chat cannot depend on feature :shell"))
    }

    @Test
    fun featureConventionAllowsADependencyOnALibrary() {
        val output = runMultiProjectFixture(
            projects = mapOf(
                ":design" to """
                plugins {
                    id("harold.android.library")
                    id("harold.android.compose")
                }

                android {
                    namespace = "harold.fixture.design"
                }
                """,
                ":chat" to """
                plugins {
                    id("harold.android.feature")
                }

                android {
                    namespace = "harold.fixture.chat"
                }

                dependencies {
                    implementation(project(":design"))
                }
                """,
            ),
            task = ":chat:tasks",
        )

        assertTrue(output, output.contains("BUILD SUCCESSFUL"))
    }
}
