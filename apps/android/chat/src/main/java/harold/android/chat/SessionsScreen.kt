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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.ui.components.HaroldBadge

private val MIN_TOUCH_TARGET = 48.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionsScreen(
    uiState: SessionsUiState,
    onBack: () -> Unit,
    onSearchChanged: (String) -> Unit,
    onSessionClick: (SessionRow) -> Unit,
    onDeleteSession: (SessionRow) -> Unit,
    onCreateClick: () -> Unit,
    onHaroldFilter: (String?) -> Unit = {},
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
            onHaroldFilter = onHaroldFilter,
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
    onHaroldFilter: (String?) -> Unit = {},
) {
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
            trailingIcon = {
                if (uiState.loading) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .size(20.dp)
                            .testTag("sessions_search_loading"),
                        strokeWidth = 2.dp,
                    )
                }
            },
        )

        if (uiState.harolds.isNotEmpty()) {
            val chipColors = FilterChipDefaults.filterChipColors(
                selectedContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                selectedLabelColor = MaterialTheme.colorScheme.primary,
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .testTag("session_harold_filters"),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val allSelected = uiState.haroldFilter == null
                FilterChip(
                    selected = allSelected,
                    onClick = { onHaroldFilter(null) },
                    label = { Text(text = "All") },
                    colors = chipColors,
                    border = FilterChipDefaults.filterChipBorder(
                        enabled = true,
                        selected = allSelected,
                        selectedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.55f),
                    ),
                    modifier = Modifier.testTag("session_filter_all"),
                )
                uiState.harolds.forEach { harold ->
                    val selected = uiState.haroldFilter == harold.serverOrigin
                    FilterChip(
                        selected = selected,
                        onClick = { onHaroldFilter(harold.serverOrigin) },
                        leadingIcon = {
                            HaroldBadge(
                                colorId = harold.colorId,
                                iconId = harold.iconId,
                                size = 18.dp,
                            )
                        },
                        label = { Text(text = harold.name) },
                        colors = chipColors,
                        border = FilterChipDefaults.filterChipBorder(
                            enabled = true,
                            selected = selected,
                            selectedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.55f),
                        ),
                        modifier = Modifier.testTag("session_filter_${harold.serverOrigin}"),
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
                Text(
                    text = "Loading sessions…",
                    modifier = Modifier.testTag("sessions_list_loading"),
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
                    items(uiState.sessions, key = { session -> session.id }) { session ->
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
    val hasHaroldIdentity =
        session.haroldColorId.isNotEmpty() ||
            session.haroldIconId.isNotEmpty() ||
            session.haroldName.isNotEmpty()

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
                    colorId = session.haroldColorId,
                    iconId = session.haroldIconId,
                    size = 28.dp,
                    modifier = Modifier.testTag("session_harold_${session.id}"),
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
                    text = "${session.workspaceLabel} · ${session.agentLabel} · ${sessionStatusLabel(session.state)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (session.needsAttention || !session.haroldReachable) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (session.needsAttention) {
                            Text(
                                text = "Needs permission",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.testTag("session_attention_${session.id}"),
                            )
                        }
                        if (!session.haroldReachable) {
                            Text(
                                text = "Unreachable",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.testTag("session_unreachable_${session.id}"),
                            )
                        }
                    }
                }
            }
        }
    }
}
