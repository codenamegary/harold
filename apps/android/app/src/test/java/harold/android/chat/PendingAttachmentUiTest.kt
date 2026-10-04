package harold.android.chat

import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.ImageBitmapConfig
import androidx.compose.ui.graphics.colorspace.ColorSpace
import androidx.compose.ui.graphics.colorspace.ColorSpaces
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import harold.android.contracts.AttachmentKind

/**
 * Pending chips live in a MutableStateFlow, which conflates structurally-equal
 * values. Equality must cover every UI-visible field, or upload lifecycle
 * changes (uploading -> ready/failed, preview arrival) are deduped away and
 * the composer chips freeze in their initial state.
 */
class PendingAttachmentUiTest {
    private fun uploadingChip(): PendingAttachmentUi = PendingAttachmentUi(
        localId = "att_local_1",
        name = "photo.png",
        size = 10L,
        kind = AttachmentKind.Image,
        mimeType = "image/png",
        bytes = ByteArray(10),
    )

    @Test
    fun `ready transition is visible to equality`() {
        val uploading = uploadingChip()
        val ready = uploading.copy(
            status = AttachmentUploadStatus.Ready,
            uploadedPath = "/workspace/.harold/attachments/att_1.png",
            uploadedId = "att_1",
        )

        assertNotEquals(uploading, ready)
    }

    @Test
    fun `failed transition is visible to equality`() {
        val uploading = uploadingChip()
        val failed = uploading.copy(
            status = AttachmentUploadStatus.Failed,
            error = "Upload failed",
        )

        assertNotEquals(uploading, failed)
    }

    @Test
    fun `preview arrival is visible to equality`() {
        val withoutPreview = uploadingChip()
        val withPreview = withoutPreview.copy(preview = FakeImageBitmap())

        assertNotEquals(withoutPreview, withPreview)
    }

    @Test
    fun `reapplying the same state does not produce a new value`() {
        val chip = uploadingChip()
        val sameAgain = chip.copy()

        assertEquals(chip, sameAgain)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun `state flow emits upload lifecycle changes`() = runTest {
        val uploading = uploadingChip()
        val flow = MutableStateFlow(ChatUiState(pendingAttachments = listOf(uploading)))
        val emissions = mutableListOf<List<PendingAttachmentUi>>()
        val collector = launch(start = CoroutineStart.UNDISPATCHED) {
            flow.collect { emissions.add(it.pendingAttachments) }
        }

        // The same update pattern ChatViewModel.uploadAttachment uses.
        flow.update { current ->
            current.copy(
                pendingAttachments = current.pendingAttachments.map { existing ->
                    if (existing.localId == uploading.localId) {
                        existing.copy(
                            status = AttachmentUploadStatus.Ready,
                            uploadedPath = "/workspace/.harold/attachments/att_1.png",
                            uploadedId = "att_1",
                        )
                    } else {
                        existing
                    }
                },
            )
        }
        advanceUntilIdle()

        assertEquals(2, emissions.size)
        assertEquals(AttachmentUploadStatus.Ready, emissions[1].single().status)
        assertEquals("att_1", emissions[1].single().uploadedId)
        collector.cancel()
    }

    @Test
    fun `different local ids are never equal`() {
        val first = uploadingChip()
        val second = first.copy(localId = "att_local_2")

        assertNotEquals(first, second)
        assertTrue(first != second)
    }

    /** Minimal ImageBitmap; the interface has no structural equality by design. */
    private class FakeImageBitmap : ImageBitmap {
        override val width: Int = 1
        override val height: Int = 1
        override val colorSpace: ColorSpace = ColorSpaces.Srgb
        override val hasAlpha: Boolean = false
        override val config: ImageBitmapConfig = ImageBitmapConfig.Argb8888

        override fun readPixels(
            buffer: IntArray,
            bufferOffset: Int,
            stride: Int,
            startX: Int,
            startY: Int,
            width: Int,
            height: Int,
        ) = Unit

        override fun prepareToDraw() = Unit
    }
}
