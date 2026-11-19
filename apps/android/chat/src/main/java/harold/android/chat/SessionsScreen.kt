package harold.android.chat

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.contracts.SessionState
import harold.android.ui.components.HaroldBadge
import harold.android.ui.components.LoadingSkeletonList
import harold.android.ui.components.SwipeToDeleteListItem
import harold.android.ui.components.haroldColorOption

private val MIN_TOUCH_TARGET = 48.dp

/** How many cached rows the all-sessions list composes at once. */
private const val SESSION_PAGE_SIZE = 50

/** Start the next window this many rows before the end of the current one. */
private const val SESSION_PREFETCH_DISTANCE = 8

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionsScreen(
    uiState: SessionsUiState,
    onBack: () -> Unit,
    onSearchChanged: (String) -> Unit,
    onSessionClick: (SessionRow) -> Unit,
    onDeleteSession: (SessionRow) -> Unit,
    onCreateClick: () -> Unit,
    onConnectionFilter: (String?) -> Unit = {},
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
            onConnectionFilter = onConnectionFilter,
            modifier = Modifier.padding(innerPadding),
        )
    }
}

@Composable
fun SessionsListContent(
    uiState: SessionsUiState,
    onSearchChanged: (String) -> Unit,
    onSessionClick: (SessionRow) -> Unit,
    onDeleteSession: (SessionRow) -> Unit,
    modifier: Modifier = Modifier,
    listState: LazyListState = rememberLazyListState(),
    onConnectionFilter: (String?) -> Unit = {},
    pageSize: Int = SESSION_PAGE_SIZE,
) {
    // The catalog is already in memory. This window only decides how many of
    // its rows are composed; it never asks an agent for another page.
    var visibleCount by rememberSaveable(uiState.search, uiState.connectionFilter) {
        mutableIntStateOf(pageSize)
    }
    var lastSearch by rememberSaveable { mutableStateOf(uiState.search) }
    var lastFilter by rememberSaveable { mutableStateOf(uiState.connectionFilter) }
    // The window resets before the old layout settles. Block the prefetch
    // effect until the scroll-to-top has run, otherwise a search can refill
    // the window from the pre-search scroll position.
    var windowResetting by remember { mutableStateOf(false) }
    val totalSessions = uiState.sessions.size
    val liveTotal by rememberUpdatedState(totalSessions)
    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1
            !windowResetting &&
                visibleCount < liveTotal &&
                lastVisible >= visibleCount - 1 - SESSION_PREFETCH_DISTANCE
        }
    }
    LaunchedEffect(shouldLoadMore, visibleCount) {
        if (shouldLoadMore) {
            visibleCount = minOf(visibleCount + pageSize, liveTotal)
        }
    }
    LaunchedEffect(uiState.search, uiState.connectionFilter) {
        if (uiState.search != lastSearch || uiState.connectionFilter != lastFilter) {
            lastSearch = uiState.search
            lastFilter = uiState.connectionFilter
            windowResetting = true
            listState.scrollToItem(0)
            windowResetting = false
        }
    }
    val visibleSessions = uiState.sessions.take(visibleCount)

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        OutlinedTextField(
            value = uiState.search,
            onValueChange = onSearchChanged,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("sessions_search"),
            singleLine = true,
            label = { Text(text = stringResource(R.string.sessions_search_label)) },
        )

        if (uiState.connections.isNotEmpty()) {
            val chipColors = FilterChipDefaults.filterChipColors(
                selectedContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                selectedLabelColor = MaterialTheme.colorScheme.primary,
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .testTag("session_connection_filters"),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val allSelected = uiState.connectionFilter == null
                FilterChip(
                    selected = allSelected,
                    onClick = { onConnectionFilter(null) },
                    label = { Text(text = "All") },
                    colors = chipColors,
                    border = FilterChipDefaults.filterChipBorder(
                        enabled = true,
                        selected = allSelected,
                        selectedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.55f),
                    ),
                    modifier = Modifier.testTag("session_filter_all"),
                )
                uiState.connections.forEach { connection ->
                    val selected = uiState.connectionFilter == connection.connectionId
                    val refreshing = connection.connectionId in uiState.refreshingConnectionIds
                    val error = uiState.connectionErrors[connection.connectionId]
                    val statusDescription = when {
                        error != null -> stringResource(R.string.sessions_refresh_failed_state, error)
                        refreshing -> stringResource(R.string.sessions_refreshing_connection, connection.name)
                        else -> null
                    }
                    val errorColor = MaterialTheme.colorScheme.error
                    FilterChip(
                        selected = selected,
                        onClick = { onConnectionFilter(connection.connectionId) },
                        leadingIcon = {
                            if (refreshing) {
                                CircularProgressIndicator(
                                    modifier = Modifier
                                        .size(18.dp)
                                        .testTag("session_filter_loading_${connection.connectionId}"),
                                    color = haroldColorOption(connection.colorId).containerColor,
                                    strokeWidth = 2.dp,
                                )
                            } else {
                                HaroldBadge(
                                    colorId = connection.colorId,
                                    iconId = connection.iconId,
                                    size = 18.dp,
                                )
                            }
                        },
                        label = { Text(text = connection.name) },
                        colors = chipColors,
                        border = FilterChipDefaults.filterChipBorder(
                            enabled = true,
                            selected = selected,
                            borderColor = if (error != null) errorColor else MaterialTheme.colorScheme.outline,
                            selectedBorderColor = if (error != null) {
                                errorColor
                            } else {
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.55f)
                            },
                            borderWidth = if (error != null) 2.dp else 1.dp,
                            selectedBorderWidth = if (error != null) 2.dp else 1.dp,
                        ),
                        modifier = Modifier
                            .testTag("session_filter_${connection.connectionId}")
                            .semantics {
                                if (statusDescription != null) {
                                    stateDescription = statusDescription
                                }
                            },
                    )
                }
            }
        }

        uiState.error?.let { message ->
            Text(
                text = message,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.testTag("sessions_list_error"),
            )
        }

        when {
            uiState.sessions.isEmpty() && uiState.loading -> {
                LoadingSkeletonList(
                    contentDescription = "Loading sessions",
                    modifier = Modifier.testTag("sessions_list_loading"),
                    rows = 4,
                    rowHeight = 76.dp,
                )
            }

            uiState.sessions.isEmpty() -> {
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
                    items(visibleSessions, key = { session -> session.id }) { session ->
                        SwipeToDeleteListItem(
                            rowTag = session.id,
                            deleteLabel = stringResource(R.string.sessions_delete),
                            onDelete = { onDeleteSession(session) },
                            deleteActionTag = "session_delete_${session.id}",
                            confirmationTitle = stringResource(R.string.sessions_delete_confirm_title),
                            confirmationText = stringResource(R.string.sessions_delete_confirm_body),
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
    val hasHaroldIdentity =
        session.connectionColorId.isNotEmpty() ||
            session.connectionIconId.isNotEmpty() ||
            session.connectionName.isNotEmpty()

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
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (hasHaroldIdentity) {
                HaroldBadge(
                    colorId = session.connectionColorId,
                    iconId = session.connectionIconId,
                    size = 28.dp,
                    modifier = Modifier.testTag("session_connection_${session.id}"),
                )
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = session.name,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = buildString {
                        append(session.workspaceLabel)
                        append(" · ")
                        append(session.agentLabel)
                        append(" · ")
                        append(sessionStatusLabel(session.state))
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (session.needsAttention || !session.connectionReachable || session.stale) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (session.needsAttention) {
                            Text(
                                text = session.attentionLabel,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.testTag("session_attention_${session.id}"),
                            )
                        }
                        if (!session.connectionReachable) {
                            Text(
                                text = "Unreachable",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.testTag("session_unreachable_${session.id}"),
                            )
                        }
                        if (session.stale && session.state != SessionState.Unavailable) {
                            Text(
                                text = stringResource(R.string.chat_session_stale),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.testTag("session_stale_${session.id}"),
                            )
                        }
                    }
                }
            }
        }
    }
}
