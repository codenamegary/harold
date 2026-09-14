package server.agent.android.chat.composer

import androidx.compose.runtime.Stable
import server.agent.android.contracts.ConfigOptionValue

@Stable
class ComposerConfigActions(
    val onModelPick: (String) -> Unit = {},
    val onModeCycle: (ConfigOptionValue) -> Unit = {},
    val onThinkingCycle: (ConfigOptionValue) -> Unit = {},
)
