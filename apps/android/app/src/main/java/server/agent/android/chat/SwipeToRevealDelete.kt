package server.agent.android.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SwipeToRevealDelete(
    rowTag: String,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val state = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            value == SwipeToDismissBoxValue.EndToStart ||
                value == SwipeToDismissBoxValue.Settled
        },
    )

    LaunchedEffect(state.currentValue) {
        if (state.currentValue == SwipeToDismissBoxValue.EndToStart) {
            // Keep the delete action revealed until the operator taps it.
        }
    }

    SwipeToDismissBox(
        state = state,
        modifier = modifier.testTag("swipe_delete_$rowTag"),
        enableDismissFromStartToEnd = false,
        backgroundContent = {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.errorContainer)
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.CenterEnd,
            ) {
                TextButton(
                    onClick = onDelete,
                    modifier = Modifier.testTag("session_delete_$rowTag"),
                ) {
                    Text(
                        text = "Delete",
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }
        },
        content = { content() },
    )
}
