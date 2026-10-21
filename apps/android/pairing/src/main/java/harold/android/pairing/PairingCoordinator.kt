package harold.android.pairing

import javax.inject.Inject

interface PairingCoordinator {
    suspend fun pair(
        endpoint: String,
        code: String,
        deviceName: String,
    ): Result<Unit>
}

class DefaultPairingCoordinator @Inject constructor(
    private val pairingApi: harold.android.network.PairingApi,
    private val credentialStore: harold.android.credentials.CredentialStore,
    private val sessionGateway: harold.android.session.SessionGateway,
) : PairingCoordinator {
    override suspend fun pair(
        endpoint: String,
        code: String,
        deviceName: String,
    ): Result<Unit> {
        val claimResult = pairingApi.claim(
            endpoint = endpoint,
            code = code,
            name = deviceName,
            platform = PLATFORM,
        )

        return claimResult.fold(
            onSuccess = { result ->
                val serverOrigin = harold.android.network.serverOriginFromEndpoint(endpoint)
                val stored = harold.android.credentials.StoredCredential(
                    formatVersion = FORMAT_VERSION,
                    deviceId = result.device.id,
                    serverOrigin = serverOrigin,
                    deviceName = result.device.name,
                    credential = result.credential,
                    name = haroldName(serverOrigin),
                    colorId = DEFAULT_COLOR_ID,
                    iconId = DEFAULT_ICON_ID,
                )

                credentialStore.replace(stored)
                sessionGateway.refresh()

                Result.success(Unit)
            },
            onFailure = { error ->
                Result.failure(error)
            },
        )
    }

    companion object {
        private const val PLATFORM = "android"
        private const val FORMAT_VERSION = 1
        private const val DEFAULT_COLOR_ID = "ink"
        private const val DEFAULT_ICON_ID = "mark"

        private fun haroldName(serverOrigin: String): String {
            val host = java.net.URI(serverOrigin).host
            if (host.isNullOrBlank()) {
                return serverOrigin
            }
            return host
        }
    }
}
