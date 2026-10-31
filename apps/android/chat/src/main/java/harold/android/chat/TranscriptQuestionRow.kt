package harold.android.chat

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.live.TranscriptQuestionRow as QuestionRow

/** Read-only one-line answer summary. The raw payload is never kept. */
@Composable
fun TranscriptQuestionRowView(
    row: QuestionRow,
    modifier: Modifier = Modifier,
) {
    val summary = row.answers.joinToString(" · ") { answer -> answer.second }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 4.dp)
            .testTag("transcript_question"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        ),
    ) {
        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
            Text(
                text = row.title,
                style = MaterialTheme.typography.labelLarge,
            )
            Text(
                text = summary.ifEmpty { "Answered" },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.testTag("transcript_question_summary"),
            )
        }
    }
}
