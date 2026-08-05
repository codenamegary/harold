package server.agent.android.contracts

import kotlinx.serialization.Serializable

@Serializable
data class PageInfo(
    val limit: Int,
    val nextCursor: String? = null,
    val previousCursor: String? = null,
    val count: Int? = null,
)

@Serializable
data class ItemCollection<T>(
    val items: List<T>,
    val page: PageInfo,
)
