package harold.android.transport.ssh

import com.jcraft.jsch.JSch
import java.io.ByteArrayOutputStream
import java.security.SecureRandom
import java.util.Base64
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters

data class GeneratedSshKey(
    val algorithm: String,
    val privateKeyPem: String,
    val publicKey: String,
)

/**
 * Generates the phone-owned key pair used for direct mode. Ed25519 is preferred;
 * if the bundled crypto provider cannot create it, ECDSA P-256 is the fallback.
 * Both formats are plain OpenSSH keys, so the host only sees one authorized_keys
 * line either way.
 */
object SshKeyGenerator {
    private const val COMMENT = "harold-direct@android"

    fun generate(): GeneratedSshKey {
        val ed25519 = runCatching { generateEd25519() }
        if (ed25519.isSuccess) {
            return ed25519.getOrThrow()
        }
        android.util.Log.w("SshKeyGenerator", "Ed25519 failed, falling back to ECDSA", ed25519.exceptionOrNull())
        return generateEcdsa()
    }

    private fun generateEd25519(): GeneratedSshKey {
        val random = SecureRandom()
        val privateKey = Ed25519PrivateKeyParameters(random)
        val publicKey = privateKey.generatePublicKey().encoded
        val privateBytes = privateKey.encoded
        val publicBlob = buildPublicBlob(publicKey)
        val privateBlock = ByteArrayOutputStream().apply {
            val check = random.nextInt()
            writeUInt32(this, check)
            writeUInt32(this, check)
            writeString(this, "ssh-ed25519".toByteArray())
            writeString(this, publicKey)
            writeString(this, privateBytes + publicKey)
            writeString(this, COMMENT.toByteArray())
            var padding = 1
            // At least one padding byte is required, even when the block is
            // already aligned.
            do {
                write(padding++)
            } while (size() % 8 != 0)
        }
        val blob = ByteArrayOutputStream().apply {
            // The openssh-key-v1 magic is raw bytes, not an SSH string.
            write("openssh-key-v1\u0000".toByteArray())
            writeString(this, "none".toByteArray())
            writeString(this, "none".toByteArray())
            writeString(this, ByteArray(0))
            writeUInt32(this, 1)
            writeString(this, publicBlob)
            writeString(this, privateBlock.toByteArray())
        }
        val pem = buildString {
            appendLine("-----BEGIN OPENSSH PRIVATE KEY-----")
            val encoded = Base64.getEncoder().encodeToString(blob.toByteArray())
            encoded.chunked(70).forEach { line -> appendLine(line) }
            appendLine("-----END OPENSSH PRIVATE KEY-----")
        }
        return GeneratedSshKey(
            algorithm = "ed25519",
            privateKeyPem = pem,
            publicKey = "ssh-ed25519 ${Base64.getEncoder().encodeToString(publicBlob)} $COMMENT",
        )
    }

    private fun generateEcdsa(): GeneratedSshKey {
        val jsch = JSch()
        configureJsch(jsch)
        val pair = com.jcraft.jsch.KeyPair.genKeyPair(jsch, com.jcraft.jsch.KeyPair.ECDSA, 256)
        val privateKey = ByteArrayOutputStream().use { output ->
            pair.writePrivateKey(output)
            output.toString(Charsets.UTF_8.name())
        }
        val publicKey = ByteArrayOutputStream().use { output ->
            pair.writePublicKey(output, COMMENT)
            output.toString(Charsets.UTF_8.name()).trim()
        }
        pair.dispose()
        return GeneratedSshKey(
            algorithm = "ecdsa-p256",
            privateKeyPem = privateKey,
            publicKey = publicKey,
        )
    }

    private fun buildPublicBlob(publicKey: ByteArray): ByteArray =
        ByteArrayOutputStream().apply {
            writeString(this, "ssh-ed25519".toByteArray())
            writeString(this, publicKey)
        }.toByteArray()

    private fun writeUInt32(output: ByteArrayOutputStream, value: Int) {
        output.write((value ushr 24) and 0xff)
        output.write((value ushr 16) and 0xff)
        output.write((value ushr 8) and 0xff)
        output.write(value and 0xff)
    }

    private fun writeString(output: ByteArrayOutputStream, value: ByteArray) {
        writeUInt32(output, value.size)
        output.write(value)
    }
}

/**
 * Android's JCE provider does not expose Ed25519 on every API level. JSch ships
 * a BouncyCastle-backed generator and signer; prefer those so the phone can
 * still create and use Ed25519.
 */
fun configureJsch(jsch: JSch) {
    runCatching {
        JSch.setConfig("keypairgen.eddsa", "com.jcraft.jsch.bc.KeyPairGenEdDSA")
        JSch.setConfig("signature.eddsa", "com.jcraft.jsch.bc.SignatureEdDSA")
        // KeyPairEdDSA looks up the signature by SSH algorithm name.
        JSch.setConfig("signature.ssh-ed25519", "com.jcraft.jsch.bc.SignatureEd25519")
        JSch.setConfig("signature.ssh-ed448", "com.jcraft.jsch.bc.SignatureEd448")
    }
}
