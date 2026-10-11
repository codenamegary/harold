import java.nio.file.Files
import org.gradle.testkit.runner.GradleRunner
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidApplicationConventionPluginTest {
    @Test
    fun applicationConventionSetsSharedAndroidDefaults() {
        val projectDir = Files.createTempDirectory("harold-application-convention").toFile()
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
                id("com.android.application") version "$AGP_VERSION" apply false
                id("org.jetbrains.kotlin.plugin.serialization") version "$KOTLIN_VERSION" apply false
                id("harold.android.application")
            }

            android {
                namespace = "harold.fixture"
            }

            tasks.register("printAndroidDefaults") {
                doLast {
                    val android = project.extensions.getByType(com.android.build.api.dsl.ApplicationExtension::class.java)
                    println("MIN_SDK=${'$'}{android.defaultConfig.minSdk}")
                    println("TARGET_SDK=${'$'}{android.defaultConfig.targetSdk}")
                    println("COMPILE_SDK=${'$'}{android.compileSdk}")
                    println("COMPILE_SDK_MINOR=${'$'}{android.compileSdkMinor}")
                    println("JAVA=${'$'}{android.compileOptions.sourceCompatibility}")
                    println("JAVA_TARGET=${'$'}{android.compileOptions.targetCompatibility}")
                    println("UNIT_RESOURCES=${'$'}{android.testOptions.unitTests.isIncludeAndroidResources}")
                    println("RUNNER=${'$'}{android.defaultConfig.testInstrumentationRunner}")
                    println("SERIALIZATION=${'$'}{project.plugins.hasPlugin("org.jetbrains.kotlin.plugin.serialization")}")
                }
            }
            """.trimIndent(),
        )

        val result = GradleRunner.create()
            .withProjectDir(projectDir)
            .withPluginClasspath()
            .withArguments("printAndroidDefaults", "--stacktrace")
            .build()

        val output = result.output
        assertTrue(output, output.contains("MIN_SDK=30"))
        assertTrue(output, output.contains("TARGET_SDK=36"))
        assertTrue(output, output.contains("COMPILE_SDK=37"))
        assertTrue(output, output.contains("COMPILE_SDK_MINOR=0"))
        assertTrue(output, output.contains("JAVA=17"))
        assertTrue(output, output.contains("JAVA_TARGET=17"))
        assertTrue(output, output.contains("UNIT_RESOURCES=true"))
        assertTrue(output, output.contains("RUNNER=androidx.test.runner.AndroidJUnitRunner"))
        assertTrue(output, output.contains("SERIALIZATION=true"))
    }

    private companion object {
        const val AGP_VERSION = "9.4.1"
        const val KOTLIN_VERSION = "2.4.21"
    }
}
