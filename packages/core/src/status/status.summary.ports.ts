import { AdvertisedEndpoint, AgentSummary, LocalApi } from "./status.summary.models"

export type GetDataDir = () => string

export type GetLocalApi = () => LocalApi

export type GetAdvertisedEndpoint = () => AdvertisedEndpoint

export type GetAgentSummary = () => AgentSummary

export type GetWorkspaceCount = () => number
