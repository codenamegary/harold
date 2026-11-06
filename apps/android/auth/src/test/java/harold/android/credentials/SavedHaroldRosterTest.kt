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

    @Test
    fun rowsWrittenBeforeDirectModeDecodeAsServerConnections() {
        val raw = """[
            {
              "formatVersion": 1,
              "deviceId": "device_laptop",
              "serverOrigin": "http://laptop.local:3847",
              "deviceName": "Pixel",
              "credential": "devcred_laptop",
              "name": "laptop",
              "colorId": "ink",
              "iconId": "mark"
            }
        ]"""

        val saved = decodeSavedHarolds(raw).single()

        assertEquals(HaroldTransport.Server, saved.transport)
        assertEquals(null, saved.ssh)
    }

    @Test
    fun aDirectConnectionRoundTripsItsSshKeyAndFingerprint() {
        val direct = StoredCredential(
            formatVersion = 2,
            deviceId = "SHA256:abc",
            serverOrigin = "ssh://gary@laptop.local:22",
            deviceName = "laptop.local",
            credential = "",
            name = "laptop direct",
            colorId = "tide",
            iconId = "terminal",
            transport = HaroldTransport.Ssh,
            ssh = SshConfig(
                host = "laptop.local",
                port = 22,
                user = "gary",
                auth = SshAuth.PrivateKey(
                    pem = "-----BEGIN OPENSSH PRIVATE KEY-----\nkey\n-----END OPENSSH PRIVATE KEY-----",
                    publicKey = "ssh-ed25519 AAAA harold",
                ),
                hostKeyFingerprint = "SHA256:abc",
            ),
        )

        assertEquals(listOf(direct), decodeSavedHarolds(encodeSavedHarolds(listOf(direct))))
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
