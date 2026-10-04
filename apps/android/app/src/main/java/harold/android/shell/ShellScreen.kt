package harold.android.shell

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import harold.android.R
import harold.android.stream.ConnectionState
import harold.android.stream.ConnectionStatus
import harold.android.session.PairedState
import harold.android.ui.theme.HaroldTheme
import harold.android.ui.theme.AppMark
import harold.android.ui.theme.Lime

private val MIN_TOUCH_TARGET = 52.dp
private val PanelShape = RoundedCornerShape(12.dp)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShellScreen(
    uiState: ShellUiState,
    onPairClick: () -> Unit,
    onRetryClick: () -> Unit,
) {
    val pairContentDescription = stringResource(R.string.pair_content_description)
    val retryContentDescription = stringResource(R.string.retry_content_description)
    val isLive = uiState.connectionStatus == "Live"
    val scrollState = rememberScrollState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = uiState.title,
                        modifier = Modifier.testTag("shell_title"),
                    )
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 24.dp)
                .padding(bottom = 24.dp),
        ) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(scrollState),
            ) {
                Spacer(modifier = Modifier.height(28.dp))

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .size(88.dp)
                            .drawBehind {
                                drawCircle(
                                    brush = Brush.radialGradient(
                                        colors = listOf(
                                            Lime.copy(alpha = 0.22f),
                                            Color.Transparent,
                                        ),
                                        center = Offset(size.width / 2f, size.height / 2f),
                                        radius = size.minDimension * 0.72f,
                                    ),
                                )
                            },
                    ) {
                        AppMark(
                            size = 56.dp,
                            modifier = Modifier.testTag("shell_app_mark"),
                        )
                    }

                    Text(
                        text = stringResource(R.string.app_name),
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 8.dp),
                    )

                    Text(
                        text = stringResource(R.string.shell_brand_subtitle).uppercase(),
                        style = MaterialTheme.typography.labelMedium,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                ShellStatusPanel(
                    status = uiState.status,
                    connectionStatus = uiState.connectionStatus,
                    workspacesSummary = uiState.workspacesSummary,
                    isLive = isLive,
                )

                Text(
                    text = if (uiState.pairLabel == "Re-pair") {
                        stringResource(R.string.shell_repair_hint)
                    } else {
                        stringResource(R.string.shell_pair_hint)
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Start,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp, bottom = 16.dp)
                        .testTag("shell_hint"),
                )
            }

            if (uiState.retryVisible) {
                OutlinedButton(
                    onClick = onRetryClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("shell_retry_button")
                        .semantics {
                            contentDescription = retryContentDescription
                        },
                ) {
                    Text(text = stringResource(R.string.retry_action))
                }

                Spacer(modifier = Modifier.height(12.dp))
            }

            Button(
                onClick = onPairClick,
                enabled = uiState.pairEnabled,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                    .testTag("shell_pair_button")
                    .semantics {
                        contentDescription = pairContentDescription
                    },
            ) {
                Text(text = uiState.pairLabel)
            }
        }
    }
}

@Composable
private fun ShellStatusPanel(
    status: String,
    connectionStatus: String?,
    workspacesSummary: String?,
    isLive: Boolean,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 1.dp,
                color = MaterialTheme.colorScheme.outline,
                shape = PanelShape,
            )
            .background(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = PanelShape,
            )
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ShellStatusRow(
            label = stringResource(R.string.shell_status_label),
            value = status,
            valueTestTag = "shell_status",
            live = false,
        )

        connectionStatus?.let { connection ->
            ShellStatusRow(
                label = stringResource(R.string.shell_connection_label),
                value = connection,
                valueTestTag = "shell_connection_status",
                live = isLive,
            )
        }

        workspacesSummary?.let { summary ->
            ShellStatusRow(
                label = stringResource(R.string.shell_workspaces_label),
                value = summary,
                valueTestTag = "shell_workspaces_summary",
                live = false,
            )
        }
    }
}

@Composable
private fun ShellStatusRow(
    label: String,
    value: String,
    valueTestTag: String,
    live: Boolean,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            fontFamily = FontFamily.Monospace,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (live) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(
                            color = MaterialTheme.colorScheme.primary,
                            shape = RoundedCornerShape(percent = 50),
                        ),
                )
            }
            Text(
                text = value,
                style = MaterialTheme.typography.bodyLarge,
                color = if (live) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
                modifier = Modifier
                    .weight(1f)
                    .testTag(valueTestTag)
                    .semantics {
                        liveRegion = LiveRegionMode.Polite
                    },
            )
        }
    }
}

@Preview(name = "Not paired", showBackground = true)
@Preview(
    name = "Not paired dark",
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
)
@Composable
private fun ShellScreenPreview() {
    HaroldTheme(dynamicColor = false) {
        ShellScreen(
            uiState = ShellUiState(),
            onPairClick = {},
            onRetryClick = {},
        )
    }
}

@Preview(name = "Live", showBackground = true)
@Composable
private fun ShellScreenLivePreview() {
    HaroldTheme(dynamicColor = false) {
        ShellScreen(
            uiState = ShellUiState()
                .fromPairedState(
                    PairedState.Paired("http://127.0.0.1:8787", "device_01", "Pixel 8"),
                )
                .fromConnectionState(ConnectionState(status = ConnectionStatus.Live))
                .fromWorkspaceProbe(WorkspaceProbe.Loaded(count = 4)),
            onPairClick = {},
            onRetryClick = {},
        )
    }
}

@Preview(name = "Auth failed", showBackground = true)
@Composable
private fun ShellScreenAuthFailedPreview() {
    HaroldTheme(dynamicColor = false) {
        ShellScreen(
            uiState = ShellUiState()
                .fromPairedState(
                    PairedState.Paired("http://127.0.0.1:8787", "device_01", "Pixel 8"),
                )
                .fromConnectionState(
                    ConnectionState(status = ConnectionStatus.AuthFailed(detail = null)),
                ),
            onPairClick = {},
            onRetryClick = {},
        )
    }
}
