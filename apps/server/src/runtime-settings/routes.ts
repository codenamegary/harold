import {
  LogLevel,
  PatchRuntimeSettingsQuerySchema,
  RuntimeSettingsSchema,
  UpdateRuntimeSettingsBodySchema,
  UpdateRuntimeSettingsResponseSchema,
} from "contracts/http/runtime-settings"
import { FastifyInstance } from "fastify"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { SessionRepository } from "../session/repository"
import { deleteWorkspaceWithCascade } from "../workspace/delete.workspace.cascade"
import { WorkspaceRepository } from "../workspace/repository"
import { WorkspaceService } from "../workspace/service"
import { canonicalizeAllowedRoots } from "./canonicalize.allowed.roots"
import { findWorkspacesAffectedByRootRemoval } from "./find.workspaces.affected.by.root.removal"
import { RuntimeSettingsRepository } from "./repository"
import {
  buildAllowedRootHasWorkspacesProblem,
  buildAllowedRootValidationProblem,
} from "./runtime.settings.problems"

export type RegisterRuntimeSettingsRoutesOptions = {
  onLogLevelChanged?: (logLevel: LogLevel) => void
  workspaceRepository?: WorkspaceRepository
  workspaceService?: WorkspaceService
  sessionRepository?: SessionRepository
  acpSupervisor?: AcpSupervisor
}

const sendProblem = (
  reply: {
    status: (code: number) => {
      type: (type: string) => { send: (body: unknown) => unknown }
    }
  },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

export const registerRuntimeSettingsRoutes = (
  app: FastifyInstance,
  repository: RuntimeSettingsRepository,
  options: RegisterRuntimeSettingsRoutesOptions = {},
) => {
  app.get("/v1/settings/runtime", async (_request, reply) => {
    const settings = RuntimeSettingsSchema.parse(repository.get())
    return reply.status(200).send(settings)
  })

  app.patch("/v1/settings/runtime", async (request, reply) => {
    const query = PatchRuntimeSettingsQuerySchema.parse(request.query)
    const body = UpdateRuntimeSettingsBodySchema.parse(request.body)
    const previous = repository.get()
    const force = query.force ?? false

    const nextAllowedRoots = (() => {
      if (body.allowedRoots === undefined) {
        return undefined
      }

      const canonicalizeResult = canonicalizeAllowedRoots(body.allowedRoots)
      if (!canonicalizeResult.ok) {
        return canonicalizeResult
      }

      return { ok: true as const, canonicalRoots: canonicalizeResult.canonicalRoots }
    })()

    if (nextAllowedRoots !== undefined && !nextAllowedRoots.ok) {
      return sendProblem(
        reply,
        400,
        buildAllowedRootValidationProblem({
          error: nextAllowedRoots.error,
          index: nextAllowedRoots.index,
        }),
      )
    }

    const resolvedBody =
      nextAllowedRoots !== undefined && nextAllowedRoots.ok
        ? { ...body, allowedRoots: nextAllowedRoots.canonicalRoots }
        : body

    if (
      nextAllowedRoots !== undefined &&
      nextAllowedRoots.ok &&
      options.workspaceRepository !== undefined
    ) {
      const affected = findWorkspacesAffectedByRootRemoval({
        workspaces: options.workspaceRepository.listAll(),
        previousRoots: previous.allowedRoots,
        nextRoots: nextAllowedRoots.canonicalRoots,
      })

      if (affected.length > 0 && !force) {
        const detail = `${affected.length} workspace${affected.length === 1 ? "" : "s"} must be unregistered before this root can be removed`
        return sendProblem(reply, 409, buildAllowedRootHasWorkspacesProblem(detail))
      }

      if (
        affected.length > 0 &&
        force &&
        options.workspaceService !== undefined &&
        options.sessionRepository !== undefined &&
        options.acpSupervisor !== undefined
      ) {
        for (const workspace of affected) {
          const deleted = await deleteWorkspaceWithCascade({
            workspaceId: workspace.id,
            force: true,
            workspaceRepository: options.workspaceRepository,
            workspaceService: options.workspaceService,
            sessionRepository: options.sessionRepository,
            acpSupervisor: options.acpSupervisor,
          })

          if (!deleted.ok && deleted.kind === "not_found") {
            return sendProblem(reply, 404, {
              type: "https://agent-server.local/problems/not-found",
              title: "Workspace not found",
              status: 404,
              detail: "Unknown workspace id",
            })
          }
        }
      }
    }

    const result = repository.update(resolvedBody)

    if (
      body.logLevel !== undefined &&
      body.logLevel !== previous.logLevel &&
      options.onLogLevelChanged
    ) {
      options.onLogLevelChanged(result.settings.logLevel)
    }

    return reply.status(200).send(
      UpdateRuntimeSettingsResponseSchema.parse(result),
    )
  })
}
