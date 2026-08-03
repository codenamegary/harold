import {
  CONNECTION_TEST_PATH,
  ConnectionTestResponse,
  ConnectionTestResponseSchema,
} from "contracts/http/connection-test"

export const runConnectionTest = async (): Promise<ConnectionTestResponse> => {
  const response = await fetch(CONNECTION_TEST_PATH, { method: "POST" })

  if (!response.ok) {
    throw new Error(`Connection test failed with ${response.status}`)
  }

  const payload: unknown = await response.json()
  return ConnectionTestResponseSchema.parse(payload)
}
