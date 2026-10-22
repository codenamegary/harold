package harold.android.pairing

import harold.android.credentials.StoredCredential
import harold.android.ui.components.haroldColorPalette
import harold.android.ui.components.haroldIconCatalog

data class HaroldAppearance(
    val name: String,
    val colorId: String,
    val iconId: String,
)

val haroldColorIds: List<String> = haroldColorPalette.map { option -> option.id }

val haroldIconIds: List<String> = haroldIconCatalog.map { option -> option.id }

fun proposedHaroldIdentity(
    serverOrigin: String,
    saved: List<StoredCredential>,
): HaroldAppearance {
    val host = java.net.URI(serverOrigin).host?.takeIf { host -> host.isNotBlank() } ?: serverOrigin
    val usedNames = saved.map { harold -> harold.name }.toSet()
    return HaroldAppearance(
        name = unusedName(displayName(host), usedNames),
        colorId = firstFree(haroldColorIds, saved.map { harold -> harold.colorId }.toSet()),
        iconId = firstFree(haroldIconIds, saved.map { harold -> harold.iconId }.toSet()),
    )
}

private fun unusedName(base: String, usedNames: Set<String>): String {
    if (base !in usedNames) {
        return base
    }
    var number = 2
    while ("$base $number" in usedNames) {
        number += 1
    }
    return "$base $number"
}

private fun firstFree(options: List<String>, used: Set<String>): String =
    options.firstOrNull { option -> option !in used } ?: options.first()

private fun displayName(host: String): String {
    val parts = host.split('.')
    val ipv4 = parts.size == 4 && parts.all { part -> part.isNotEmpty() && part.all { char -> char.isDigit() } }
    if (ipv4 || host.contains(':')) {
        return host
    }
    return host.substringBefore('.')
}
