package harold.android.chat

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mikepenz.markdown.m3.markdownTypography
import com.mikepenz.markdown.model.MarkdownDimens
import com.mikepenz.markdown.model.MarkdownTypography
import com.mikepenz.markdown.model.markdownDimens

private const val HEADING_LINE_HEIGHT_RATIO = 1.25f

/**
 * Chat-sized markdown text. The library defaults map headings to the Material display styles
 * (h1 is 57sp), which dwarf the 16sp body on a phone. Here body keeps the theme's bodyLarge
 * and headings stay within about 1.4x of it.
 */
@Composable
fun haroldMarkdownTypography(): MarkdownTypography {
    val typography = MaterialTheme.typography
    val body = typography.bodyLarge
    return markdownTypography(
        h1 = typography.titleLarge.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold)
            .withLineHeightRatio(),
        h2 = typography.titleLarge.copy(fontSize = 20.sp, fontWeight = FontWeight.Bold)
            .withLineHeightRatio(),
        h3 = typography.titleMedium.copy(fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            .withLineHeightRatio(),
        h4 = typography.titleMedium.copy(fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            .withLineHeightRatio(),
        h5 = typography.titleSmall.copy(fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            .withLineHeightRatio(),
        h6 = typography.titleSmall.copy(fontSize = 16.sp, fontWeight = FontWeight.Medium)
            .withLineHeightRatio(),
        text = body,
        paragraph = body,
        ordered = body,
        bullet = body,
        list = body,
        quote = body.copy(fontWeight = FontWeight.Normal),
        code = typography.bodySmall.copy(fontSize = 13.sp, fontFamily = FontFamily.Monospace),
        inlineCode = body.copy(fontSize = 15.sp, fontFamily = FontFamily.Monospace),
    )
}

@Composable
fun haroldMarkdownDimens(): MarkdownDimens = markdownDimens(tableCellPadding = 8.dp)

private fun TextStyle.withLineHeightRatio() =
    copy(lineHeight = fontSize * HEADING_LINE_HEIGHT_RATIO)
