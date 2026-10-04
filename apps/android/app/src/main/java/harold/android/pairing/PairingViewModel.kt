package harold.android.pairing

import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import harold.android.network.PairingClaimError
import harold.android.network.PairingClaimException

enum class PairingMode {
    Scan,
    Manual,
}

data class PairingUiState(
    val mode: PairingMode = PairingMode.Scan,
    val endpoint: String = "",
    val code: String = "",
    val isClaiming: Boolean = false,
    val errorMessage: String? = null,
    val completed: Boolean = false,
)

class PairingViewModel(
    private val pairingCoordinator: PairingCoordinator,
    private val payloadParser: PairingPayloadParser,
    private val deviceNameProvider: () -> String,
) : ViewModel() {
    private val _uiState = MutableStateFlow(PairingUiState())
    val uiState: StateFlow<PairingUiState> = _uiState.asStateFlow()

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

    fun onQrScanned(payload: String) {
        if (_uiState.value.isClaiming) {
            return
        }

        val parsed = runCatching { payloadParser.parse(payload) }
            .getOrElse { error ->
                _uiState.update { current ->
                    current.copy(errorMessage = error.message ?: "Invalid QR code")
                }
                return
            }

        claim(parsed.endpoint, parsed.code)
    }

    fun submitManualPairing() {
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

        claim(parsed.endpoint, parsed.code)
    }

    private fun claim(endpoint: String, code: String) {
        _uiState.update { current ->
            current.copy(isClaiming = true, errorMessage = null)
        }

        viewModelScope.launch {
            val result = pairingCoordinator.pair(
                endpoint = endpoint,
                code = code,
                deviceName = deviceNameProvider(),
            )

            _uiState.update { current ->
                result.fold(
                    onSuccess = {
                        current.copy(isClaiming = false, completed = true, errorMessage = null)
                    },
                    onFailure = { error ->
                        current.copy(
                            isClaiming = false,
                            errorMessage = errorMessageFor(error),
                        )
                    },
                )
            }
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

class PairingViewModelFactory(
    private val pairingCoordinator: PairingCoordinator,
    private val payloadParser: PairingPayloadParser,
    private val deviceNameProvider: () -> String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(PairingViewModel::class.java)) {
            return PairingViewModel(
                pairingCoordinator = pairingCoordinator,
                payloadParser = payloadParser,
                deviceNameProvider = deviceNameProvider,
            ) as T
        }

        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}

fun defaultDeviceName(): String = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
