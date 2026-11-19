package harold.android.chat

/**
 * Adds a parent-path suffix to rows that share a name. The first suffix is the
 * first segment after the paths' common prefix, so two `harold` folders under
 * `~/sites` and `~/harold-demo-workspaces/3847` read as `harold (sites)` and
 * `harold (harold-demo-workspaces)`.
 *
 * When the first differing segment is not enough, more parent segments are
 * added. Rows that cannot be told apart by their parent paths fall back to the
 * full parent path and, as a last resort, a numeric marker. Labels are unique
 * within the returned list.
 */
internal fun disambiguateWorkspaceLabels(rows: List<WorkspaceRow>): List<WorkspaceRow> {
    val suffixes = mutableMapOf<Int, String>()
    rows.withIndex()
        .groupBy { indexed -> indexed.value.name }
        .forEach { (_, indexedRows) ->
            if (indexedRows.size < 2) {
                return@forEach
            }
            val group = indexedRows.map { indexed -> indexed.value }
            val parents = group.map { row -> parentSegments(row.path) }
            val commonDepth = commonPrefixDepth(parents)
            val maxRemaining = parents.maxOfOrNull { segments -> segments.size - commonDepth } ?: 0
            val candidates = uniqueCandidates(
                rows = group,
                parents = parents,
                commonDepth = commonDepth,
                maxRemaining = maxRemaining,
            )
            indexedRows.forEachIndexed { index, indexed ->
                suffixes[indexed.index] = candidates[index]
            }
        }

    return rows.mapIndexed { index, row ->
        row.copy(pickerSuffix = suffixes[index].orEmpty())
    }
}

private fun uniqueCandidates(
    rows: List<WorkspaceRow>,
    parents: List<List<String>>,
    commonDepth: Int,
    maxRemaining: Int,
): List<String> {
    for (take in 1..maxRemaining) {
        val candidates = parents.mapIndexed { index, segments ->
            segments
                .drop(commonDepth)
                .take(take)
                .joinToString("/")
                .ifEmpty { fallbackLabel(rows[index]) }
        }
        if (candidates.toSet().size == candidates.size) {
            return candidates
        }
    }
    return makeUnique(parents.mapIndexed { index, _ -> fallbackLabel(rows[index]) })
}

private fun makeUnique(labels: List<String>): List<String> {
    val used = mutableSetOf<String>()
    return labels.map { label ->
        var candidate = label
        var number = 2
        while (!used.add(candidate)) {
            candidate = "$label #$number"
            number += 1
        }
        candidate
    }
}

private fun fallbackLabel(row: WorkspaceRow): String {
    val parent = parentPath(row.path)
    return parent
        .takeIf { path -> path.isNotEmpty() && path != "/" }
        ?: row.path.ifEmpty { row.name }
}

private fun parentPath(path: String): String {
    val normalized = path.trimEnd('/', '\\')
    val index = normalized.lastIndexOfAny(charArrayOf('/', '\\'))
    return if (index <= 0) {
        ""
    } else {
        normalized.substring(0, index)
    }
}

private fun parentSegments(path: String): List<String> =
    path
        .split('/', '\\')
        .filter { segment -> segment.isNotEmpty() }
        .dropLast(1)

private fun commonPrefixDepth(paths: List<List<String>>): Int {
    val shortest = paths.minOfOrNull { segments -> segments.size } ?: return 0
    val first = paths.first()
    var depth = 0
    while (depth < shortest && paths.all { segments -> segments[depth] == first[depth] }) {
        depth += 1
    }
    return depth
}
