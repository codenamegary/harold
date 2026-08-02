import { useMutation } from "@tanstack/react-query"
import { createPairingCode } from "./create.pairing.code"

export const useCreatePairingCodeMutation = () =>
  useMutation({
    mutationFn: createPairingCode,
  })
