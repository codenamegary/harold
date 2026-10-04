import { count } from "drizzle-orm"
import { GetWorkspaceCount } from "core/status/summary.ports"
import { AgentDatabase } from "../persistence/database"
import { workspaces } from "../persistence/schema/workspaces"

export const makeCountWorkspaces =
  (database: AgentDatabase): GetWorkspaceCount =>
  () =>
    database.db.select({ value: count() }).from(workspaces).get()?.value ?? 0
