package harold.android.host

import harold.android.network.AgentAuthApi
import harold.android.network.AgentSettingsApi
import harold.android.network.AttachmentApi
import harold.android.network.GitApi
import harold.android.network.HostApi
import harold.android.network.WorkspaceApi
import javax.inject.Inject
import javax.inject.Singleton

/** One host surface composed from the settings/auth and workspace halves. */
@Singleton
class DefaultHostApi @Inject constructor(
    private val agents: HostAgentApi,
    private val workspaces: HostWorkspaceApi,
) : HostApi,
    WorkspaceApi by workspaces,
    AgentSettingsApi by agents,
    AgentAuthApi by agents,
    AttachmentApi by workspaces,
    GitApi by workspaces
