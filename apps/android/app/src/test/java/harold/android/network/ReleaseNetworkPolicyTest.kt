package harold.android.network

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards the release cleartext policy without needing a device.
 * Debug may permit cleartext. Release must not enable it in the manifest merge inputs.
 */
class ReleaseNetworkPolicyTest {
    @Test
    fun mainManifestDoesNotEnableCleartextTraffic() {
        val manifest = readRepoFile("app/src/main/AndroidManifest.xml")

        assertFalse(manifest.contains("usesCleartextTraffic=\"true\""))
        assertFalse(manifest.contains("networkSecurityConfig"))
    }

    @Test
    fun debugManifestEnablesCleartextForLocalDevelopment() {
        val manifest = readRepoFile("app/src/debug/AndroidManifest.xml")
        val networkConfig = readRepoFile("app/src/debug/res/xml/network_security_config.xml")

        assertTrue(manifest.contains("usesCleartextTraffic=\"true\""))
        assertTrue(networkConfig.contains("cleartextTrafficPermitted=\"true\""))
    }

    private fun readRepoFile(relativePath: String): String {
        val candidates = listOf(
            File(relativePath),
            File("apps/android/$relativePath"),
            File("../$relativePath"),
        )

        val file = candidates.firstOrNull { it.isFile }
            ?: error("Could not find $relativePath from ${File(".").absolutePath}")

        return file.readText()
    }
}
