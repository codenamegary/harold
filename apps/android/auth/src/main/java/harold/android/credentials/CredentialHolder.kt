package harold.android.credentials

import javax.inject.Inject
import javax.inject.Singleton

/**
 * In-memory copy of each saved Harold's device credential, keyed by server
 * origin. OkHttp interceptors run on network threads and cannot suspend on
 * the encrypted store, so the session gateway publishes the credentials here
 * whenever it reloads them.
 */
@Singleton
class CredentialHolder @Inject constructor() {
    private val credentials = mutableMapOf<String, String>()

    fun publish(credentialsByOrigin: Map<String, String>) {
        synchronized(this) {
            credentials.clear()
            credentials.putAll(credentialsByOrigin)
        }
    }

    fun credentialFor(serverOrigin: String): String? = synchronized(this) {
        credentials[serverOrigin]
    }

    fun clear() {
        publish(emptyMap())
    }
}
