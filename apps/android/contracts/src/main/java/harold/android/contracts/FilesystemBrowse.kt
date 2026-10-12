package harold.android.contracts

import kotlinx.serialization.Serializable

@Serializable
data class FilesystemDirectory(
    val name: String,
    val path: String,
)

@Serializable
data class FilesystemDirectoryCollection(
    val items: List<FilesystemDirectory>,
)
