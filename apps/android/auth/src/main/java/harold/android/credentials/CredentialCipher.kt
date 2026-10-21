package harold.android.credentials

interface CredentialCipher {
    fun encrypt(plaintext: String): EncryptedBlob

    fun decrypt(blob: EncryptedBlob): String

    fun deleteKey()
}
