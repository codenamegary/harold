package harold.android.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.live.TranscriptUserRow
import harold.android.ui.theme.LightOnSurface
import harold.android.ui.theme.LightOnSurfaceVariant
import harold.android.ui.theme.LightPanel2
import harold.android.ui.theme.LightSurfaceVariant
import harold.android.ui.theme.Lime

private const val CollapsedPromptLines = 8

/**
 * The prompt header is deliberately inverted: a light panel in both themes so it
 * separates turns from the dark transcript, with the lime rail as the accent.
 */
internal data class PromptPalette(
    val background: Color,
    val content: Color,
    val muted: Color,
    val chipBackground: Color,
)

internal fun promptPalette(): PromptPalette = PromptPalette(
    background = LightPanel2,
    content = LightOnSurface,
    muted = LightOnSurfaceVariant,
    chipBackground = LightSurfaceVariant,
)

/** A user prompt as the full-width header of its turn: filled panel, lime accent, selectable text. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TranscriptTurnHeader(
    row: TranscriptUserRow,
    modifier: Modifier = Modifier,
) {
    var expanded by rememberSaveable(row.turnId) { mutableStateOf(false) }
    var overflows by rememberSaveable(row.turnId) { mutableStateOf(false) }
    val roles = chatTextRoles()
    val palette = promptPalette()

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(palette.background)
            .height(IntrinsicSize.Min)
            .testTag("transcript_turn_header"),
    ) {
        Box(
            modifier = Modifier
                .width(3.dp)
                .fillMaxHeight()
                .background(Lime)
                .testTag("turn_accent"),
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(14.dp)
                .testTag("turn_header"),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SelectionContainer(modifier = Modifier.testTag("transcript_user_prompt")) {
                Text(
                    text = row.text,
                    style = roles.prompt,
                    color = palette.content,
                    maxLines = if (expanded) Int.MAX_VALUE else CollapsedPromptLines,
                    overflow = TextOverflow.Ellipsis,
                    onTextLayout = { result ->
                        if (!expanded) {
                            overflows = result.hasVisualOverflow
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("transcript_user"),
                )
            }

            if (overflows) {
                TextButton(
                    onClick = { expanded = !expanded },
                    modifier = Modifier.testTag("show_full_prompt"),
                ) {
                    Text(
                        text = if (expanded) "Show less" else "Show full prompt",
                        style = roles.meta,
                        color = palette.content,
                    )
                }
            }

            if (row.attachmentNames.isNotEmpty()) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("attachment_chips"),
                ) {
                    row.attachmentNames.forEach { name ->
                        Text(
                            text = name,
                            style = roles.meta,
                            color = palette.muted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(palette.chipBackground)
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                                .testTag("attachment_chip"),
                        )
                    }
                }
            }
        }
    }
}
