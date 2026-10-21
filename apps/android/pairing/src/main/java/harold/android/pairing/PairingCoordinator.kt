package harold.android.pairing

import javax.inject.Inject

data class PairingDraft(
    val serverOrigin: String,
    val alreadySaved: Boolean,
    val appearance: HaroldAppearance,
)

interface PairingCoordinator {
    suspend fun draft(endpoint: String): PairingDraft

    suspend fun pair(
        endpoint: String,
        code: String,
        deviceName: String,
        appearance: HaroldAppearance,
    ): Result<Unit>
}

class DefaultPairingCoordinator @Inject constructor(
    private val pairingApi: harold.android.network.PairingApi,
    private val credentialStore: harold.android.credentials.CredentialStore,
    private val sessionGateway: harold.android.session.SessionGateway,
) : PairingCoordinator {
    override suspend fun draft(endpoint: String): PairingDraft {
        val serverOrigin = harold.android.network.serverOriginFromEndpoint(endpoint)
        val saved = credentialStore.list()
        val existing = saved.find { harold -> harold.serverOrigin == serverOrigin }
        if (existing != null) {
            return PairingDraft(
                serverOrigin = serverOrigin,
                alreadySaved = true,
                appearance = HaroldAppearance(
                    name = existing.name,
                    colorId = existing.colorId,
                    iconId = existing.iconId,
                ),
            )
        }

        return PairingDraft(
            serverOrigin = serverOrigin,
            alreadySaved = false,
            appearance = proposedHaroldIdentity(serverOrigin, saved),
        )
    }

    override suspend fun pair(
        endpoint: String,
        code: String,
        deviceName: String,
        appearance: HaroldAppearance,
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
                    name = appearance.name,
                    colorId = appearance.colorId,
                    iconId = appearance.iconId,
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
