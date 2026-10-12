package harold.android.credentials

import javax.inject.Inject
import javax.inject.Singleton

/**
 * In-memory copy of the device credential. OkHttp interceptors run on network
 * threads and cannot suspend on the encrypted store, so the session gateway
 * publishes the credential here whenever it reloads it.
 */
@Singleton
class CredentialHolder @Inject constructor() {
    @Volatile
    private var value: String? = null

    fun current(): String? = value

    fun set(credential: String?) {
        value = credential
    }
}
