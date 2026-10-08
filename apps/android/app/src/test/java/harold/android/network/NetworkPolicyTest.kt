package harold.android.network

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards the cleartext policy without needing a device.
 * Every build type pairs with LAN hosts over http (ADR-0008), so the
 * allowance lives in main and no build type overrides it.
 */
class NetworkPolicyTest {
    @Test
    fun mainManifestUsesNetworkSecurityConfig() {
        val manifest = readRepoFile("app/src/main/AndroidManifest.xml")

        assertTrue(manifest.contains("android:networkSecurityConfig=\"@xml/network_security_config\""))
        assertFalse(manifest.contains("usesCleartextTraffic"))
    }

    @Test
    fun mainNetworkSecurityConfigPermitsCleartext() {
        val networkConfig = readRepoFile("app/src/main/res/xml/network_security_config.xml")

        assertTrue(
            Regex("""<base-config\s[^>]*cleartextTrafficPermitted="true"""").containsMatchIn(networkConfig),
        )
    }

    @Test
    fun debugBuildDoesNotOverrideNetworkPolicy() {
        val manifest = readRepoFile("app/src/debug/AndroidManifest.xml")

        assertFalse(manifest.contains("usesCleartextTraffic"))
        assertFalse(manifest.contains("networkSecurityConfig"))
        assertFalse(repoFileExists("app/src/debug/res/xml/network_security_config.xml"))
    }

    private fun candidates(relativePath: String): List<File> = listOf(
        File(relativePath),
        File("apps/android/$relativePath"),
        File("../$relativePath"),
    )

    private fun repoFileExists(relativePath: String): Boolean =
        candidates(relativePath).any { it.isFile }

    private fun readRepoFile(relativePath: String): String {
        val file = candidates(relativePath).firstOrNull { it.isFile }
            ?: error("Could not find $relativePath from ${File(".").absolutePath}")

        return file.readText()
    }
}
