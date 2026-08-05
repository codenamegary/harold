package server.agent.android.credentials

data class StoredCredential(
    val formatVersion: Int,
    val deviceId: String,
    val serverOrigin: String,
    val deviceName: String?,
    val credential: String,
)
