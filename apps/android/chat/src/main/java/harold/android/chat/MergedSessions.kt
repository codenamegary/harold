package harold.android.chat

data class HaroldSessionGroup(
    val connectionId: String,
    val connectionName: String,
    val colorId: String,
    val iconId: String,
    val reachable: Boolean,
    val sessions: List<SessionRow>,
)

fun mergedSessionRows(groups: List<HaroldSessionGroup>): List<SessionRow> =
    groups.flatMap { group ->
        group.sessions.map { row ->
            row.copy(
                connectionId = group.connectionId,
                connectionName = group.connectionName,
                connectionColorId = group.colorId,
                connectionIconId = group.iconId,
                connectionReachable = group.reachable,
            )
        }
    }.sortedByDescending { row -> row.updatedAt }

fun visibleSessionRows(rows: List<SessionRow>, haroldOrigin: String?): List<SessionRow> =
    if (haroldOrigin == null) {
        rows
    } else {
        rows.filter { row -> row.connectionId == haroldOrigin }
    }
