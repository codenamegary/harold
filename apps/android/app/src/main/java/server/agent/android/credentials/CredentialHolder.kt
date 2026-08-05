package server.agent.android.credentials

/**
 * In-memory copy of the device credential. OkHttp interceptors run on network
 * threads and cannot suspend on the encrypted store, so the session gateway
 * publishes the credential here whenever it reloads it.
 */
class CredentialHolder {
    @Volatile
    private var value: String? = null

    fun current(): String? = value

    fun set(credential: String?) {
        value = credential
    }
}
