package harold.android.connections

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import harold.android.ui.debug.Probe
import harold.android.ui.debug.ScreenProbe

/**
 * Debug control plane adapter for the SSH host form.
 *
 * This file is compiled into every build because [SshSetupScreen] and this probe
 * share a module, but it does nothing unless the debug build's initializer sets
 * [Probe.enabled]. Release builds install no probe, so the registry stays empty.
 */
@Composable
fun SshSetupProbeEffect(viewModel: SshSetupViewModel) {
    DisposableEffect(viewModel) {
        if (!Probe.enabled) {
            return@DisposableEffect onDispose {}
        }
        val probe = SshSetupProbe(viewModel)
        Probe.install(probe)
        onDispose { Probe.uninstall(probe) }
    }
}

/**
 * Commands map onto the same ViewModel methods the screen calls, so the app's
 * own state machine decides what is allowed. Typing is per character on this
 * thread with a real gap, so the field repaints glyph by glyph exactly as it
 * does for a person.
 */
internal class SshSetupProbe(
    private val viewModel: SshSetupViewModel,
) : ScreenProbe {

    override val name: String = "ssh_setup"

    private fun state(): SshSetupUiState = viewModel.uiState.value

    override fun facts(): Map<String, String> {
        val current = state()
        return mapOf(
            "host" to current.host,
            "port" to current.port,
            "user" to current.user,
            "name" to current.name,
            "authMode" to current.authMode.name,
            "publicKey" to current.publicKey.orEmpty(),
            "fingerprint" to current.testedFingerprint.orEmpty(),
            "trusted" to current.trusted.toString(),
            "testing" to current.testing.toString(),
            "saving" to current.saving.toString(),
            "canTest" to current.canTest.toString(),
            "canSave" to current.canSave.toString(),
            "error" to current.errorMessage.orEmpty(),
        )
    }

    override fun actions(): List<String> = listOf(
        "type",
        "set",
        "test_connection",
        "trust",
        "save",
        "back",
        "auth_mode",
    )

    override fun settled(): Boolean {
        val current = state()
        return !current.testing && !current.saving
    }

    override fun perform(action: String, args: Map<String, String>): Boolean = when (action) {
        "type" -> type(args)
        "set" -> set(args)
        "test_connection" -> {
            viewModel.testConnection()
            true
        }
        "trust" -> {
            viewModel.onTrustChanged(args["value"]?.toBooleanStrictOrNull() ?: true)
            true
        }
        "save" -> {
            viewModel.save()
            true
        }
        "back" -> {
            viewModel.onBack()
            true
        }
        "auth_mode" -> authMode(args["mode"])
        else -> false
    }

    private fun authMode(mode: String?): Boolean {
        val next = when (mode) {
            "generated" -> SshAuthMode.GeneratedKey
            "imported" -> SshAuthMode.ImportedKey
            "password" -> SshAuthMode.Password
            else -> return false
        }
        // The dropdown and the probe both mean "use this new method", so a
        // previously selected saved credential must be cleared first.
        viewModel.onCredentialSelected(null)
        viewModel.onAuthModeChanged(next)
        return true
    }

    private fun set(args: Map<String, String>): Boolean {
        val field = args["field"] ?: return false
        val setter = setterFor(field) ?: return false
        setter(args["value"].orEmpty())
        return true
    }

    private fun type(args: Map<String, String>): Boolean {
        val field = args["field"] ?: return false
        val text = args["text"] ?: return false
        val gapMs = args["gapMs"]?.toLongOrNull() ?: DEFAULT_GAP_MS
        val setter = setterFor(field) ?: return false
        if (args["append"] != "true") {
            setter("")
        }
        for (character in text) {
            Probe.mark("key")
            setter(readerFor(field)().orEmpty() + character)
            if (gapMs > 0) {
                Thread.sleep(gapMs)
            }
        }
        Probe.mark("keys_done")
        return true
    }

    private fun setterFor(field: String): ((String) -> Unit)? = when (field) {
        "host" -> viewModel::onHostChanged
        "port" -> viewModel::onPortChanged
        "user" -> viewModel::onUserChanged
        "name" -> viewModel::onNameChanged
        "credential_name" -> viewModel::onCredentialNameChanged
        "imported_key" -> viewModel::onImportedKeyChanged
        "password" -> viewModel::onPasswordChanged
        else -> null
    }

    private fun readerFor(field: String): () -> String? = when (field) {
        "host" -> { { state().host } }
        "port" -> { { state().port } }
        "user" -> { { state().user } }
        "name" -> { { state().name } }
        "credential_name" -> { { state().credentialName } }
        "imported_key" -> { { state().importedKey } }
        "password" -> { { state().password } }
        else -> { { null } }
    }

    private companion object {
        /** Matches the driver's floor. Slow enough to read on video. */
        const val DEFAULT_GAP_MS = 30L
    }
}
