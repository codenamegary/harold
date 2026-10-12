import org.gradle.api.GradleException
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.artifacts.ProjectDependency

/**
 * Feature modules are Compose Android libraries.
 * One feature cannot depend on another feature.
 */
class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("harold.android.library")
            pluginManager.apply("harold.android.compose")

            gradle.projectsEvaluated {
                configurations.forEach { configuration ->
                    configuration.dependencies.withType(ProjectDependency::class.java).forEach { dependency ->
                        val dependencyPath = dependency.path
                        if (dependencyPath.isBlank() || dependencyPath == path) {
                            return@forEach
                        }
                        val other = rootProject.project(dependencyPath)
                        if (other.plugins.hasPlugin("harold.android.feature")) {
                            throw GradleException(
                                "$path cannot depend on feature ${other.path}",
                            )
                        }
                    }
                }
            }
        }
    }
}
