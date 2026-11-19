package harold.android.chat

import harold.android.contracts.WorkspaceState
import org.junit.Assert.assertEquals
import org.junit.Test

class WorkspaceLabelsTest {
    @Test
    fun addsTheFirstDifferingParentSegmentForTwoDuplicateNames() {
        val rows = listOf(
            row(id = "saved", path = "/home/u/sites/harold"),
            row(id = "session", path = "/home/u/harold-demo-workspaces/3847/harold"),
        )

        val labeled = disambiguateWorkspaceLabels(rows)

        assertEquals(listOf("harold (sites)", "harold (harold-demo-workspaces)"), labeled.map { it.pickerLabel() })
    }

    @Test
    fun keepsUniqueNamesUnchanged() {
        val rows = listOf(
            row(id = "notes", name = "notes", path = "/home/u/sites/notes"),
            row(id = "harold", name = "harold", path = "/home/u/sites/harold"),
        )

        val labeled = disambiguateWorkspaceLabels(rows)

        assertEquals(listOf("notes", "harold"), labeled.map { it.pickerLabel() })
        assertEquals(listOf("", ""), labeled.map { it.pickerSuffix })
    }

    @Test
    fun addsMoreContextForThreeDuplicates() {
        val rows = listOf(
            row(id = "a", path = "/home/u/a/x/harold"),
            row(id = "b", path = "/home/u/a/y/harold"),
            row(id = "c", path = "/home/u/b/z/harold"),
        )

        val labeled = disambiguateWorkspaceLabels(rows)

        assertEquals(
            listOf(
                "harold (a/x)",
                "harold (a/y)",
                "harold (b/z)",
            ),
            labeled.map { it.pickerLabel() },
        )
        assertEquals(labeled.size, labeled.map { it.pickerLabel() }.toSet().size)
    }

    @Test
    fun fallsBackToTheParentPathForShallowPaths() {
        val rows = listOf(
            row(id = "a", path = "/harold"),
            row(id = "b", path = "/other/harold"),
        )

        val labeled = disambiguateWorkspaceLabels(rows)

        assertEquals(listOf("harold (/harold)", "harold (other)"), labeled.map { it.pickerLabel() })
    }

    @Test
    fun identicalPathsStillGetUniqueLabels() {
        val rows = listOf(
            row(id = "a", path = "/home/u/sites/harold"),
            row(id = "b", path = "/home/u/sites/harold"),
        )

        val labels = disambiguateWorkspaceLabels(rows).map { it.pickerLabel() }

        assertEquals(labels.size, labels.toSet().size)
    }

    @Test
    fun preservesRowOrder() {
        val rows = listOf(
            row(id = "first", name = "harold", path = "/home/u/sites/harold"),
            row(id = "other", name = "notes", path = "/home/u/notes"),
            row(id = "last", name = "harold", path = "/home/u/demo/harold"),
        )

        val labeled = disambiguateWorkspaceLabels(rows)

        assertEquals(listOf("first", "other", "last"), labeled.map { it.id })
    }

    private fun row(
        id: String,
        name: String = "harold",
        path: String,
    ) = WorkspaceRow(
        id = id,
        name = name,
        path = path,
        state = WorkspaceState.Available,
    )
}
