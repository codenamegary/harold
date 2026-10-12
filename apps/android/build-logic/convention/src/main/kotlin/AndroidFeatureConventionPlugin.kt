import org.gradle.api.Plugin
import org.gradle.api.Project

/**
 * Feature modules are Compose Android libraries.
 * Only the app may depend on a feature. See [checkModuleBoundaries].
 */
class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("harold.android.library")
            pluginManager.apply("harold.android.compose")
            markAsFeature()
        }
    }
}
