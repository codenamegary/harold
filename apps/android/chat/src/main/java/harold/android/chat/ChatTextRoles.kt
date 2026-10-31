package harold.android.chat

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Named roles for chat text, so components do not pick Material styles ad hoc. */
data class ChatTextRoles(
    val prompt: TextStyle,
    val body: TextStyle,
    val meta: TextStyle,
    val thinking: TextStyle,
)

@Composable
@ReadOnlyComposable
fun chatTextRoles(): ChatTextRoles {
    val typography = MaterialTheme.typography
    return ChatTextRoles(
        prompt = typography.bodyLarge.copy(
            fontSize = 16.sp,
            lineHeight = 24.sp,
            fontWeight = FontWeight.Medium,
        ),
        body = typography.bodyLarge.copy(
            fontSize = 16.sp,
            lineHeight = 24.sp,
            fontWeight = FontWeight.Normal,
        ),
        meta = typography.bodySmall.copy(
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontFamily = FontFamily.Monospace,
        ),
        thinking = typography.bodyMedium.copy(
            fontSize = 13.sp,
            lineHeight = 20.sp,
            fontStyle = FontStyle.Italic,
        ),
    )
}
