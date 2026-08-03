import { useMutation } from "@tanstack/react-query"
import { runConnectionTest } from "./run.connection.test"

export const useRunConnectionTestMutation = () =>
  useMutation({
    mutationFn: () => runConnectionTest(),
  })
