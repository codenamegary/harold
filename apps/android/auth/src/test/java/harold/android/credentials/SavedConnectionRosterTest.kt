package harold.android.credentials

import org.junit.Assert.assertEquals
import org.junit.Test

class SavedConnectionRosterTest {
    @Test
    fun savingASecondHaroldKeepsTheFirst() {
        val laptop = savedConnection(
            connectionId = "ssh://gary@laptop.local:22",
            name = "laptop",
        )
        val desktop = savedConnection(
            connectionId = "ssh://gary@desktop.local:22",
            name = "desktop",
        )

        val saved = upsertSavedConnection(upsertSavedConnection(emptyList(), laptop), desktop)

        assertEquals(listOf(laptop, desktop), saved)
    }

    @Test
    fun savingTheSameAddressReplacesThatHaroldAndKeepsTheOther() {
        val laptop = savedConnection(
            connectionId = "ssh://gary@laptop.local:22",
            name = "laptop",
        )
        val desktop = savedConnection(
            connectionId = "ssh://gary@desktop.local:22",
            name = "desktop",
        )
        val renamedLaptop = laptop.copy(
            name = "work laptop",
            colorId = "tide",
            iconId = "bolt",
        )

        val saved = upsertSavedConnection(upsertSavedConnection(emptyList(), laptop), desktop)
        val updated = upsertSavedConnection(saved, renamedLaptop)

        assertEquals(listOf(renamedLaptop, desktop), updated)
    }

    @Test
    fun aRosterRoundTripsEverySavedConnection() {
        val laptop = savedConnection(
            connectionId = "ssh://gary@laptop.local:22",
            name = "laptop",
        )
        val desktop = savedConnection(
            connectionId = "ssh://gary@desktop.local:22",
            name = "desktop",
        ).copy(deviceName = null)

        val saved = listOf(laptop, desktop)

        assertEquals(saved, decodeSavedConnections(encodeSavedConnections(saved)))
    }

    @Test
    fun aMissingRosterIsAnEmptyList() {
        assertEquals(emptyList<SavedConnection>(), decodeSavedConnections(null))
    }

    @Test
    fun aConnectionRoundTripsItsSshKeyAndFingerprint() {
        val connection = SavedConnection(
            formatVersion = 3,
            connectionId = "ssh://gary@laptop.local:22",
            deviceName = "laptop.local",
            name = "laptop",
            colorId = "tide",
            iconId = "terminal",
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

        assertEquals(listOf(connection), decodeSavedConnections(encodeSavedConnections(listOf(connection))))
    }

    @Test
    fun aPasswordConnectionRoundTripsItsSecret() {
        val connection = SavedConnection(
            formatVersion = 3,
            connectionId = "ssh://gary@laptop.local:22",
            deviceName = "laptop.local",
            name = "laptop",
            colorId = "tide",
            iconId = "terminal",
            ssh = SshConfig(
                host = "laptop.local",
                port = 22,
                user = "gary",
                auth = SshAuth.Password(secret = "hunter2"),
                hostKeyFingerprint = "SHA256:abc",
            ),
        )

        assertEquals(listOf(connection), decodeSavedConnections(encodeSavedConnections(listOf(connection))))
    }
}

private fun savedConnection(
    connectionId: String,
    name: String,
) = SavedConnection(
    formatVersion = 3,
    connectionId = connectionId,
    deviceName = "Pixel",
    name = name,
    colorId = "ink",
    iconId = "mark",
    ssh = SshConfig(
        host = "host.local",
        port = 22,
        user = "gary",
        auth = SshAuth.Password(secret = "hunter2"),
        hostKeyFingerprint = "SHA256:abc",
    ),
)
