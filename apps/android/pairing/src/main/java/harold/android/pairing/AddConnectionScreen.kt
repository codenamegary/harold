package harold.android.pairing

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import harold.android.design.R as DesignR
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonVariant
import harold.android.ui.components.HaroldCard
import harold.android.ui.theme.Lime
import harold.android.ui.theme.Sky

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddConnectionScreen(
    onBack: () -> Unit,
    onHub: () -> Unit,
    onSsh: () -> Unit,
) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.add_connection_title),
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
                    )
                },
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
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            ConnectionChoiceCard(
                title = stringResource(R.string.add_connection_hub_title),
                body = stringResource(R.string.add_connection_hub_body),
                action = stringResource(R.string.add_connection_hub_action),
                iconRes = DesignR.drawable.ic_harold_glyph_server,
                accentColor = Lime,
                modifier = Modifier.testTag("add_connection_hub"),
                onClick = onHub,
            )
            ConnectionChoiceCard(
                title = stringResource(R.string.add_connection_ssh_title),
                body = stringResource(R.string.add_connection_ssh_body),
                action = stringResource(R.string.add_connection_ssh_action),
                iconRes = DesignR.drawable.ic_harold_glyph_terminal,
                accentColor = Sky,
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
    iconRes: Int,
    accentColor: Color,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    HaroldCard(
        shape = RoundedCornerShape(16.dp),
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(accentColor.copy(alpha = 0.16f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        painter = painterResource(iconRes),
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(22.dp),
                    )
                }
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                )
            }
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
