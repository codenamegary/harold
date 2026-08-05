import React, { useEffect, useRef, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { ConnectionCheckId, ConnectionTestResponse } from "contracts/http/connection-test"
import { CreatePairingCodeResponse } from "contracts/http/pairing-code"
import { useNavigate, useSearchParams } from "react-router"
import { Button } from "../design-system/Button"
import { FieldLabel } from "../design-system/FieldLabel"
import { StatusDot } from "../design-system/StatusDot"
import { StatusPill } from "../design-system/StatusPill"
import { TextInput } from "../design-system/TextInput"
import { openAppEventStream } from "../session/open.app.event.stream"
import {
  advertisedUrlFromHost,
  hostFromAdvertisedUrl,
  normalizeExternalUrlHost,
} from "../runtime-settings/advertised.url.host"
import { useRuntimeSettingsQuery } from "../runtime-settings/use.runtime.settings.query"
import { useUpdateRuntimeSettingsMutation } from "../runtime-settings/use.update.runtime.settings.mutation"
import { cloudWizardSteps } from "./connect.wizard.steps"
import {
  localAgentPort,
  proxyProviders,
  proxyTemplates,
  ProxyProvider,
} from "./proxy.templates"
import { HttpsAbsoluteUrlSchema } from "contracts/http/runtime-settings"
import { useRunConnectionTestMutation } from "../connection-test/use.run.connection.test.mutation"
import { useCreatePairingCodeMutation } from "./use.create.pairing.code.mutation"

type AccessMode = "local" | "cloud"

type WizardView =
  | { kind: "mode-select" }
  | { kind: "local-pair" }
  | { kind: "cloud"; step: 1 | 2 | 3 }

const initialViewFromSearchParam = (step: string | null): WizardView =>
  step === "pair" ? { kind: "local-pair" } : { kind: "mode-select" }

type ConnectWizardStepRailProps = {
  currentStep: number
  onStepSelect: (step: number) => void
}

const ConnectWizardStepRail: React.FC<ConnectWizardStepRailProps> = ({
  currentStep,
  onStepSelect,
}) => (
  <aside
    aria-label="Connection wizard steps"
    className="relative flex flex-col pt-1 max-[820px]:flex-row max-[820px]:justify-center max-[820px]:before:hidden before:absolute before:top-[30px] before:bottom-[31px] before:left-[17px] before:w-px before:bg-line"
  >
    {cloudWizardSteps.map((step) => {
      const isActive = step.id === currentStep
      const isComplete = step.id < currentStep

      return (
        <button
          key={step.id}
          type="button"
          aria-current={isActive ? "step" : undefined}
          onClick={() => onStepSelect(step.id)}
          className={`relative flex gap-[11px] border-0 bg-transparent py-[9px] text-left cursor-pointer max-[820px]:px-[5px] max-[820px]:py-0 ${isActive ? "text-body" : "text-[#657080]"}`}
        >
          <b
            className={`text-2xs z-[1] grid size-[35px] shrink-0 place-items-center rounded-full border font-mono ${isActive ? "border-lime bg-lime text-lime-ink shadow-[0_0_0_4px_rgba(182,243,107,0.08)]" : isComplete ? "border-lime/35 text-lime text-[0px] after:text-2xs after:content-['✓']" : "border-line bg-ink"}`}
          >
            {isComplete ? "" : step.number}
          </b>
          <span className="pt-[3px] max-[820px]:hidden">
            <strong className="block text-sm font-medium">{step.title}</strong>
            <small className="mt-[5px] block text-xs text-[#505966]">{step.subtitle}</small>
          </span>
        </button>
      )
    })}
  </aside>
)

type AccessModeStepProps = {
  accessMode: AccessMode
  onAccessModeChange: (mode: AccessMode) => void
  onContinue: () => void
  switchError: string | null
}

const AccessModeStep: React.FC<AccessModeStepProps> = ({
  accessMode,
  onAccessModeChange,
  onContinue,
  switchError,
}) => (
  <div>
    <div className="mb-[25px] flex items-center gap-[13px]">
      <span className="grid size-10 place-items-center rounded-[9px] border border-line bg-panel-2 text-lg">
        ⌁
      </span>
      <div>
        <h2 className="m-0 text-lg font-semibold">How will you connect?</h2>
        <p className="m-0 mt-1.5 text-sm text-muted">
          You can change this later without losing paired devices.
        </p>
      </div>
    </div>

    <div className="grid gap-3.5 md:grid-cols-2">
      <button
        type="button"
        aria-pressed={accessMode === "local"}
        onClick={() => onAccessModeChange("local")}
        className={`relative min-h-[230px] cursor-pointer rounded-[9px] border p-5 text-left max-[640px]:min-h-[200px] ${accessMode === "local" ? "border-lime/50 bg-[linear-gradient(145deg,rgba(182,243,107,0.04),#0b0e13)] shadow-[inset_0_0_0_1px_rgba(182,243,107,0.08)]" : "border-line bg-[#0b0e13] hover:border-line-hover"}`}
      >
        <div
          className={`absolute top-5 right-5 grid size-4 place-items-center rounded-full border ${accessMode === "local" ? "border-lime" : "border-line"}`}
        >
          {accessMode === "local" ? (
            <span className="size-[7px] rounded-full bg-lime" />
          ) : null}
        </div>
        <div className="mb-3.5 text-xl">⌂</div>
        <h3 className="m-0 mb-2 text-base font-semibold">Local or private network</h3>
        <p className="m-0 min-h-[43px] text-sm leading-[1.55] text-muted max-[640px]:min-h-0">
          Use the local test UI, your trusted LAN, or a private tailnet. Skip cloud configuration
          entirely.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusPill variant="success">
            Simple setup
          </StatusPill>
          <code className="font-mono text-2xs text-pill">private access</code>
        </div>
      </button>

      <button
        type="button"
        aria-pressed={accessMode === "cloud"}
        onClick={() => onAccessModeChange("cloud")}
        className={`relative min-h-[230px] cursor-pointer rounded-[9px] border p-5 text-left max-[640px]:min-h-[200px] ${accessMode === "cloud" ? "border-lime/50 bg-[linear-gradient(145deg,rgba(182,243,107,0.04),#0b0e13)] shadow-[inset_0_0_0_1px_rgba(182,243,107,0.08)]" : "border-line bg-[#0b0e13] hover:border-line-hover"}`}
      >
        <div
          className={`absolute top-5 right-5 grid size-4 place-items-center rounded-full border ${accessMode === "cloud" ? "border-lime" : "border-line"}`}
        >
          {accessMode === "cloud" ? (
            <span className="size-[7px] rounded-full bg-lime" />
          ) : null}
        </div>
        <div className="mb-3.5 text-xl text-violet">⌁</div>
        <h3 className="m-0 mb-2 text-base font-semibold">Cloud proxy</h3>
        <p className="m-0 min-h-[43px] text-sm leading-[1.55] text-muted max-[640px]:min-h-0">
          Reach your agents securely from anywhere using your own tunnel or proxy.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusPill variant="violet">
            Remote access
          </StatusPill>
          <code className="font-mono text-2xs text-pill">HTTPS required</code>
        </div>
      </button>
    </div>

    <div className="mt-[22px] flex gap-3 rounded-lg border border-line-soft bg-panel-2 p-3.5 text-xs text-body-soft">
      <span className="grid size-5 shrink-0 place-items-center rounded-full border border-line text-2xs text-muted">
        i
      </span>
      <p className="m-0 leading-[1.55]">
        <strong className="text-body">Your agent stays local.</strong> Agent Server keeps the workspace
        and Cursor CLI on this machine. Secure the proxy-to-home hop with WireGuard or another
        encrypted tunnel.
      </p>
    </div>

    {switchError !== null ? (
      <p className="mt-4 text-xs text-danger" role="alert">
        {switchError}
      </p>
    ) : null}

    <div className="mt-6 flex items-center justify-end border-t border-line-soft pt-[18px]">
      <Button onClick={onContinue}>
        Continue <span aria-hidden>→</span>
      </Button>
    </div>
  </div>
)

type ExternalUrlStepProps = {
  proxyProvider: ProxyProvider
  onProxyProviderChange: (provider: ProxyProvider) => void
  onBack: () => void
  onContinue: () => void
}

type ExternalUrlFormProps = ExternalUrlStepProps & {
  initialHost: string
}

const ExternalUrlForm: React.FC<ExternalUrlFormProps> = ({
  proxyProvider,
  onProxyProviderChange,
  onBack,
  onContinue,
  initialHost,
}) => {
  const updateRuntimeSettingsMutation = useUpdateRuntimeSettingsMutation()
  const [host, setHost] = useState(initialHost)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const template = proxyTemplates[proxyProvider]
  const trimmedHost = host.trim()
  const fullUrl =
    trimmedHost.length > 0 ? advertisedUrlFromHost(trimmedHost) : "https://"

  const handleSave = async () => {
    setValidationError(null)
    setSaveError(null)

    if (trimmedHost.length === 0) {
      setValidationError("Enter a public hostname for your HTTPS endpoint.")
      return
    }

    const advertisedUrl = advertisedUrlFromHost(trimmedHost)
    const parsed = HttpsAbsoluteUrlSchema.safeParse(advertisedUrl)
    if (!parsed.success) {
      setValidationError("Enter a valid HTTPS hostname.")
      return
    }

    try {
      await updateRuntimeSettingsMutation.mutateAsync({ body: { advertisedUrl } })
      onContinue()
    } catch {
      setSaveError("Could not save the external URL. Check the hostname and try again.")
    }
  }

  return (
    <div>
      <div className="mb-[25px] flex items-center gap-[13px]">
        <span className="grid size-10 place-items-center rounded-[9px] border border-line bg-panel-2 text-lg">
          ↗
        </span>
        <div>
          <h2 className="m-0 text-lg font-semibold">Configure external access</h2>
          <p className="m-0 mt-1.5 text-sm text-muted">
            Use an HTTPS endpoint that forwards to{" "}
            <code className="text-[#b8c0cb]">127.0.0.1:{localAgentPort}</code>.
          </p>
        </div>
      </div>

      <FieldLabel htmlFor="external-url">Public server URL</FieldLabel>
      <div className="flex items-center gap-2 rounded-md border border-line-input bg-surface-deep px-[11px]">
        <span className="text-sm text-dim">https://</span>
        <TextInput
          id="external-url"
          aria-label="Public server URL"
          value={host}
          onInput={(event) => {
            setHost(normalizeExternalUrlHost(event.currentTarget.value))
            setValidationError(null)
            setSaveError(null)
          }}
          className="border-0 bg-transparent px-0 focus:border-0"
        />
      </div>

      {validationError !== null ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {validationError}
        </p>
      ) : null}

      {saveError !== null ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {saveError}
        </p>
      ) : null}

      <div role="tablist" aria-label="Proxy templates" className="mt-[22px] flex border-b border-line">
        {proxyProviders.map((provider) => {
          const isActive = provider === proxyProvider

          return (
            <button
              key={provider}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="proxy-template-panel"
              onClick={() => onProxyProviderChange(provider)}
              className={`relative cursor-pointer border-0 bg-transparent px-3.5 py-2.5 text-sm ${isActive ? "text-body after:absolute after:right-2.5 after:bottom-[-1px] after:left-2.5 after:h-0.5 after:bg-lime after:content-['']" : "text-[#687280]"}`}
            >
              {proxyTemplates[provider].tabLabel}
            </button>
          )
        })}
      </div>

      <div
        id="proxy-template-panel"
        role="tabpanel"
        className="mt-4 overflow-hidden rounded-[9px] border border-line bg-[#0b0e13]"
      >
        <div className="flex items-center justify-between border-b border-line-soft px-3.5 py-2.5">
          <span className="font-mono text-2xs text-muted">{template.label}</span>
          <Button variant="secondary" disabled className="min-h-7 px-2.5">
            Copy
          </Button>
        </div>
        <pre className="m-0 overflow-x-auto p-3.5 font-mono text-sm leading-[1.6] text-body-soft">
          {template.code(fullUrl)}
        </pre>
      </div>

      <p className="mt-3.5 text-xs leading-[1.55] text-muted">{template.note}</p>

      <div className="mt-6 flex items-center justify-between border-t border-line-soft pt-[18px]">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button
          disabled={updateRuntimeSettingsMutation.isPending}
          onClick={() => void handleSave()}
        >
          Save &amp; continue <span aria-hidden>→</span>
        </Button>
      </div>
    </div>
  )
}

const ExternalUrlStep: React.FC<ExternalUrlStepProps> = (props) => {
  const runtimeSettingsQuery = useRuntimeSettingsQuery()

  if (runtimeSettingsQuery.isPending) {
    return (
      <div>
        <h2 className="m-0 text-lg font-semibold">Configure external access</h2>
        <p className="m-0 mt-1.5 text-sm text-muted" role="status">
          Loading saved URL…
        </p>
      </div>
    )
  }

  if (runtimeSettingsQuery.isError || runtimeSettingsQuery.data === undefined) {
    return (
      <div>
        <h2 className="m-0 text-lg font-semibold">Configure external access</h2>
        <p className="m-0 mt-1.5 text-sm text-danger" role="alert">
          Could not load runtime settings.
        </p>
        <div className="mt-6">
          <Button variant="secondary" onClick={props.onBack}>
            Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <ExternalUrlForm
      {...props}
      initialHost={hostFromAdvertisedUrl(runtimeSettingsQuery.data.settings.advertisedUrl)}
    />
  )
}

type TestConnectionStepProps = {
  onBack: () => void
  onContinue: () => void
}

const connectionCheckTitles: Record<ConnectionCheckId, string> = {
  dns: "DNS & reachability",
  tls: "TLS certificate",
  "device-auth": "Device authentication",
}

const connectionCheckOrder: ConnectionCheckId[] = ["dns", "tls", "device-auth"]

const statusLabelForCheck = (
  status: ConnectionTestResponse["checks"][number]["status"] | undefined,
  isRunning: boolean,
): string => {
  if (isRunning) {
    return "Running"
  }

  switch (status) {
    case "pass":
      return "Passed"
    case "warn":
      return "Warning"
    case "fail":
      return "Failed"
    default:
      return "Pending"
  }
}

const statusDotForSummary = (
  result: ConnectionTestResponse | undefined,
  isRunning: boolean,
): React.ComponentProps<typeof StatusDot>["variant"] => {
  if (isRunning) {
    return "warning"
  }

  if (result?.canContinue === true) {
    return "online"
  }

  if (result?.canContinueAnyway === true) {
    return "warning"
  }

  return "offline"
}

const TestConnectionStep: React.FC<TestConnectionStepProps> = ({
  onBack,
  onContinue,
}) => {
  const runtimeSettingsQuery = useRuntimeSettingsQuery()
  const connectionTestMutation = useRunConnectionTestMutation()
  const [result, setResult] = useState<ConnectionTestResponse | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const autoRunStarted = useRef(false)

  const advertisedUrl = runtimeSettingsQuery.data?.settings.advertisedUrl ?? null
  const endpointLabel =
    advertisedUrl ?? `https://127.0.0.1:${localAgentPort}`

  const runTest = () => {
    setRunError(null)
    void connectionTestMutation.mutateAsync().then(
      (response) => {
        setResult(response)
      },
      () => {
        setRunError("Connection test failed. Check the advertised URL and try again.")
        setResult(null)
      },
    )
  }

  useEffect(() => {
    if (autoRunStarted.current || advertisedUrl === null) {
      return
    }

    autoRunStarted.current = true
    setRunError(null)
    void connectionTestMutation.mutateAsync().then(
      (response) => {
        setResult(response)
      },
      () => {
        setRunError("Connection test failed. Check the advertised URL and try again.")
        setResult(null)
      },
    )
  }, [advertisedUrl, connectionTestMutation])

  const checksById = new Map(result?.checks.map((check) => [check.id, check]) ?? [])
  const isRunning = connectionTestMutation.isPending
  const canContinue = result?.canContinue === true
  const canContinueAnyway = result?.canContinueAnyway === true

  if (runtimeSettingsQuery.isPending) {
    return (
      <div>
        <h2 className="m-0 text-lg font-semibold">Test your connection</h2>
        <p className="m-0 mt-1.5 text-sm text-muted" role="status">
          Loading saved URL…
        </p>
      </div>
    )
  }

  if (advertisedUrl === null) {
    return (
      <div>
        <h2 className="m-0 text-lg font-semibold">Test your connection</h2>
        <p className="m-0 mt-1.5 text-sm text-danger" role="alert">
          Save an external URL before running connection tests.
        </p>
        <div className="mt-6">
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-[25px] flex items-center gap-[13px]">
        <span className="grid size-10 place-items-center rounded-[9px] border border-line bg-panel-2 text-lg">
          ◎
        </span>
        <div>
          <h2 className="m-0 text-lg font-semibold">Test your connection</h2>
          <p className="m-0 mt-1.5 text-sm text-muted">
            DNS, TLS, and device authentication are checked against your advertised URL.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 rounded-lg border border-line-soft bg-panel-2 px-3.5 py-3">
        <StatusDot variant={statusDotForSummary(result ?? undefined, isRunning)} />
        <code className="font-mono text-sm text-body">{endpointLabel}</code>
        <span className="ml-auto text-2xs text-dim">External endpoint</span>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {connectionCheckOrder.map((checkId) => {
          const check = checksById.get(checkId)
          const title = connectionCheckTitles[checkId]

          return (
            <div
              key={checkId}
              className="flex items-center gap-3 rounded-lg border border-line-soft bg-[#0b0e13] px-3.5 py-3"
            >
              <StatusDot
                variant={
                  isRunning && check === undefined
                    ? "warning"
                    : check?.status === "pass"
                      ? "online"
                      : check?.status === "warn"
                        ? "warning"
                        : check?.status === "fail"
                          ? "offline"
                          : "warning"
                }
              />
              <div className="flex-1">
                <strong className="block text-sm font-medium text-body">{title}</strong>
                <small className="mt-1 block text-xs text-dim">
                  {check?.message ?? "Waiting to run…"}
                </small>
              </div>
              <em className="text-2xs text-dim not-italic">
                {statusLabelForCheck(check?.status, isRunning && check === undefined)}
              </em>
            </div>
          )
        })}
      </div>

      {runError !== null ? (
        <p className="mt-4 text-xs text-danger" role="alert">
          {runError}
        </p>
      ) : null}

      <div className="mt-4 flex items-center justify-end">
        <Button variant="secondary" disabled={isRunning} onClick={runTest}>
          Run
        </Button>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-line-soft pt-[18px]">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          {canContinueAnyway ? (
            <Button variant="secondary" onClick={onContinue}>
              Continue anyway
            </Button>
          ) : null}
          <Button disabled={!canContinue || isRunning} onClick={onContinue}>
            Continue <span aria-hidden>→</span>
          </Button>
        </div>
      </div>
    </div>
  )
}

type PairDeviceStepProps = {
  onBack: () => void
  endpointHint: "local" | "remote"
}

const qrPayload = (pairingCode: CreatePairingCodeResponse): string =>
  JSON.stringify({
    code: pairingCode.code,
    endpoint: pairingCode.endpoint,
  })

const PairDeviceStep: React.FC<PairDeviceStepProps> = ({ onBack, endpointHint }) => {
  const createPairingCodeMutation = useCreatePairingCodeMutation()
  const { mutateAsync, isError } = createPairingCodeMutation
  const initialPairingCodePromise = useRef<Promise<CreatePairingCodeResponse> | null>(null)
  const navigate = useNavigate()
  const [pairingCode, setPairingCode] = useState<CreatePairingCodeResponse | null>(null)
  const [pairedDeviceName, setPairedDeviceName] = useState<string | null>(null)
  const [isCreatingPairingCode, setIsCreatingPairingCode] = useState(true)

  useEffect(() => {
    const active = { value: true }
    const promise = initialPairingCodePromise.current ?? mutateAsync()
    initialPairingCodePromise.current = promise

    void promise.then(
      (created) => {
        if (active.value) {
          setPairingCode(created)
          setIsCreatingPairingCode(false)
        }
      },
      () => {
        if (active.value) {
          setIsCreatingPairingCode(false)
        }
      },
    )

    return () => {
      active.value = false
    }
  }, [mutateAsync])

  useEffect(() => {
    const stream = openAppEventStream({
      handlers: {
        onEvents: (events) => {
          const paired = events.find((event) => event.type === "device.paired")
          if (paired?.type === "device.paired") {
            setPairedDeviceName(paired.payload.name)
          }
        },
      },
    })

    return () => {
      stream.close()
    }
  }, [])

  const handleRegenerate = () => {
    setPairedDeviceName(null)
    setIsCreatingPairingCode(true)
    const promise = mutateAsync()
    void promise.then(
      (created) => {
        setPairingCode(created)
        setIsCreatingPairingCode(false)
      },
      () => {
        setIsCreatingPairingCode(false)
      },
    )
  }

  const handleCopyCode = () => {
    if (pairingCode === null) {
      return
    }

    void navigator.clipboard.writeText(pairingCode.code)
  }

  const codeLabel = pairingCode?.code ?? "—"
  const expiresLabel =
    pairingCode === null ? "Waiting for code…" : `Expires at ${pairingCode.expiresAt}`
  const canViewDevices = pairedDeviceName !== null
  const listeningLabel =
    endpointHint === "remote"
      ? "Listening on your advertised HTTPS endpoint"
      : "Listening on this local Agent Server endpoint"

  return (
    <div>
      <div className="mb-[25px] flex items-center gap-[13px]">
        <span className="grid size-10 place-items-center rounded-[9px] border border-line bg-panel-2 text-lg">
          ◇
        </span>
        <div>
          <h2 className="m-0 text-lg font-semibold">Pair a device</h2>
          <p className="m-0 mt-1.5 text-sm text-muted">
            Enter the six-character code in a trusted client. The QR includes the same code plus
            the endpoint for convenience.
          </p>
        </div>
      </div>

      <div className="grid items-center gap-7 md:grid-cols-[205px_1fr] max-[640px]:justify-items-center">
        <div className="relative grid size-[205px] place-items-center rounded-[9px] bg-white p-3.5">
          {pairingCode === null ? (
            <span className="text-sm text-lime-ink">Waiting for code</span>
          ) : (
            <QRCodeSVG
              value={qrPayload(pairingCode)}
              size={176}
              bgColor="#ffffff"
              fgColor="#10150c"
              role="img"
              aria-label="QR pairing payload"
            />
          )}
        </div>

        <div>
          <p className="m-0 font-mono text-2xs tracking-[0.12em] text-dim">PAIRING CODE</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              role="status"
              aria-label="Pairing code"
              className="font-mono text-2xl font-semibold tracking-[0.08em] text-body"
            >
              {codeLabel}
            </span>
            <Button
              variant="secondary"
              disabled={pairingCode === null}
              className="min-h-7 px-2.5"
              onClick={handleCopyCode}
            >
              Copy
            </Button>
          </div>
          <p className="mt-3 text-xs leading-[1.55] text-muted">
            <strong className="text-body">{expiresLabel}</strong>. Keep this page open until
            pairing is complete.
          </p>
          <ol className="mt-4 space-y-2 pl-4 text-xs leading-[1.55] text-body-soft">
            <li>Open a compatible Agent Server client</li>
            <li>
              Select <strong className="text-body">Pair a server</strong>
            </li>
            <li>Enter the pairing code, or scan the QR as a shortcut</li>
          </ol>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 rounded-lg border border-line-soft bg-panel-2 px-3.5 py-3">
        <div className="flex-1">
          <strong className="block text-xs text-body">
            {pairedDeviceName === null
              ? "Waiting for a device…"
              : `${pairedDeviceName} paired`}
          </strong>
          <small className="mt-1 block text-2xs text-dim">{listeningLabel}</small>
        </div>
        <Button
          variant="text"
          disabled={isCreatingPairingCode}
          onClick={handleRegenerate}
        >
          Regenerate
        </Button>
      </div>

      {isError ? (
        <div className="mt-4 rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-3 text-xs text-danger" role="alert">
          Could not create a pairing code.
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between border-t border-line-soft pt-[18px]">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button disabled={!canViewDevices} onClick={() => void navigate("/devices")}>
          View paired devices <span aria-hidden>→</span>
        </Button>
      </div>
    </div>
  )
}

export const ConnectWizard: React.FC = () => {
  const [searchParams] = useSearchParams()
  const initialView = initialViewFromSearchParam(searchParams.get("step"))
  const [view, setView] = useState<WizardView>(initialView)
  const [accessMode, setAccessMode] = useState<AccessMode>("local")
  const [proxyProvider, setProxyProvider] = useState<ProxyProvider>("caddy")
  const [modeSwitchError, setModeSwitchError] = useState<string | null>(null)
  const [localPairGate, setLocalPairGate] = useState<"pending" | "ready">(
    initialView.kind === "local-pair" ? "pending" : "ready",
  )
  const updateRuntimeSettingsMutation = useUpdateRuntimeSettingsMutation()
  const runtimeSettingsQuery = useRuntimeSettingsQuery()
  const hasPreparedDeepLinkLocalPair = useRef(false)

  const cloudStep = view.kind === "cloud" ? view.step : null

  const resolveRuntimeSettingsView = async () => {
    if (runtimeSettingsQuery.isSuccess && runtimeSettingsQuery.data !== undefined) {
      return runtimeSettingsQuery.data
    }

    const result = await runtimeSettingsQuery.refetch()
    if (result.data === undefined) {
      throw new Error("runtime settings unavailable")
    }

    return result.data
  }

  const enterLocalPair = () => {
    setModeSwitchError(null)
    setLocalPairGate("pending")

    void resolveRuntimeSettingsView()
      .then(async (settingsView) => {
        if (settingsView.settings.advertisedUrl !== null) {
          await updateRuntimeSettingsMutation.mutateAsync({ body: { advertisedUrl: null } })
        }

        setView({ kind: "local-pair" })
        setLocalPairGate("ready")
      })
      .catch(() => {
        setModeSwitchError("Could not clear the saved external URL. Try again.")
        setLocalPairGate("ready")
      })
  }

  useEffect(() => {
    if (hasPreparedDeepLinkLocalPair.current) {
      return
    }

    if (initialView.kind !== "local-pair") {
      return
    }

    if (!runtimeSettingsQuery.isSuccess) {
      return
    }

    hasPreparedDeepLinkLocalPair.current = true

    const advertisedUrl = runtimeSettingsQuery.data.settings.advertisedUrl
    if (advertisedUrl === null) {
      setLocalPairGate("ready")
      return
    }

    setModeSwitchError(null)
    void updateRuntimeSettingsMutation
      .mutateAsync({ body: { advertisedUrl: null } })
      .then(() => setLocalPairGate("ready"))
      .catch(() => {
        setModeSwitchError("Could not clear the saved external URL. Try again.")
        setView({ kind: "mode-select" })
        setLocalPairGate("ready")
      })
  }, [
    initialView.kind,
    runtimeSettingsQuery.data,
    runtimeSettingsQuery.isSuccess,
    updateRuntimeSettingsMutation,
  ])

  const handleModeContinue = () => {
    if (accessMode === "local") {
      enterLocalPair()
      return
    }

    setModeSwitchError(null)
    setView({ kind: "cloud", step: 1 })
  }

  const handleBackToModeSelect = () => {
    setView({ kind: "mode-select" })
  }

  const handleLocalPairBack = () => {
    setLocalPairGate("ready")
    setView({ kind: "mode-select" })
  }

  const showCloudRail = view.kind === "cloud"
  const cloudProgress =
    cloudStep === null ? null : `${cloudStep} / ${cloudWizardSteps.length}`

  return (
    <div>
      <div className="mb-[22px] flex items-start justify-between gap-4">
        <p className="m-0 max-w-2xl text-sm text-muted">
          Choose how devices reach this local agent server.
        </p>
        {cloudProgress !== null ? (
          <div
            role="status"
            aria-label="Wizard progress"
            className="shrink-0 rounded-lg border border-line-soft bg-panel-2 px-3 py-2 font-mono text-2xs text-muted"
          >
            {cloudProgress}
          </div>
        ) : null}
      </div>

      <div
        className={`grid items-start justify-center gap-[22px] max-[820px]:grid-cols-1 ${showCloudRail ? "md:grid-cols-[205px_minmax(0,800px)]" : ""}`}
      >
        {showCloudRail && cloudStep !== null ? (
          <ConnectWizardStepRail
            currentStep={cloudStep}
            onStepSelect={(step) => setView({ kind: "cloud", step: step as 1 | 2 | 3 })}
          />
        ) : null}

        <section
          className={`min-h-[540px] rounded-[10px] border border-line bg-panel p-7 max-[640px]:min-h-0 max-[640px]:p-[19px_15px] ${showCloudRail ? "" : "mx-auto w-full max-w-[800px]"}`}
        >
          {view.kind === "mode-select" ? (
            <AccessModeStep
              accessMode={accessMode}
              onAccessModeChange={setAccessMode}
              onContinue={handleModeContinue}
              switchError={modeSwitchError}
            />
          ) : null}
          {view.kind === "cloud" && view.step === 1 ? (
            <ExternalUrlStep
              proxyProvider={proxyProvider}
              onProxyProviderChange={setProxyProvider}
              onBack={handleBackToModeSelect}
              onContinue={() => setView({ kind: "cloud", step: 2 })}
            />
          ) : null}
          {view.kind === "cloud" && view.step === 2 ? (
            <TestConnectionStep
              onBack={() => setView({ kind: "cloud", step: 1 })}
              onContinue={() => setView({ kind: "cloud", step: 3 })}
            />
          ) : null}
          {view.kind === "cloud" && view.step === 3 ? (
            <PairDeviceStep
              onBack={() => setView({ kind: "cloud", step: 2 })}
              endpointHint="remote"
            />
          ) : null}
          {view.kind === "local-pair" && localPairGate === "ready" ? (
            <PairDeviceStep onBack={handleLocalPairBack} endpointHint="local" />
          ) : null}
          {view.kind === "local-pair" && localPairGate === "pending" ? (
            <p className="m-0 text-sm text-muted">Preparing local pairing…</p>
          ) : null}
        </section>
      </div>
    </div>
  )
}
