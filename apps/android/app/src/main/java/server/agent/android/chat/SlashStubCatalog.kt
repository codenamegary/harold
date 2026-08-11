package server.agent.android.chat

data class SlashStubCommand(
    val id: String,
    val name: String,
    val description: String,
)

object SlashStubCatalog {
    /** Local placeholders only. No skills HTTP. */
    val commands: List<SlashStubCommand> = listOf(
        SlashStubCommand(
            id = "stub-skill",
            name = "stub-skill",
            description = "Placeholder skill reference",
        ),
        SlashStubCommand(
            id = "stub-help",
            name = "stub-help",
            description = "Placeholder help command",
        ),
    )
}

fun activeSlashQuery(composerText: String): String? {
    val match = Regex("""(?:^|\s)/([^\s]*)$""").find(composerText) ?: return null
    return match.groupValues[1]
}

fun filterSlashStubs(
    query: String,
    catalog: List<SlashStubCommand> = SlashStubCatalog.commands,
): List<SlashStubCommand> {
    val normalized = query.lowercase()
    if (normalized.isEmpty()) {
        return catalog
    }
    return catalog.filter { command ->
        command.name.lowercase().startsWith(normalized) ||
            command.description.lowercase().contains(normalized)
    }
}

fun insertSlashStub(composerText: String, commandName: String): String {
    val slashIndex = composerText.lastIndexOf('/')
    if (slashIndex < 0) {
        return composerText
    }
    return composerText.take(slashIndex) + "/$commandName "
}
