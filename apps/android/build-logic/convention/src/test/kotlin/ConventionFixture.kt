import java.nio.file.Files
import org.gradle.testkit.runner.GradleRunner

/**
 * Builds a throwaway Android project with [buildScript] and returns the output of [task].
 * Plugins come from the convention plugin classpath, so build scripts apply them by id with no version.
 */
internal fun runConventionFixture(
    buildScript: String,
    task: String,
    versionCatalog: java.io.File? = null,
): String {
    val sdkDir = System.getenv("ANDROID_HOME") ?: System.getenv("ANDROID_SDK_ROOT")
    check(!sdkDir.isNullOrBlank()) { "ANDROID_HOME is required" }

    val projectDir = Files.createTempDirectory("harold-convention").toFile()
    try {
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
        if (versionCatalog != null) {
            projectDir.resolve("gradle").mkdirs()
            versionCatalog.copyTo(projectDir.resolve("gradle/libs.versions.toml"), overwrite = true)
        }
        projectDir.resolve("src/main").mkdirs()
        projectDir.resolve("src/main/AndroidManifest.xml").writeText("<manifest />\n")
        projectDir.resolve("build.gradle.kts").writeText(buildScript.trimIndent())

        return GradleRunner.create()
            .withProjectDir(projectDir)
            .withPluginClasspath()
            .withArguments(task, "--stacktrace")
            .build()
            .output
    } finally {
        projectDir.deleteRecursively()
    }
}
