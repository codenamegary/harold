import com.android.build.api.variant.AndroidComponentsExtension
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.Project
import org.gradle.api.artifacts.component.ProjectComponentIdentifier
import org.gradle.api.artifacts.result.ResolvedComponentResult
import org.gradle.api.artifacts.result.ResolvedDependencyResult
import org.gradle.api.attributes.Attribute
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

private val MODULE_KIND: Attribute<String> = Attribute.of("harold.module.kind", String::class.java)
private const val FEATURE = "feature"

/**
 * Tags the variants this project publishes as a feature, so consumers can see it
 * in their resolved dependency graph without reading this project's model.
 */
internal fun Project.markAsFeature() {
    // AGP sets the consumable role after creating each configuration, so match the
    // Gradle naming convention for published variants instead of the role flags.
    configurations.configureEach {
        if (name.endsWith("Elements")) {
            attributes.attribute(MODULE_KIND, FEATURE)
        }
    }
}

/**
 * Only the app may depend on a feature. Fails the build when any variant's runtime
 * graph reaches a feature, directly or through another module.
 */
internal fun Project.checkModuleBoundaries() {
    val modulePath = path
    val checkAll = tasks.register("checkModuleBoundaries") {
        group = "verification"
        description = "Fails when this module depends on a feature module."
    }
    extensions.getByType(AndroidComponentsExtension::class.java).onVariants { variant ->
        val check = tasks.register(
            "check${variant.name.replaceFirstChar(Char::uppercase)}ModuleBoundaries",
            CheckModuleBoundariesTask::class.java,
        ) {
            projectPath.set(modulePath)
            runtimeGraph.set(variant.runtimeConfiguration.incoming.resolutionResult.rootComponent)
        }
        checkAll.configure { dependsOn(check) }
    }
    tasks.named { it == "preBuild" || it == "check" }.configureEach { dependsOn(checkAll) }
}

abstract class CheckModuleBoundariesTask : DefaultTask() {
    @get:Input
    abstract val projectPath: Property<String>

    @get:Input
    abstract val runtimeGraph: Property<ResolvedComponentResult>

    @TaskAction
    fun check() {
        val root = runtimeGraph.get()
        val features = reachableComponents(root)
            .filter { component -> component.variants.any { it.attributes.getAttribute(MODULE_KIND) == FEATURE } }
            .mapNotNull { (it.id as? ProjectComponentIdentifier)?.projectPath }
            .filter { it != projectPath.get() }
            .sorted()
        if (features.isNotEmpty()) {
            throw GradleException("${projectPath.get()} cannot depend on feature ${features.joinToString()}")
        }
    }

    private fun reachableComponents(root: ResolvedComponentResult): Set<ResolvedComponentResult> {
        val seen = linkedSetOf<ResolvedComponentResult>()
        val queue = ArrayDeque(listOf(root))
        while (queue.isNotEmpty()) {
            val component = queue.removeFirst()
            if (!seen.add(component)) {
                continue
            }
            component.dependencies
                .filterIsInstance<ResolvedDependencyResult>()
                .forEach { queue.addLast(it.selected) }
        }
        return seen
    }
}
