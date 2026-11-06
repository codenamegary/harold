package harold.android.pairing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonVariant

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddConnectionScreen(
    onBack: () -> Unit,
    onHub: () -> Unit,
    onSsh: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(text = stringResource(R.string.add_connection_title)) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testTag("add_connection_back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.pairing_back_content_description),
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            ConnectionChoiceCard(
                title = stringResource(R.string.add_connection_hub_title),
                body = stringResource(R.string.add_connection_hub_body),
                action = stringResource(R.string.add_connection_hub_action),
                modifier = Modifier.testTag("add_connection_hub"),
                onClick = onHub,
            )
            ConnectionChoiceCard(
                title = stringResource(R.string.add_connection_ssh_title),
                body = stringResource(R.string.add_connection_ssh_body),
                action = stringResource(R.string.add_connection_ssh_action),
                modifier = Modifier.testTag("add_connection_ssh"),
                onClick = onSsh,
            )
        }
    }
}

@Composable
private fun ConnectionChoiceCard(
    title: String,
    body: String,
    action: String,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            HaroldButton(
                text = action,
                onClick = onClick,
                variant = HaroldButtonVariant.Primary,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
