package harold.android.credentials

import org.junit.Assert.assertEquals
import org.junit.Test

class SavedHaroldRosterTest {
    @Test
    fun savingASecondHaroldKeepsTheFirst() {
        val laptop = savedHarold(
            serverOrigin = "ssh://gary@laptop.local:22",
            name = "laptop",
        )
        val desktop = savedHarold(
            serverOrigin = "ssh://gary@desktop.local:22",
            name = "desktop",
        )

        val saved = upsertSavedHarold(upsertSavedHarold(emptyList(), laptop), desktop)

        assertEquals(listOf(laptop, desktop), saved)
    }

    @Test
    fun savingTheSameAddressReplacesThatHaroldAndKeepsTheOther() {
        val laptop = savedHarold(
            serverOrigin = "ssh://gary@laptop.local:22",
            name = "laptop",
        )
        val desktop = savedHarold(
            serverOrigin = "ssh://gary@desktop.local:22",
            name = "desktop",
        )
        val renamedLaptop = laptop.copy(
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
            serverOrigin = "ssh://gary@laptop.local:22",
            name = "laptop",
        )
        val desktop = savedHarold(
            serverOrigin = "ssh://gary@desktop.local:22",
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
    fun aConnectionRoundTripsItsSshKeyAndFingerprint() {
        val connection = StoredCredential(
            formatVersion = 3,
            serverOrigin = "ssh://gary@laptop.local:22",
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

        assertEquals(listOf(connection), decodeSavedHarolds(encodeSavedHarolds(listOf(connection))))
    }

    @Test
    fun aPasswordConnectionRoundTripsItsSecret() {
        val connection = StoredCredential(
            formatVersion = 3,
            serverOrigin = "ssh://gary@laptop.local:22",
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

        assertEquals(listOf(connection), decodeSavedHarolds(encodeSavedHarolds(listOf(connection))))
    }
}

private fun savedHarold(
    serverOrigin: String,
    name: String,
) = StoredCredential(
    formatVersion = 3,
    serverOrigin = serverOrigin,
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
