package harold.android.pairing

import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import harold.android.network.PairingClaimError
import harold.android.network.PairingClaimException
import harold.android.navigation.Navigator

enum class PairingMode {
    Scan,
    Manual,
}

enum class PairingPhase {
    Capture,
    AlreadySaved,
    Confirm,
}

data class PairingUiState(
    val mode: PairingMode = PairingMode.Scan,
    val phase: PairingPhase = PairingPhase.Capture,
    val endpoint: String = "",
    val code: String = "",
    val pendingEndpoint: String = "",
    val pendingCode: String = "",
    val name: String = "",
    val colorId: String = "",
    val iconId: String = "",
    val isClaiming: Boolean = false,
    val errorMessage: String? = null,
    val completed: Boolean = false,
)

@HiltViewModel
class PairingViewModel @Inject constructor(
    private val pairingCoordinator: PairingCoordinator,
    private val payloadParser: PairingPayloadParser,
    private val deviceNameProvider: DeviceNameProvider,
    private val navigator: Navigator,
    private val pairingRequests: PairingRequests? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow(PairingUiState())
    val uiState: StateFlow<PairingUiState> = _uiState.asStateFlow()

    init {
        pairingRequests?.let { requests ->
            viewModelScope.launch {
                requests.pendingUri.collect { uri ->
                    if (uri != null) {
                        requests.consume()
                        onQrScanned(uri)
                    }
                }
            }
        }
    }

    fun showManualEntry() {
        _uiState.update { current ->
            current.copy(mode = PairingMode.Manual, errorMessage = null)
        }
    }

    fun showScanner() {
        _uiState.update { current ->
            current.copy(mode = PairingMode.Scan, errorMessage = null)
        }
    }

    fun onEndpointChanged(value: String) {
        _uiState.update { current -> current.copy(endpoint = value, errorMessage = null) }
    }

    fun onCodeChanged(value: String) {
        _uiState.update { current ->
            current.copy(code = value.uppercase(), errorMessage = null)
        }
    }

    fun onNameChanged(value: String) {
        _uiState.update { current -> current.copy(name = value, errorMessage = null) }
    }

    fun onColorSelected(colorId: String) {
        _uiState.update { current -> current.copy(colorId = colorId, errorMessage = null) }
    }

    fun onIconSelected(iconId: String) {
        _uiState.update { current -> current.copy(iconId = iconId, errorMessage = null) }
    }

    fun confirmUpdate() {
        if (_uiState.value.phase != PairingPhase.AlreadySaved) {
            return
        }
        _uiState.update { current -> current.copy(phase = PairingPhase.Confirm, errorMessage = null) }
    }

    fun cancelUpdate() {
        if (_uiState.value.phase != PairingPhase.AlreadySaved) {
            return
        }
        _uiState.update { current ->
            current.copy(
                phase = PairingPhase.Capture,
                pendingEndpoint = "",
                pendingCode = "",
                name = "",
                colorId = "",
                iconId = "",
                errorMessage = null,
            )
        }
    }

    fun confirmPairing() {
        val state = _uiState.value
        if (state.phase != PairingPhase.Confirm || state.isClaiming || state.completed) {
            return
        }
        if (state.name.isBlank()) {
            _uiState.update { current -> current.copy(errorMessage = "Enter a name") }
            return
        }
        claim(
            endpoint = state.pendingEndpoint,
            code = state.pendingCode,
            appearance = HaroldAppearance(
                name = state.name.trim(),
                colorId = state.colorId,
                iconId = state.iconId,
            ),
        )
    }

    fun onQrScanned(payload: String) {
        if (_uiState.value.isClaiming || _uiState.value.completed || _uiState.value.phase != PairingPhase.Capture) {
            return
        }

        val parsed = runCatching { payloadParser.parse(payload) }
            .getOrElse { error ->
                _uiState.update { current ->
                    current.copy(errorMessage = error.message ?: "Invalid QR code")
                }
                return
            }

        prepare(parsed.endpoint, parsed.code)
    }

    fun submitManualPairing() {
        if (_uiState.value.isClaiming || _uiState.value.completed || _uiState.value.phase != PairingPhase.Capture) {
            return
        }
        val endpoint = _uiState.value.endpoint.trim()
        val code = _uiState.value.code.trim().uppercase()

        if (endpoint.isBlank() || code.isBlank()) {
            _uiState.update { current ->
                current.copy(errorMessage = "Enter endpoint and pairing code")
            }
            return
        }

        val parsed = runCatching {
            payloadParser.parse(
                "harold://pair?v=1&endpoint=${java.net.URLEncoder.encode(endpoint, Charsets.UTF_8.name())}&code=$code",
            )
        }.getOrElse { error ->
            _uiState.update { current ->
                current.copy(errorMessage = error.message ?: "Invalid pairing details")
            }
            return
        }

        prepare(parsed.endpoint, parsed.code)
    }

    private fun prepare(endpoint: String, code: String) {
        viewModelScope.launch {
            val draft = pairingCoordinator.draft(endpoint)
            _uiState.update { current ->
                current.copy(
                    phase = if (draft.alreadySaved) PairingPhase.AlreadySaved else PairingPhase.Confirm,
                    pendingEndpoint = endpoint,
                    pendingCode = code,
                    name = draft.appearance.name,
                    colorId = draft.appearance.colorId,
                    iconId = draft.appearance.iconId,
                    errorMessage = null,
                    isClaiming = false,
                )
            }
        }
    }

    private fun claim(
        endpoint: String,
        code: String,
        appearance: HaroldAppearance,
    ) {
        if (_uiState.value.isClaiming || _uiState.value.completed) {
            return
        }

        _uiState.update { current ->
            current.copy(isClaiming = true, errorMessage = null)
        }

        viewModelScope.launch {
            val result = pairingCoordinator.pair(
                endpoint = endpoint,
                code = code,
                deviceName = deviceNameProvider(),
                appearance = appearance,
            )

            result.fold(
                onSuccess = {
                    _uiState.update { current ->
                        current.copy(isClaiming = true, completed = true, errorMessage = null)
                    }
                    navigator.showChat()
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            isClaiming = false,
                            errorMessage = errorMessageFor(error),
                        )
                    }
                },
            )
        }
    }

    private fun errorMessageFor(error: Throwable): String =
        when (error) {
            is PairingClaimException -> when (val claimError = error.error) {
                is PairingClaimError.Problem -> claimError.detail ?: claimError.title
                is PairingClaimError.Transport -> "Could not reach Harold"
            }

            else -> error.message ?: "Pairing failed"
        }
}

fun interface DeviceNameProvider {
    operator fun invoke(): String
}

fun defaultDeviceName(): String = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
