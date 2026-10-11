import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidApplicationConventionPluginTest {
    @Test
    fun applicationConventionSetsSharedAndroidDefaults() {
        val output = runConventionFixture(
            buildScript = """
            plugins {
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
            """,
            task = "printAndroidDefaults",
        )

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
}
