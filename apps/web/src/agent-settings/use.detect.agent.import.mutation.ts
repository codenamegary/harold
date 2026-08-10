import { useMutation } from "@tanstack/react-query"
import { detectAgentImport } from "./detect.agent.import"

export const useDetectAgentImportMutation = () =>
  useMutation({
    mutationFn: () => detectAgentImport(),
  })
