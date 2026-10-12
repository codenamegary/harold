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
    fun aFeatureCannotDependOnAnotherFeature() {
        val output = runMultiProjectFixture(
            projects = mapOf(
                ":shell" to module("harold.android.feature", "shell"),
                ":chat" to module("harold.android.feature", "chat", dependsOn = ":shell"),
            ),
            task = ":chat:checkModuleBoundaries",
            expectFailure = true,
        )

        assertTrue(output, output.contains(":chat cannot depend on feature :shell"))
    }

    @Test
    fun aLibraryCannotDependOnAFeature() {
        val output = runMultiProjectFixture(
            projects = mapOf(
                ":chat" to module("harold.android.feature", "chat"),
                ":design" to module("harold.android.library", "design", dependsOn = ":chat"),
            ),
            task = ":design:checkModuleBoundaries",
            expectFailure = true,
        )

        assertTrue(output, output.contains(":design cannot depend on feature :chat"))
    }

    @Test
    fun aFeatureCannotReachAnotherFeatureThroughALibrary() {
        val output = runMultiProjectFixture(
            projects = mapOf(
                ":chat" to module("harold.android.feature", "chat"),
                ":design" to module("harold.android.library", "design", dependsOn = ":chat"),
                ":workspaces" to module("harold.android.feature", "workspaces", dependsOn = ":design"),
            ),
            task = ":workspaces:checkModuleBoundaries",
            expectFailure = true,
        )

        assertTrue(output, output.contains(":workspaces cannot depend on feature :chat"))
    }

    @Test
    fun aFeatureCanDependOnALibrary() {
        val output = runMultiProjectFixture(
            projects = mapOf(
                ":design" to module("harold.android.library", "design"),
                ":chat" to module("harold.android.feature", "chat", dependsOn = ":design"),
            ),
            task = ":chat:checkModuleBoundaries",
        )

        assertTrue(output, output.contains("BUILD SUCCESSFUL"))
    }

    @Test
    fun preBuildRunsTheBoundaryCheck() {
        val output = runMultiProjectFixture(
            projects = mapOf(
                ":shell" to module("harold.android.feature", "shell"),
                ":chat" to module("harold.android.feature", "chat", dependsOn = ":shell"),
            ),
            task = ":chat:preDebugBuild",
            expectFailure = true,
        )

        assertTrue(output, output.contains(":chat cannot depend on feature :shell"))
    }

    private fun module(plugin: String, name: String, dependsOn: String? = null): String {
        val dependencies = dependsOn?.let { path ->
            """

            dependencies {
                implementation(project("$path"))
            }
            """.trimIndent()
        }.orEmpty()
        return """
            |plugins {
            |    id("$plugin")
            |}
            |
            |android {
            |    namespace = "harold.fixture.$name"
            |}
            |$dependencies
            """.trimMargin()
    }
}
