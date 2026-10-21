package harold.android.credentials

import org.junit.Assert.assertEquals
import org.junit.Test

class SavedHaroldRosterTest {
    @Test
    fun savingASecondHaroldKeepsTheFirst() {
        val laptop = savedHarold(
            serverOrigin = "http://laptop.local:3847",
            credential = "devcred_laptop",
            name = "laptop",
        )
        val desktop = savedHarold(
            serverOrigin = "http://desktop.local:3847",
            credential = "devcred_desktop",
            name = "desktop",
        )

        val saved = upsertSavedHarold(upsertSavedHarold(emptyList(), laptop), desktop)

        assertEquals(listOf(laptop, desktop), saved)
    }

    @Test
    fun savingTheSameAddressReplacesThatHaroldAndKeepsTheOther() {
        val laptop = savedHarold(
            serverOrigin = "http://laptop.local:3847",
            credential = "devcred_laptop",
            name = "laptop",
        )
        val desktop = savedHarold(
            serverOrigin = "http://desktop.local:3847",
            credential = "devcred_desktop",
            name = "desktop",
        )
        val renamedLaptop = laptop.copy(
            credential = "devcred_laptop_new",
            name = "work laptop",
            colorId = "tide",
            iconId = "bolt",
        )

        val saved = upsertSavedHarold(upsertSavedHarold(emptyList(), laptop), desktop)
        val updated = upsertSavedHarold(saved, renamedLaptop)

        assertEquals(listOf(renamedLaptop, desktop), updated)
    }

    @Test
    fun aRosterRoundTripsEverySavedHarold() {
        val laptop = savedHarold(
            serverOrigin = "http://laptop.local:3847",
            credential = "devcred_laptop",
            name = "laptop",
        )
        val desktop = savedHarold(
            serverOrigin = "http://desktop.local:3847",
            credential = "devcred_desktop",
            name = "desktop",
        ).copy(deviceName = null)

        val saved = listOf(laptop, desktop)

        assertEquals(saved, decodeSavedHarolds(encodeSavedHarolds(saved)))
    }

    @Test
    fun aMissingRosterIsAnEmptyList() {
        assertEquals(emptyList<StoredCredential>(), decodeSavedHarolds(null))
    }
}

private fun savedHarold(
    serverOrigin: String,
    credential: String,
    name: String,
) = StoredCredential(
    formatVersion = 1,
    deviceId = "device_$name",
    serverOrigin = serverOrigin,
    deviceName = "Pixel",
    credential = credential,
    name = name,
    colorId = "ink",
    iconId = "mark",
)
