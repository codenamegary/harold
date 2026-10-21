package harold.android.session

import harold.android.network.AgentApi
import javax.inject.Inject

/**
 * A saved Harold is reachable when its workspace list answers. The shared
 * HTTP client attaches that Harold's credential from the request address.
 */
class WorkspaceHaroldReachability @Inject constructor(
    private val agentApi: AgentApi,
) : HaroldReachability {
    override suspend fun check(serverOrigin: String): Result<Unit> =
        agentApi.listWorkspaces(serverOrigin, limit = 1).map { }
}
