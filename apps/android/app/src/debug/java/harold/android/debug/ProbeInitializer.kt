package harold.android.debug

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import harold.android.chat.ChatAttachmentFixtures

/**
 * Starts the debug control plane on process start.
 *
 * A ContentProvider is the standard way to run code this early without a second
 * Application class, and it only exists in the debug manifest, so release builds
 * never compile or install this file.
 */
class ProbeInitializer : ContentProvider() {
    override fun onCreate(): Boolean {
        val app = context?.applicationContext ?: return false
        ProbeServer.start(app)
        // The fixture source lives in the chat module's debug variant, so the
        // capture driver can attach the pushed demo pair without a system picker.
        ChatAttachmentFixtures.install(app)
        return true
    }

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor? = null

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?,
    ): Int = 0
}
