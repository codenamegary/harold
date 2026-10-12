package harold.android.network

data class ClaimedDevice(
    val id: String,
    val name: String,
    val platform: String?,
)

data class PairingClaimResult(
    val device: ClaimedDevice,
    val credential: String,
)

sealed interface PairingClaimError {
    data class Problem(
        val title: String,
        val detail: String?,
        val status: Int,
    ) : PairingClaimError

    data class Transport(
        val cause: Throwable,
    ) : PairingClaimError
}

interface PairingApi {
    suspend fun claim(
        endpoint: String,
        code: String,
        name: String,
        platform: String,
    ): Result<PairingClaimResult>
}

class PairingClaimException(
    val error: PairingClaimError,
) : Exception()
