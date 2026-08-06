import { useMutation } from "@tanstack/react-query"
import { resolvePermission, ResolvePermissionParams } from "./resolve.permission"

export const useResolvePermissionMutation = () =>
  useMutation({
    mutationFn: (params: ResolvePermissionParams) => resolvePermission(params),
  })
