package harold.android.changes

import harold.android.contracts.GitChangedFile

/** A flattened row in the repo-relative directory tree. Folders carry rolled-up stats. */
data class FileTreeNode(
    val path: String,
    val name: String,
    val depth: Int,
    val folder: Boolean,
    val file: GitChangedFile? = null,
    val fileCount: Int = 0,
    val additions: Int = 0,
    val deletions: Int = 0,
    val children: List<FileTreeNode> = emptyList(),
)

/**
 * Builds the directory tree for one diff scope. Folders come before files at
 * every level, and every folder aggregates its descendants.
 */
fun buildFileTree(files: List<GitChangedFile>): List<FileTreeNode> =
    buildFolder(files).freeze(depth = 0).children

/** Flattens the tree to LazyColumn rows, skipping children under collapsed folders. */
fun flattenFileTree(
    nodes: List<FileTreeNode>,
    collapsedFolders: Set<String>,
): List<FileTreeNode> = buildList {
    fun visit(node: FileTreeNode) {
        add(node)
        if (node.folder && node.path !in collapsedFolders) {
            node.children.forEach(::visit)
        }
    }
    nodes.forEach(::visit)
}

/** Every folder path in the tree, for a collapse-all action. */
fun folderKeys(nodes: List<FileTreeNode>): Set<String> {
    val keys = linkedSetOf<String>()
    fun visit(node: FileTreeNode) {
        if (node.folder) {
            keys += node.path
            node.children.forEach(::visit)
        }
    }
    nodes.forEach(::visit)
    return keys
}

private class MutableFolder(
    val name: String,
    val path: String,
) {
    val folders = linkedMapOf<String, MutableFolder>()
    val files = linkedMapOf<String, GitChangedFile>()

    fun insert(file: GitChangedFile) {
        val segments = file.path.split('/').filter(String::isNotEmpty)
        insert(file, segments, index = 0)
    }

    private fun insert(file: GitChangedFile, segments: List<String>, index: Int) {
        if (index >= segments.lastIndex) {
            files[file.path] = file
            return
        }
        val name = segments[index]
        val child = folders.getOrPut(name) {
            MutableFolder(
                name = name,
                path = segments.take(index + 1).joinToString("/"),
            )
        }
        child.insert(file, segments, index + 1)
    }

    fun freeze(depth: Int, displayName: String = name): FileTreeNode {
        val folderNodes = folders.values
            .sortedBy { it.name.lowercase() }
            .map { it.freeze(depth + 1) }
        val fileNodes = files.values
            .sortedBy { it.path.substringAfterLast('/').lowercase() }
            .map { file ->
                FileTreeNode(
                    path = file.path,
                    name = file.path.substringAfterLast('/'),
                    depth = depth,
                    folder = false,
                    file = file,
                    fileCount = 1,
                    additions = file.additions ?: 0,
                    deletions = file.deletions ?: 0,
                )
            }
        if (folderNodes.size == 1 && fileNodes.isEmpty()) {
            val onlyFolder = folders.values.single()
            val combinedName = if (displayName.isEmpty()) {
                onlyFolder.name
            } else {
                "$displayName/${onlyFolder.name}"
            }
            return onlyFolder.freeze(depth = depth, displayName = combinedName)
        }
        val children = folderNodes + fileNodes
        return FileTreeNode(
            path = path,
            name = displayName,
            depth = depth,
            folder = true,
            fileCount = children.sumOf { it.fileCount },
            additions = children.sumOf { it.additions },
            deletions = children.sumOf { it.deletions },
            children = children,
        )
    }
}

private fun buildFolder(files: List<GitChangedFile>): MutableFolder =
    MutableFolder(name = "", path = "").apply {
        files.forEach(::insert)
    }
