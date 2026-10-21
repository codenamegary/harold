package harold.android.chat

data class HaroldSessionGroup(
    val serverOrigin: String,
    val haroldName: String,
    val colorId: String,
    val iconId: String,
    val reachable: Boolean,
    val sessions: List<SessionRow>,
)

fun mergedSessionRows(groups: List<HaroldSessionGroup>): List<SessionRow> =
    groups.flatMap { group ->
        group.sessions.map { row ->
            row.copy(
                serverOrigin = group.serverOrigin,
                haroldName = group.haroldName,
                haroldColorId = group.colorId,
                haroldIconId = group.iconId,
                haroldReachable = group.reachable,
            )
        }
    }.sortedByDescending { row -> row.updatedAt }

fun visibleSessionRows(rows: List<SessionRow>, haroldOrigin: String?): List<SessionRow> =
    if (haroldOrigin == null) {
        rows
    } else {
        rows.filter { row -> row.serverOrigin == haroldOrigin }
    }
