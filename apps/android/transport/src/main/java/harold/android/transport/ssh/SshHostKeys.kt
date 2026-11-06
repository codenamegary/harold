package harold.android.transport.ssh

import com.jcraft.jsch.HostKey
import com.jcraft.jsch.HostKeyRepository
import com.jcraft.jsch.UserInfo
import java.security.MessageDigest
import java.util.Base64

/** `SHA256:<base64>` fingerprint over the raw SSH host key blob. */
fun hostKeyFingerprint(key: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(key)
    val encoded = Base64.getEncoder().withoutPadding().encodeToString(digest)
    return "SHA256:$encoded"
}

/**
 * Accepts exactly one pinned host key. A mismatch is reported as CHANGED,
 * which JSch treats as a hard failure before authentication.
 */
class PinnedHostKeyRepository(
    private val expectedFingerprint: String,
) : HostKeyRepository {
    override fun check(host: String?, key: ByteArray?): Int =
        if (key != null && hostKeyFingerprint(key) == expectedFingerprint) {
            HostKeyRepository.OK
        } else {
            HostKeyRepository.CHANGED
        }

    override fun add(hostkey: HostKey?, ui: UserInfo?) = Unit

    override fun remove(host: String?, type: String?) = Unit

    override fun remove(host: String?, type: String?, key: ByteArray?) = Unit

    override fun getKnownHostsRepositoryID(): String = "harold-pinned"

    override fun getHostKey(): Array<HostKey> = emptyArray()

    override fun getHostKey(host: String?, type: String?): Array<HostKey> = emptyArray()
}

/** Captures the first host key so setup can show it before the user trusts it. */
class CapturingHostKeyRepository : HostKeyRepository {
    var captured: String? = null
        private set

    override fun check(host: String?, key: ByteArray?): Int {
        if (key == null) {
            return HostKeyRepository.NOT_INCLUDED
        }
        if (captured == null) {
            captured = hostKeyFingerprint(key)
        }
        return if (hostKeyFingerprint(key) == captured) {
            HostKeyRepository.OK
        } else {
            HostKeyRepository.CHANGED
        }
    }

    override fun add(hostkey: HostKey?, ui: UserInfo?) = Unit

    override fun remove(host: String?, type: String?) = Unit

    override fun remove(host: String?, type: String?, key: ByteArray?) = Unit

    override fun getKnownHostsRepositoryID(): String = "harold-capture"

    override fun getHostKey(): Array<HostKey> = emptyArray()

    override fun getHostKey(host: String?, type: String?): Array<HostKey> = emptyArray()
}
