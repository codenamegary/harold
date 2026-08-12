package server.agent.android.chat

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import server.agent.android.R

private val MIN_TOUCH_TARGET = 48.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionsScreen(
    uiState: ChatUiState,
    onBack: () -> Unit,
    onSearchChanged: (String) -> Unit,
    onSessionClick: (SessionRow) -> Unit,
    onSessionLongPress: (SessionRow) -> Unit,
    onCreateClick: () -> Unit,
    onLoadMore: () -> Unit,
) {
    val listState = rememberLazyListState()
    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            val total = listState.layoutInfo.totalItemsCount
            total > 0 && lastVisible >= total - 3
        }
    }

    LaunchedEffect(shouldLoadMore, uiState.sessionsListNextCursor, uiState.sessionsListLoadingMore) {
        if (shouldLoadMore && uiState.sessionsListNextCursor != null && !uiState.sessionsListLoadingMore) {
            onLoadMore()
        }
    }

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
            listState = listState,
            onSearchChanged = onSearchChanged,
            onSessionClick = onSessionClick,
            onSessionLongPress = onSessionLongPress,
            modifier = Modifier.padding(innerPadding),
        )
    }
}

@Composable
fun SessionsListContent(
    uiState: ChatUiState,
    onSearchChanged: (String) -> Unit,
    onSessionClick: (SessionRow) -> Unit,
    onSessionLongPress: (SessionRow) -> Unit,
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
                        SessionListRow(
                            session = session,
                            onClick = { onSessionClick(session) },
                            onLongClick = { onSessionLongPress(session) },
                        )
                    }

                    if (uiState.sessionsListLoadingMore) {
                        item(key = "sessions_loading_more") {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(8.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier
                                        .size(24.dp)
                                        .testTag("sessions_loading_more"),
                                    strokeWidth = 2.dp,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SessionListRow(
    session: SessionRow,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("session_row_${session.id}")
            .combinedClickable(
                onClick = onClick,
                onLongClick = onLongClick,
            ),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(text = session.name, style = MaterialTheme.typography.titleMedium)
            Text(
                text = "${session.workspaceLabel} · ${session.agentLabel}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = sessionStatusLabel(session.state),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
