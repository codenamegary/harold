import com.android.build.api.dsl.CommonExtension
import org.gradle.api.Plugin
import org.gradle.api.Project

class AndroidComposeConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("org.jetbrains.kotlin.plugin.compose")
            val android = extensions.findByType(CommonExtension::class.java)
                ?: error("harold.android.compose requires harold.android.application or harold.android.library")
            android.buildFeatures.compose = true
        }
    }
}
