package server.agent.android.chat

import server.agent.android.contracts.PermissionRequest
import server.agent.android.contracts.PermissionStatus

fun activePermissionRequest(
    pending: List<PermissionRequest>,
): PermissionRequest? =
    pending
        .filter { item -> item.status == PermissionStatus.Pending }
        .minByOrNull { item -> item.createdAt }
