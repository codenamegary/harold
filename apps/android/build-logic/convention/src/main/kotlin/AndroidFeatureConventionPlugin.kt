import org.gradle.api.Plugin
import org.gradle.api.Project

/**
 * Feature modules are Compose Android libraries.
 * The modules story adds the rule that one feature cannot depend on another.
 */
class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("harold.android.library")
            pluginManager.apply("harold.android.compose")
        }
    }
}
