package harold.android.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.R

private val MIN_TOUCH_TARGET = 48.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionsScreen(
    uiState: ChatUiState,
    onBack: () -> Unit,
    onSearchChanged: (String) -> Unit,
    onSessionClick: (SessionRow) -> Unit,
    onDeleteSession: (SessionRow) -> Unit,
    onCreateClick: () -> Unit,
) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(text = stringResource(R.string.sessions_title)) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("sessions_back")
                            .semantics {
                                contentDescription = "Go back from sessions"
                            },
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = null,
                        )
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onCreateClick,
                modifier = Modifier.testTag("sessions_create_fab"),
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = stringResource(R.string.chat_new_session),
                )
            }
        },
    ) { innerPadding ->
        SessionsListContent(
            uiState = uiState,
            onSearchChanged = onSearchChanged,
            onSessionClick = onSessionClick,
            onDeleteSession = onDeleteSession,
            modifier = Modifier.padding(innerPadding),
        )
    }
}

@Composable
fun SessionsListContent(
    uiState: ChatUiState,
    onSearchChanged: (String) -> Unit,
    onSessionClick: (SessionRow) -> Unit,
    onDeleteSession: (SessionRow) -> Unit,
    modifier: Modifier = Modifier,
    listState: LazyListState = rememberLazyListState(),
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        OutlinedTextField(
            value = uiState.sessionsListSearch,
            onValueChange = onSearchChanged,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("sessions_search"),
            singleLine = true,
            label = { Text(text = stringResource(R.string.sessions_search_label)) },
            trailingIcon = {
                if (uiState.sessionsListLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .size(20.dp)
                            .testTag("sessions_search_loading"),
                        strokeWidth = 2.dp,
                    )
                }
            },
        )

        uiState.sessionsListError?.let { message ->
            Text(
                text = message,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.testTag("sessions_list_error"),
            )
        }

        when {
            uiState.sessionsList.isEmpty() && uiState.sessionsListLoading -> {
                Text(
                    text = "Loading sessions…",
                    modifier = Modifier.testTag("sessions_list_loading"),
                )
            }

            uiState.sessionsList.isEmpty() -> {
                Text(
                    text = "No sessions yet",
                    modifier = Modifier.testTag("sessions_list_empty"),
                )
            }

            else -> {
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("sessions_list"),
                    contentPadding = PaddingValues(bottom = 88.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(uiState.sessionsList, key = { session -> session.id }) { session ->
                        SwipeToRevealDelete(
                            rowTag = session.id,
                            onDelete = { onDeleteSession(session) },
                        ) {
                            SessionListRow(
                                session = session,
                                onClick = { onSessionClick(session) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SessionListRow(
    session: SessionRow,
    onClick: () -> Unit,
) {
    Card(
        shape = RectangleShape,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("session_row_${session.id}")
            .clickable(onClick = onClick),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(text = session.name, style = MaterialTheme.typography.titleMedium)
            Text(
                text = "${session.workspaceLabel} · ${session.agentLabel} · ${sessionStatusLabel(session.state)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
