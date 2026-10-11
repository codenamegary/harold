import java.nio.file.Files
import org.gradle.testkit.runner.GradleRunner
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidFeatureConventionPluginTest {
    @Test
    fun featureConventionIsAComposeLibrary() {
        val projectDir = Files.createTempDirectory("harold-feature-convention").toFile()
        val sdkDir = System.getenv("ANDROID_HOME") ?: System.getenv("ANDROID_SDK_ROOT")
        check(!sdkDir.isNullOrBlank()) { "ANDROID_HOME is required" }

        projectDir.resolve("settings.gradle.kts").writeText(
            """
            pluginManagement {
                repositories {
                    google()
                    mavenCentral()
                    gradlePluginPortal()
                }
            }
            dependencyResolutionManagement {
                repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
                repositories {
                    google()
                    mavenCentral()
                }
            }
            rootProject.name = "fixture"
            """.trimIndent(),
        )
        projectDir.resolve("gradle.properties").writeText(
            """
            org.gradle.jvmargs=-Xmx2048m
            android.useAndroidX=true
            android.nonTransitiveRClass=true
            """.trimIndent(),
        )
        projectDir.resolve("local.properties").writeText("sdk.dir=${sdkDir.replace("\\", "\\\\")}\n")
        projectDir.resolve("src/main").mkdirs()
        projectDir.resolve("src/main/AndroidManifest.xml").writeText("<manifest />\n")
        projectDir.resolve("build.gradle.kts").writeText(
            """
            plugins {
                id("com.android.library") version "$AGP_VERSION" apply false
                id("org.jetbrains.kotlin.plugin.compose") version "$KOTLIN_VERSION" apply false
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
            """.trimIndent(),
        )

        val result = GradleRunner.create()
            .withProjectDir(projectDir)
            .withPluginClasspath()
            .withArguments("printFeature", "--stacktrace")
            .build()

        val output = result.output
        assertTrue(output, output.contains("LIBRARY=true"))
        assertTrue(output, output.contains("APPLICATION=false"))
        assertTrue(output, output.contains("COMPOSE=true"))
        assertTrue(output, output.contains("MIN_SDK=30"))
    }

    private companion object {
        const val AGP_VERSION = "9.4.1"
        const val KOTLIN_VERSION = "2.4.21"
    }
}
