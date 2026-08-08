package server.agent.android.chat

import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import com.mikepenz.markdown.m3.Markdown
import com.mikepenz.markdown.model.rememberStreamingMarkdownState

@Composable
fun MarkdownMessage(
    text: String,
    modifier: Modifier = Modifier,
) {
    var streamEpoch by remember { mutableIntStateOf(0) }

    key(streamEpoch) {
        val streamingState = rememberStreamingMarkdownState()

        LaunchedEffect(text) {
            when (val update = markdownStreamUpdate(streamingState.content, text)) {
                is MarkdownStreamUpdate.Append -> streamingState.append(update.chunk)
                MarkdownStreamUpdate.Restart -> streamEpoch += 1
                MarkdownStreamUpdate.NoChange -> Unit
            }
        }

        SelectionContainer {
            Markdown(
                streamingMarkdownState = streamingState,
                modifier = modifier.testTag("markdown_message"),
            )
        }
    }
}

internal sealed interface MarkdownStreamUpdate {
    data class Append(val chunk: String) : MarkdownStreamUpdate
    data object Restart : MarkdownStreamUpdate
    data object NoChange : MarkdownStreamUpdate
}

/**
 * Maps an accumulated assistant [newText] onto the append-only [StreamingMarkdownState] buffer.
 * Deltas append; a non-prefix rewrite (e.g. output complete replacing the draft) restarts the stream.
 */
internal fun markdownStreamUpdate(
    currentContent: CharSequence,
    newText: String,
): MarkdownStreamUpdate {
    val current = currentContent.toString()
    return when {
        newText == current -> MarkdownStreamUpdate.NoChange
        newText.startsWith(current) -> {
            val chunk = newText.substring(current.length)
            if (chunk.isEmpty()) {
                MarkdownStreamUpdate.NoChange
            } else {
                MarkdownStreamUpdate.Append(chunk)
            }
        }
        else -> MarkdownStreamUpdate.Restart
    }
}
