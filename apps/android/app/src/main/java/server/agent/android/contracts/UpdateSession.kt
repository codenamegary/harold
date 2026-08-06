package server.agent.android.contracts

import kotlinx.serialization.Serializable

@Serializable
data class UpdateSessionBody(
    val name: String,
)
