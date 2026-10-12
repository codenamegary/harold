import java.io.File
import java.nio.file.Files
import org.gradle.testkit.runner.GradleRunner

/**
 * Builds a throwaway Android project with [buildScript] and returns the output of [task].
 * Plugins come from the convention plugin classpath, so build scripts apply them by id with no version.
 */
internal fun runConventionFixture(
    buildScript: String,
    task: String,
    versionCatalog: File? = null,
): String = runMultiProjectFixture(
    projects = mapOf(":" to buildScript),
    task = task,
    versionCatalog = versionCatalog,
)

/**
 * Like [runConventionFixture], with one build script per project path. The path ":" is the root project.
 * When [expectFailure] is true the build must fail, and the failure output is returned.
 */
internal fun runMultiProjectFixture(
    projects: Map<String, String>,
    task: String,
    versionCatalog: File? = null,
    expectFailure: Boolean = false,
): String {
    val sdkDir = System.getenv("ANDROID_HOME") ?: System.getenv("ANDROID_SDK_ROOT")
    check(!sdkDir.isNullOrBlank()) { "ANDROID_HOME is required" }

    val projectDir = Files.createTempDirectory("harold-convention").toFile()
    try {
        val includes = projects.keys
            .filter { it != ":" }
            .joinToString("\n") { path -> "include(\"$path\")" }
        projectDir.resolve("settings.gradle.kts").writeText(
            """
            |pluginManagement {
            |    repositories {
            |        google()
            |        mavenCentral()
            |        gradlePluginPortal()
            |    }
            |}
            |dependencyResolutionManagement {
            |    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
            |    repositories {
            |        google()
            |        mavenCentral()
            |    }
            |}
            |rootProject.name = "fixture"
            |$includes
            """.trimMargin(),
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
        projects.forEach { (path, buildScript) ->
            val dir = projectDir.resolve(path.removePrefix(":").replace(":", "/"))
            dir.resolve("src/main").mkdirs()
            dir.resolve("src/main/AndroidManifest.xml").writeText("<manifest />\n")
            dir.resolve("build.gradle.kts").writeText(buildScript.trimIndent())
        }

        val runner = GradleRunner.create()
            .withProjectDir(projectDir)
            .withPluginClasspath()
            .withArguments(task, "--stacktrace")
        val result = if (expectFailure) runner.buildAndFail() else runner.build()
        return result.output
    } finally {
        projectDir.deleteRecursively()
    }
}
