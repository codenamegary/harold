export type StatusEndpointResponse = Readonly<{
  status: number
  body: string
}>

export type FetchStatusEndpointResult =
  | { readonly ok: true; readonly response: StatusEndpointResponse }
  | { readonly ok: false; readonly detail: string }

export type FetchStatusEndpoint = (statusUrl: string) => Promise<FetchStatusEndpointResult>
