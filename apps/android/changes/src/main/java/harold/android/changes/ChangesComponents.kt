package harold.android.changes

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import harold.android.contracts.GitChangedFile
import harold.android.contracts.GitFileStatus
import harold.android.ui.theme.diffColors

@Composable
internal fun statusColor(status: GitFileStatus): Color = when (status) {
    GitFileStatus.Added,
    GitFileStatus.Untracked,
    -> MaterialTheme.colorScheme.primary

    GitFileStatus.Modified,
    GitFileStatus.TypeChanged,
    -> MaterialTheme.colorScheme.tertiary

    GitFileStatus.Deleted,
    GitFileStatus.Conflicted,
    -> MaterialTheme.colorScheme.error

    GitFileStatus.Renamed,
    GitFileStatus.Copied,
    -> MaterialTheme.colorScheme.secondary
}

internal fun statusLetter(status: GitFileStatus): String = when (status) {
    GitFileStatus.Added -> "A"
    GitFileStatus.Modified -> "M"
    GitFileStatus.Deleted -> "D"
    GitFileStatus.Renamed -> "R"
    GitFileStatus.Copied -> "C"
    GitFileStatus.TypeChanged -> "T"
    GitFileStatus.Untracked -> "U"
    GitFileStatus.Conflicted -> "!"
}

@Composable
internal fun statusLabel(status: GitFileStatus): String = stringResource(
    when (status) {
        GitFileStatus.Added -> R.string.changes_status_added
        GitFileStatus.Modified -> R.string.changes_status_modified
        GitFileStatus.Deleted -> R.string.changes_status_deleted
        GitFileStatus.Renamed -> R.string.changes_status_renamed
        GitFileStatus.Copied -> R.string.changes_status_copied
        GitFileStatus.TypeChanged -> R.string.changes_status_type_changed
        GitFileStatus.Untracked -> R.string.changes_status_untracked
        GitFileStatus.Conflicted -> R.string.changes_status_conflicted
    },
)

@Composable
internal fun StatusBadge(
    status: GitFileStatus,
    modifier: Modifier = Modifier,
) {
    val color = statusColor(status)
    val label = statusLabel(status)
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(color.copy(alpha = 0.16f))
            .padding(horizontal = 7.dp, vertical = 3.dp)
            .semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = statusLetter(status),
            color = color,
            fontSize = 11.sp,
            lineHeight = 12.sp,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
internal fun LineStats(
    additions: Int?,
    deletions: Int?,
    binary: Boolean,
    submodule: Boolean,
    modifier: Modifier = Modifier,
) {
    if (binary || submodule) {
        val label = stringResource(
            if (binary) R.string.changes_binary else R.string.changes_submodule,
        )
        MetaBadge(label = label, modifier = modifier)
        return
    }
    val diff = diffColors()
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "+${additions ?: 0}",
            color = if ((additions ?: 0) > 0) diff.additionText else MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
            lineHeight = 14.sp,
            fontFamily = FontFamily.Monospace,
        )
        Text(
            text = "−${deletions ?: 0}",
            color = if ((deletions ?: 0) > 0) diff.deletionText else MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
            lineHeight = 14.sp,
            fontFamily = FontFamily.Monospace,
        )
    }
}

@Composable
internal fun MetaBadge(
    label: String,
    modifier: Modifier = Modifier,
) {
    Text(
        text = label,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 10.sp,
        lineHeight = 12.sp,
        fontWeight = FontWeight.Medium,
        modifier = modifier
            .clip(RoundedCornerShape(5.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 6.dp, vertical = 3.dp),
    )
}

@Composable
internal fun Pill(
    label: String,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Text(
        text = label,
        color = color,
        fontSize = 10.sp,
        lineHeight = 12.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(color.copy(alpha = 0.12f))
            .padding(horizontal = 7.dp, vertical = 3.dp),
    )
}

internal fun GitChangedFile.isStatLess(): Boolean = binary || submodule
