package harold.android.pairing

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

interface PairingRequests {
    val pendingUri: StateFlow<String?>

    fun requestPairing(uri: String)
    fun consume(): String?
}

class DefaultPairingRequests : PairingRequests {
    private val _pendingUri = MutableStateFlow<String?>(null)
    override val pendingUri: StateFlow<String?> = _pendingUri.asStateFlow()

    override fun requestPairing(uri: String) {
        _pendingUri.value = uri
    }

    override fun consume(): String? {
        val current = _pendingUri.value
        _pendingUri.value = null
        return current
    }
}
