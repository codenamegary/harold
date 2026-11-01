package harold.android.changes

import harold.android.contracts.GitChangedFile
import harold.android.contracts.GitFileStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FileTreeTest {
    private val files = listOf(
        changed("apps/android/a.kt", additions = 10, deletions = 2),
        changed("apps/android/nested/b.kt", additions = 5),
        changed("README.md", additions = 1, deletions = 1),
    )

    @Test
    fun foldersComeFirstAndAggregateChildStats() {
        val tree = buildFileTree(files)

        assertEquals(listOf("apps/android", "README.md"), tree.map { it.name })
        val apps = tree.first()
        assertTrue(apps.folder)
        assertEquals(2, apps.fileCount)
        assertEquals(15, apps.additions)
        assertEquals(2, apps.deletions)
        assertEquals(listOf("nested", "a.kt"), apps.children.map { it.name })
    }

    @Test
    fun flattenHonorsCollapsedFolders() {
        val tree = buildFileTree(files)
        val expanded = flattenFileTree(tree, collapsedFolders = emptySet())
        assertEquals(
            listOf("apps/android", "nested", "b.kt", "a.kt", "README.md"),
            expanded.map { it.name },
        )

        val collapsed = flattenFileTree(tree, collapsedFolders = setOf("apps/android"))
        assertEquals(
            listOf("apps/android", "README.md"),
            collapsed.map { it.name },
        )
    }

    @Test
    fun folderKeysIncludeEveryFolder() {
        val tree = buildFileTree(files)
        assertEquals(
            setOf("apps/android", "apps/android/nested"),
            folderKeys(tree),
        )
    }

    @Test
    fun binaryFilesDoNotContributeLineStats() {
        val tree = buildFileTree(
            listOf(
                changed("docs/logo.png", additions = null, deletions = null, binary = true),
            ),
        )
        assertEquals(1, tree.first().fileCount)
        assertEquals(0, tree.first().additions)
        assertEquals(0, tree.first().deletions)
    }

    private fun changed(
        path: String,
        additions: Int? = null,
        deletions: Int? = null,
        binary: Boolean = false,
    ): GitChangedFile = GitChangedFile(
        path = path,
        status = GitFileStatus.Modified,
        additions = additions,
        deletions = deletions,
        binary = binary,
    )
}
