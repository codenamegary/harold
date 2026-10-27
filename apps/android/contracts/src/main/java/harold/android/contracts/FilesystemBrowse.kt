package harold.android.contracts

import kotlinx.serialization.Serializable

@Serializable
data class FilesystemDirectory(
    val name: String,
    val path: String,
)

@Serializable
data class FilesystemDirectoryCollection(
    val path: String,
    val parent: String? = null,
    val items: List<FilesystemDirectory>,
)

@Serializable
data class CreateFilesystemDirectoryBody(
    val parent: String,
    val name: String,
)

@Serializable
data class FilesystemDirectoryCreated(
    val name: String,
    val path: String,
)
