package server.agent.android.chat

fun folderBasename(folderPath: String): String {
    val segments = folderPath.split('/').filter { segment -> segment.isNotEmpty() }
    require(segments.isNotEmpty()) { "folder path must include a basename" }
    return segments.last()
}
