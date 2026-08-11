package server.agent.android.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

private val MIN_TOUCH_TARGET = 48.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateSessionScreen(
    createState: CreateSessionUiState,
    onBack: () -> Unit,
    onWorkspaceChanged: (String) -> Unit,
    onAgentChanged: (server.agent.android.contracts.AgentId) -> Unit,
    onPromptChanged: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(text = "New session") },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("create_session_back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Go back from new session",
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
                .padding(16.dp)
                .testTag("create_session_screen"),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            WorkspaceDropdown(
                workspaces = createState.workspaces,
                selectedWorkspaceId = createState.selectedWorkspaceId,
                onWorkspaceChanged = onWorkspaceChanged,
            )

            AgentDropdown(
                agents = createState.agents,
                selectedAgentId = createState.selectedAgentId,
                onAgentChanged = onAgentChanged,
            )

            OutlinedTextField(
                value = createState.prompt,
                onValueChange = onPromptChanged,
                label = { Text(text = "Initial prompt") },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("create_session_prompt"),
                minLines = 3,
            )

            if (createState.error != null) {
                Text(
                    text = createState.error,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("create_session_error"),
                )
            }

            Button(
                onClick = onSubmit,
                enabled = !createState.submitting,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("create_session_submit"),
            ) {
                Text(text = if (createState.submitting) "Creating…" else "Create")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WorkspaceDropdown(
    workspaces: List<WorkspaceRow>,
    selectedWorkspaceId: String,
    onWorkspaceChanged: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = workspaces.firstOrNull { workspace -> workspace.id == selectedWorkspaceId }?.name
        ?: "Choose workspace"

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
    ) {
        OutlinedTextField(
            value = selectedLabel,
            onValueChange = {},
            readOnly = true,
            label = { Text(text = "Workspace") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor()
                .fillMaxWidth()
                .testTag("create_session_workspace"),
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            workspaces.forEach { workspace ->
                DropdownMenuItem(
                    text = { Text(text = workspace.name) },
                    onClick = {
                        onWorkspaceChanged(workspace.id)
                        expanded = false
                    },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AgentDropdown(
    agents: List<AgentOption>,
    selectedAgentId: server.agent.android.contracts.AgentId?,
    onAgentChanged: (server.agent.android.contracts.AgentId) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = agents.firstOrNull { agent -> agent.id == selectedAgentId }?.displayName
        ?: "Choose agent"

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
    ) {
        OutlinedTextField(
            value = selectedLabel,
            onValueChange = {},
            readOnly = true,
            label = { Text(text = "Agent") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor()
                .fillMaxWidth()
                .testTag("create_session_agent"),
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            agents.forEach { agent ->
                DropdownMenuItem(
                    text = { Text(text = agent.displayName) },
                    onClick = {
                        onAgentChanged(agent.id)
                        expanded = false
                    },
                )
            }
        }
    }
}
