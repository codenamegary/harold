import React, { useEffect, useState } from "react"
import { Save, Trash2 } from "lucide-react"
import { Link } from "react-router"
import { logLevels } from "contracts/http/runtime-settings"
import {
  ActionField,
  ActionTextInput,
  FieldActionButton,
} from "../design-system/ActionTextInput"
import { FieldLabel } from "../design-system/FieldLabel"
import { Panel } from "../design-system/Panel"
import { TextInput } from "../design-system/TextInput"
import { isRuntimeSettingsUpdateError } from "../runtime-settings/update.runtime.settings"
import { useRuntimeSettingsQuery } from "../runtime-settings/use.runtime.settings.query"
import { useUpdateRuntimeSettingsMutation } from "../runtime-settings/use.update.runtime.settings.mutation"

const logLevelLabel = (level: string) => level.charAt(0).toUpperCase() + level.slice(1)

export const RuntimePanel: React.FC = () => {
  const runtimeSettingsQuery = useRuntimeSettingsQuery()
  const updateRuntimeSettingsMutation = useUpdateRuntimeSettingsMutation()
  const [proxyDraft, setProxyDraft] = useState("")
  const [proxyError, setProxyError] = useState<string | undefined>(undefined)
  const [portDraft, setPortDraft] = useState("")
  const [portError, setPortError] = useState<string | undefined>(undefined)
  const [logPathDraft, setLogPathDraft] = useState("")
  const [logPathError, setLogPathError] = useState<string | undefined>(undefined)

  const view = runtimeSettingsQuery.data
  const settings = view?.settings
  const pending = updateRuntimeSettingsMutation.isPending
  const bindPortEnvOverride = view?.overrides.bindPort === "env"

  useEffect(() => {
    if (settings === undefined) {
      return
    }

    setPortDraft(String(settings.bindPort))
    setLogPathDraft(settings.logPath ?? "")
  }, [settings])

  if (runtimeSettingsQuery.isError || view === undefined || settings === undefined) {
    return (
      <Panel className="p-[22px]">
        <h3 className="m-0 mb-1 text-lg font-semibold">Runtime</h3>
        <p className="m-0 text-sm text-danger" role="alert">
          Could not load runtime settings.
        </p>
      </Panel>
    )
  }

  const saveTrustedProxies = async (nextProxies: string[]) => {
    await updateRuntimeSettingsMutation.mutateAsync({
      body: { trustedProxies: nextProxies },
    })
  }

  const handleAddProxy = async () => {
    const trimmed = proxyDraft.trim()
    if (trimmed.length === 0) {
      setProxyError("Enter an IPv4/IPv6 address or CIDR.")
      return
    }

    setProxyError(undefined)

    try {
      await saveTrustedProxies([...settings.trustedProxies, trimmed])
      setProxyDraft("")
    } catch (error: unknown) {
      setProxyError(
        isRuntimeSettingsUpdateError(error)
          ? error.message
          : "Could not add trusted proxy.",
      )
    }
  }

  const handleRemoveProxy = async (proxy: string) => {
    setProxyError(undefined)

    try {
      await saveTrustedProxies(settings.trustedProxies.filter((entry) => entry !== proxy))
    } catch (error: unknown) {
      setProxyError(
        isRuntimeSettingsUpdateError(error)
          ? error.message
          : "Could not remove trusted proxy.",
      )
    }
  }

  const handleLogLevelChange = async (nextLevel: string) => {
    try {
      await updateRuntimeSettingsMutation.mutateAsync({
        body: { logLevel: nextLevel as (typeof logLevels)[number] },
      })
    } catch {
      // Query invalidation keeps the select aligned with server state.
    }
  }

  const handleSavePort = async () => {
    const parsed = Number(portDraft)
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
      setPortError("Enter a port between 0 and 65535.")
      return
    }

    setPortError(undefined)

    try {
      await updateRuntimeSettingsMutation.mutateAsync({
        body: { bindPort: parsed },
      })
    } catch (error: unknown) {
      setPortError(
        isRuntimeSettingsUpdateError(error)
          ? error.message
          : "Could not save bind port.",
      )
    }
  }

  const handleSaveLogPath = async () => {
    setLogPathError(undefined)

    try {
      await updateRuntimeSettingsMutation.mutateAsync({
        body: { logPath: logPathDraft.trim().length === 0 ? null : logPathDraft.trim() },
      })
    } catch (error: unknown) {
      setLogPathError(
        isRuntimeSettingsUpdateError(error)
          ? error.message
          : "Could not save log path.",
      )
    }
  }

  return (
    <Panel className="p-[22px]">
      <h3 className="m-0 mb-1 text-lg font-semibold">Runtime</h3>
      <p className="m-0 mb-5 text-sm text-muted">
        Server process settings. Bind and log path changes need a restart.
      </p>

      <section className="border-t border-line-soft py-4 first:border-t-0 first:pt-0">
        <FieldLabel htmlFor="runtime-cloud-proxy">Cloud proxy</FieldLabel>
        {settings.advertisedUrl === null ? (
          <p className="m-0 mt-2 text-sm text-muted">
            <Link className="text-lime hover:underline" to="/connect">
              Set up on Connect
            </Link>
          </p>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-3">
            <code className="min-w-0 truncate font-mono text-xs text-body-soft" title={settings.advertisedUrl}>
              {settings.advertisedUrl}
            </code>
            <input
              id="runtime-cloud-proxy"
              type="checkbox"
              checked={settings.advertisedUrlEnabled}
              disabled={pending}
              aria-label="Enable cloud proxy"
              onChange={() => {
                void updateRuntimeSettingsMutation.mutateAsync({
                  body: { advertisedUrlEnabled: !settings.advertisedUrlEnabled },
                })
              }}
              className="relative h-[17px] w-[31px] shrink-0 cursor-pointer appearance-none rounded-[10px] bg-[#252c36] transition after:absolute after:left-[2px] after:top-[2px] after:size-[13px] after:rounded-full after:bg-[#727c89] after:transition-all after:content-[''] checked:bg-lime checked:after:left-[16px] checked:after:bg-lime-ink disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        )}
      </section>

      {view.restartRequired ? (
        <div
          className="mb-5 rounded-[7px] border border-amber-500/35 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-100"
          role="status"
        >
          Restart the server process to apply bind or log path changes.
          {view.overrides.bindPort === "env" || view.overrides.bindHost === "env" ? (
            <span className="mt-1 block text-xs text-amber-100/80">
              Effective listen values come from environment variables until restart.
            </span>
          ) : null}
        </div>
      ) : null}

      <section className="border-t border-line-soft py-4 first:border-t-0 first:pt-0">
        <FieldLabel htmlFor="runtime-log-level">Log level</FieldLabel>
        <label className="block rounded-md border border-line-input bg-surface-deep px-[11px] py-2">
          <select
            id="runtime-log-level"
            aria-label="Log level"
            value={settings.logLevel}
            disabled={pending}
            onChange={(event) => {
              void handleLogLevelChange(event.target.value)
            }}
            className="block w-full appearance-none border-0 bg-transparent text-sm text-input outline-0"
          >
            {logLevels.map((level) => (
              <option key={level} value={level}>
                {logLevelLabel(level)}
              </option>
            ))}
          </select>
        </label>
        <p className="m-0 mt-2 text-xs text-muted">Applies immediately without restart.</p>
      </section>

      <section className="border-t border-line-soft py-4">
        <FieldLabel>Trusted proxy CIDRs</FieldLabel>
        <p className="m-0 mb-3 text-xs text-muted">
          Forwarded headers are honored only from these peers.
        </p>
        {settings.trustedProxies.length === 0 ? (
          <p className="m-0 mb-3 text-xs text-muted">No trusted proxies configured yet.</p>
        ) : (
          <ul className="m-0 mb-3 list-none space-y-2 p-0">
            {settings.trustedProxies.map((proxy) => (
              <li key={proxy}>
                <ActionField
                  action={
                    <FieldActionButton
                      aria-label={`Remove ${proxy}`}
                      disabled={pending}
                      onClick={() => {
                        void handleRemoveProxy(proxy)
                      }}
                    >
                      <Trash2 aria-hidden className="size-3.5" strokeWidth={1.75} />
                    </FieldActionButton>
                  }
                >
                  <code
                    className="min-w-0 flex-1 truncate px-2 font-mono text-xs text-body-soft"
                    title={proxy}
                  >
                    {proxy}
                  </code>
                </ActionField>
              </li>
            ))}
          </ul>
        )}
        <ActionTextInput
          aria-label="Trusted proxy CIDR"
          value={proxyDraft}
          placeholder="10.0.0.0/8"
          disabled={pending}
          onInput={(event) => {
            setProxyDraft(event.currentTarget.value)
            setProxyError(undefined)
          }}
          action={{
            "aria-label": "Add proxy",
            disabled: pending,
            onClick: () => {
              void handleAddProxy()
            },
            children: <Save aria-hidden className="size-3.5" strokeWidth={1.75} />,
          }}
        />
        {proxyError ? (
          <p className="m-0 mt-2 text-xs text-danger" role="alert">
            {proxyError}
          </p>
        ) : null}
      </section>

      <section className="border-t border-line-soft py-4">
        <FieldLabel htmlFor="runtime-bind-host">Bind host</FieldLabel>
        <TextInput
          id="runtime-bind-host"
          aria-label="Bind host"
          value={settings.bindHost}
          readOnly
          className="font-mono"
        />
        <p className="m-0 mt-2 text-xs text-muted">Loopback only.</p>
      </section>

      <section className="border-t border-line-soft py-4">
        <FieldLabel htmlFor="runtime-bind-port">Bind port</FieldLabel>
        {bindPortEnvOverride ? (
          <p className="m-0 mb-2 text-xs text-muted">
            Effective port{" "}
            <code className="text-body-soft">{view.effective.bindPort}</code> comes from{" "}
            <code className="text-body-soft">AGENT_SERVER_PORT</code>. Stored value below.
          </p>
        ) : (
          <p className="m-0 mb-2 text-xs text-muted">
            Effective port{" "}
            <code className="text-body-soft">{view.effective.bindPort}</code>.
          </p>
        )}
        <ActionTextInput
          id="runtime-bind-port"
          aria-label="Bind port"
          value={portDraft}
          inputMode="numeric"
          disabled={pending || bindPortEnvOverride}
          onInput={(event) => {
            setPortDraft(event.currentTarget.value)
            setPortError(undefined)
          }}
          className="font-mono"
          action={{
            "aria-label": "Save port",
            disabled: pending || bindPortEnvOverride,
            onClick: () => {
              void handleSavePort()
            },
            children: <Save aria-hidden className="size-3.5" strokeWidth={1.75} />,
          }}
        />
        {portError ? (
          <p className="m-0 mt-2 text-xs text-danger" role="alert">
            {portError}
          </p>
        ) : null}
      </section>

      <section className="border-t border-line-soft py-4">
        <FieldLabel htmlFor="runtime-log-path">Log path</FieldLabel>
        <p className="m-0 mb-2 text-xs text-muted">
          Leave empty to log to stdout. Effective path{" "}
          <code className="text-body-soft">{view.effective.logPath ?? "stdout"}</code>.
        </p>
        <ActionTextInput
          id="runtime-log-path"
          aria-label="Log path"
          value={logPathDraft}
          placeholder="/var/log/agent-server.log"
          disabled={pending}
          onInput={(event) => {
            setLogPathDraft(event.currentTarget.value)
            setLogPathError(undefined)
          }}
          className="font-mono"
          action={{
            "aria-label": "Save path",
            disabled: pending,
            onClick: () => {
              void handleSaveLogPath()
            },
            children: <Save aria-hidden className="size-3.5" strokeWidth={1.75} />,
          }}
        />
        {logPathError ? (
          <p className="m-0 mt-2 text-xs text-danger" role="alert">
            {logPathError}
          </p>
        ) : null}
      </section>
    </Panel>
  )
}
