package server.agent.android.contracts

import kotlinx.serialization.Serializable

@Serializable
data class CancelSessionResponse(
    val turnId: String,
)
