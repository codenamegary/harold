import { PermissionService } from "../../../permission/service"

export type CreateAcpPermissionHandlerParams = {
  permissionService: PermissionService
}

export const createAcpPermissionHandler = ({
  permissionService,
}: CreateAcpPermissionHandlerParams) => ({
  handlePermissionRequest: async (input: {
    jsonRpcId: string | number
    params: unknown
    respond: (result: unknown) => void
    respondError: (code: number, message: string) => void
  }) => {
    await permissionService.registerPending(input)
  },
})
