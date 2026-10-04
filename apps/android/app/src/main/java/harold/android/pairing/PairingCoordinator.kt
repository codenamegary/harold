package harold.android.pairing

interface PairingCoordinator {
    suspend fun pair(
        endpoint: String,
        code: String,
        deviceName: String,
    ): Result<Unit>
}

class DefaultPairingCoordinator(
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
                val stored = harold.android.credentials.StoredCredential(
                    formatVersion = FORMAT_VERSION,
                    deviceId = result.device.id,
                    serverOrigin = harold.android.network.serverOriginFromEndpoint(endpoint),
                    deviceName = result.device.name,
                    credential = result.credential,
                )

                credentialStore.save(stored)
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
    }
}
