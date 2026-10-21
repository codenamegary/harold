package harold.android.pairing

import org.junit.Assert.assertEquals
import org.junit.Test
import harold.android.credentials.StoredCredential

class HaroldIdentityTest {
    @Test
    fun aNewHaroldUsesTheHostAndTheFirstFreeColorAndIcon() {
        val identity = proposedHaroldIdentity(
            serverOrigin = "http://laptop.local:3847",
            saved = emptyList(),
        )

        assertEquals("laptop", identity.name)
        assertEquals(haroldColorIds.first(), identity.colorId)
        assertEquals(haroldIconIds.first(), identity.iconId)
    }

    @Test
    fun aTakenNameColorAndIconAreSkipped() {
        val saved = listOf(
            savedHarold(name = "laptop", colorId = haroldColorIds[0], iconId = haroldIconIds[0]),
            savedHarold(name = "laptop 2", colorId = haroldColorIds[1], iconId = haroldIconIds[1]),
        )

        val identity = proposedHaroldIdentity(
            serverOrigin = "http://laptop.local:3847",
            saved = saved,
        )

        assertEquals("laptop 3", identity.name)
        assertEquals(haroldColorIds[2], identity.colorId)
        assertEquals(haroldIconIds[2], identity.iconId)
    }

    @Test
    fun aFullPaletteStartsAgainAtTheFirstColorAndIcon() {
        val saved = haroldColorIds.zip(haroldIconIds).mapIndexed { index, (colorId, iconId) ->
            savedHarold(name = "host$index", colorId = colorId, iconId = iconId)
        }

        val identity = proposedHaroldIdentity(
            serverOrigin = "http://laptop.local:3847",
            saved = saved,
        )

        assertEquals("laptop", identity.name)
        assertEquals(haroldColorIds.first(), identity.colorId)
        assertEquals(haroldIconIds.first(), identity.iconId)
    }
}

private fun savedHarold(
    name: String,
    colorId: String,
    iconId: String,
) = StoredCredential(
    formatVersion = 1,
    deviceId = "device_$name",
    serverOrigin = "http://$name.example:3847",
    deviceName = "Pixel",
    credential = "devcred_$name",
    name = name,
    colorId = colorId,
    iconId = iconId,
)
