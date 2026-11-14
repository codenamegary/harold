package harold.android.chat

import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import java.io.File

/**
 * Debug-only source for the probe's `attach_fixture` action.
 *
 * This class only exists in the debug variant. The app's debug
 * `ProbeInitializer` installs it into [ChatProbeAttachmentFixtures], which is the
 * only seam the shared probe code knows about, so no fixture code is compiled
 * into a release build.
 *
 * It resolves the two assets the capture pipeline already pushed onto the
 * device: a photo from the device photo library and the `cat-mode.md` spec in
 * `Download/`. If either cannot be read (for example because the media read
 * permission was never granted) it returns nothing, so the probe action fails
 * loudly instead of filming a half-attached composer.
 */
object ChatAttachmentFixtures {
    private const val TAG = "HaroldProbe"
    private const val SPEC_FILE_NAME = "cat-mode.md"
    private const val FIXTURE_DIR = "harold-fixtures"

    private val IMAGE_EXTENSIONS = setOf("jpg", "jpeg", "png", "webp")

    /** Called once from the debug initializer, before any content is composed. */
    fun install(context: Context) {
        val app = context.applicationContext
        ChatProbeAttachmentFixtures.source = { readPicks(app) }
    }

    private fun readPicks(context: Context): List<AttachmentPick> {
        val photo = readDevicePhoto(context)
            ?: readFixtureDirectory(context, IMAGE_EXTENSIONS) { name ->
                mimeFor(name, "image/jpeg")
            }
        val spec = readDownloadedSpec(context)
            ?: readFixtureDirectory(context, setOf("md")) { name ->
                mimeFor(name, "text/markdown")
            }
        if (photo == null || spec == null) {
            Log.i(TAG, "attach_fixture refused: photo=${photo != null} spec=${spec != null}")
            return emptyList()
        }
        return listOf(photo, spec)
    }

    /** The newest image the photo library holds, which is what the picker sees. */
    private fun readDevicePhoto(context: Context): AttachmentPick? {
        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.MIME_TYPE,
        )
        val cursor = try {
            context.contentResolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection,
                null,
                null,
                "${MediaStore.Images.Media.DATE_ADDED} DESC",
            )
        } catch (error: Exception) {
            Log.i(TAG, "device photo query refused: ${error.message}")
            null
        } ?: return null

        cursor.use { rows ->
            while (rows.moveToNext()) {
                val id = rows.getLong(rows.getColumnIndexOrThrow(MediaStore.Images.Media._ID))
                val name = rows.getString(
                    rows.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME),
                ) ?: "photo.jpg"
                val uri = Uri.withAppendedPath(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    id.toString(),
                )
                val bytes = readBytes(context, uri) ?: continue
                val mimeType = rows.getString(
                    rows.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE),
                ) ?: mimeFor(name, "image/jpeg")
                return AttachmentPick(name = name, mimeType = mimeType, bytes = bytes)
            }
        }
        return null
    }

    private fun readDownloadedSpec(context: Context): AttachmentPick? =
        publicDownloadDirectory()
            ?.let { directory -> File(directory, SPEC_FILE_NAME) }
            ?.toAttachmentPick(mimeFor(SPEC_FILE_NAME, "text/markdown"))

    @Suppress("DEPRECATION")
    private fun publicDownloadDirectory(): File? = try {
        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    } catch (error: Exception) {
        Log.i(TAG, "download directory unavailable: ${error.message}")
        null
    }

    /**
     * Permission-free fallback: the driver can push the same two files to
     * `/sdcard/Android/data/<applicationId>/files/harold-fixtures/`.
     */
    private fun readFixtureDirectory(
        context: Context,
        extensions: Set<String>,
        mimeTypeFor: (String) -> String,
    ): AttachmentPick? {
        val directory = context.getExternalFilesDir(FIXTURE_DIR) ?: return null
        val file = directory.listFiles()
            ?.filter { candidate -> candidate.isFile && candidate.extension.lowercase() in extensions }
            ?.minByOrNull { candidate -> candidate.name }
            ?: return null
        return file.toAttachmentPick(mimeTypeFor(file.name))
    }

    private fun File.toAttachmentPick(mimeType: String): AttachmentPick? = try {
        if (!isFile) {
            null
        } else {
            AttachmentPick(name = name, mimeType = mimeType, bytes = readBytes())
        }
    } catch (error: Exception) {
        Log.i(TAG, "could not read $name: ${error.message}")
        null
    }

    private fun readBytes(context: Context, uri: Uri): ByteArray? = try {
        context.contentResolver.openInputStream(uri)?.use { stream -> stream.readBytes() }
    } catch (error: Exception) {
        Log.i(TAG, "could not read $uri: ${error.message}")
        null
    }

    private fun mimeFor(name: String, fallback: String): String =
        when (name.substringAfterLast('.', "").lowercase()) {
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "webp" -> "image/webp"
            "md" -> "text/markdown"
            else -> fallback
        }
}
