import { FastifyInstance } from "fastify"
import {
  nodeConnectTcp,
  nodeFetchDeviceAuth,
  nodeLookupHost,
  nodeVerifyTls,
} from "./connection-test.node.adapters"
import { makeRunConnectionTest } from "./connection-test.run.usecase"
import { registerConnectionTestRoutes } from "./connection-test.routes"
import { DeviceProvisioningPort, GetAdvertisedUrl } from "./connection-test.ports"

export type AssembleConnectionTestSliceDeps = Readonly<{
  getAdvertisedUrl: GetAdvertisedUrl
  deviceProvisioning: DeviceProvisioningPort
}>

export type ConnectionTestSlice = Readonly<{
  registerRoutes: (app: FastifyInstance) => void
}>

export const assembleConnectionTestSlice = (
  deps: AssembleConnectionTestSliceDeps,
): ConnectionTestSlice => {
  const runConnectionTest = makeRunConnectionTest({
    getAdvertisedUrl: deps.getAdvertisedUrl,
    deviceProvisioning: deps.deviceProvisioning,
    lookupHost: nodeLookupHost,
    connectTcp: nodeConnectTcp,
    verifyTls: nodeVerifyTls,
    fetchDeviceAuth: nodeFetchDeviceAuth,
  })

  return {
    registerRoutes: (app) => {
      registerConnectionTestRoutes(app, runConnectionTest)
    },
  }
}
