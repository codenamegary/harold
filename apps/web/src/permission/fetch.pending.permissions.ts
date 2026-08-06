import { PermissionRequest, PermissionRequestCollectionSchema } from "contracts/http/permission"

export const fetchPendingPermissions = async (sessionId: string): Promise<PermissionRequest[]> => {
  const response = await fetch(`/v1/sessions/${sessionId}/permissions?status=pending`)
  if (!response.ok) {
    throw new Error("Failed to load pending permissions")
  }

  const payload: unknown = await response.json()
  return PermissionRequestCollectionSchema.parse(payload).items
}
