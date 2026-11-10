import com.android.build.api.variant.AndroidComponentsExtension
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.Project
import org.gradle.api.artifacts.component.ProjectComponentIdentifier
import org.gradle.api.artifacts.result.ResolvedComponentResult
import org.gradle.api.artifacts.result.ResolvedDependencyResult
import org.gradle.api.attributes.Attribute
import org.gradle.api.provider.Property
import org.gradle.api.provider.SetProperty
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

private val MODULE_KIND: Attribute<String> = Attribute.of("harold.module.kind", String::class.java)
private const val FEATURE = "feature"

/**
 * Domain modules own SSH, host state, and ACP. Features and shared libraries
 * may only see them through the ports in :api; only the app wires the
 * concrete implementations together.
 */
private val DOMAIN_MODULES = setOf(":transport", ":host", ":acp")

private fun forbiddenModulesFor(projectPath: String): Set<String> = when (projectPath) {
    // SSH primitives and setup only.
    ":transport" -> setOf(":host", ":acp")
    // ACP must stay free of SSH, host state, and credentials.
    ":acp" -> setOf(":host", ":transport", ":auth")
    // Host operations may use SSH, but never the ACP layer.
    ":host" -> setOf(":acp")
    else -> DOMAIN_MODULES
}

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
 * graph reaches a feature, directly or through another module. Library modules also
 * enforce the domain-module boundary rule for their own role in the graph.
 */
internal fun Project.checkModuleBoundaries() {
    val modulePath = path
    val forbidden = forbiddenModulesFor(modulePath)
    val checkAll = tasks.register("checkModuleBoundaries") {
        group = "verification"
        description = "Fails when this module depends on a forbidden module."
    }
    extensions.getByType(AndroidComponentsExtension::class.java).onVariants { variant ->
        val check = tasks.register(
            "check${variant.name.replaceFirstChar(Char::uppercase)}ModuleBoundaries",
            CheckModuleBoundariesTask::class.java,
        ) {
            projectPath.set(modulePath)
            forbiddenModulePaths.set(forbidden)
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
    abstract val forbiddenModulePaths: SetProperty<String>

    @get:Input
    abstract val runtimeGraph: Property<ResolvedComponentResult>

    @TaskAction
    fun check() {
        val root = runtimeGraph.get()
        val reachable = reachableComponents(root)
            .mapNotNull { (it.id as? ProjectComponentIdentifier)?.projectPath }
            .filter { path -> path != projectPath.get() }
            .toSet()

        val features = reachableComponents(root)
            .filter { component -> component.variants.any { it.attributes.getAttribute(MODULE_KIND) == FEATURE } }
            .mapNotNull { (it.id as? ProjectComponentIdentifier)?.projectPath }
            .filter { it != projectPath.get() }
            .sorted()
        if (features.isNotEmpty()) {
            throw GradleException("${projectPath.get()} cannot depend on feature ${features.joinToString()}")
        }

        val forbidden = reachable
            .filter { path -> path in forbiddenModulePaths.get() }
            .sorted()
        if (forbidden.isNotEmpty()) {
            throw GradleException(
                "${projectPath.get()} cannot depend on forbidden module ${forbidden.joinToString()}",
            )
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
