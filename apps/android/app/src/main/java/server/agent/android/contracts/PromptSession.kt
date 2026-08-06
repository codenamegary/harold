package server.agent.android.contracts

import kotlinx.serialization.Serializable

@Serializable
data class PromptSessionBody(
    val text: String,
)

@Serializable
data class PromptSessionResponse(
    val turnId: String,
)
