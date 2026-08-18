import { LOGS_PATH } from "contracts/http/logs"

export const clearLogs = async () => {
  const response = await fetch(LOGS_PATH, { method: "DELETE" })

  if (response.status !== 204) {
    throw new Error(`Logs clear failed with ${response.status}`)
  }
}
