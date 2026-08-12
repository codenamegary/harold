export type ListeningEndpoints = {
  httpBase: string
  wsUrl: string
}

export type ListenableApp = {
  listen: (opts: { host: string; port: number }) => Promise<string>
  server: { address: () => unknown }
}

export const getListeningEndpoints = async (params: {
  app: ListenableApp
  host: string
}): Promise<ListeningEndpoints> => {
  await params.app.listen({ host: params.host, port: 0 })
  const address = params.app.server.address()
  if (
    address === null ||
    typeof address !== "object" ||
    !("port" in address) ||
    typeof address.port !== "number"
  ) {
    throw new Error("expected bound server address")
  }

  return {
    httpBase: `http://${params.host}:${address.port}`,
    wsUrl: `ws://${params.host}:${address.port}/v1/sessions/stream`,
  }
}
