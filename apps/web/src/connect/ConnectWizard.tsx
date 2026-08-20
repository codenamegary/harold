import React, { useEffect, useRef, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  Smartphone,
} from "lucide-react"
import { CreatePairingCodeResponse, PairingEndpointChoice } from "contracts/http/pairing-code"
import { formatPairingQrUri } from "contracts/pairing/qr-uri"
import { useNavigate } from "react-router"
import { Button } from "../design-system/Button"
import { CopyButton } from "../design-system/CopyButton"
import { FieldLabel } from "../design-system/FieldLabel"
import { StatusPill } from "../design-system/StatusPill"
import { TextInput } from "../design-system/TextInput"
import { pollForPairedDevice } from "./poll.for.paired.device"
import {
  advertisedUrlFromHost,
  hostFromAdvertisedUrl,
  normalizeExternalUrlHost,
} from "../runtime-settings/advertised.url.host"
import { isCloudProxyOn } from "../runtime-settings/is.cloud.proxy.on"
import { useRuntimeSettingsQuery } from "../runtime-settings/use.runtime.settings.query"
import { useUpdateRuntimeSettingsMutation } from "../runtime-settings/use.update.runtime.settings.mutation"
import { cloudWizardSteps } from "./connect.wizard.steps"
import {
  ConnectionTestPanel,
  ConnectionTestPanelState,
} from "./ConnectionTestPanel"
import {
  localAgentPort,
  proxyProviders,
  proxyTemplates,
  ProxyProvider,
} from "./proxy.templates"
import { HttpsAbsoluteUrlSchema } from "contracts/http/runtime-settings"
import { useCreatePairingCodeMutation } from "./use.create.pairing.code.mutation"

type WizardView = { kind: "loading" } | { kind: "pair" } | { kind: "cloud"; step: 1 | 2 | 3 }

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
            className={`text-2xs z-[1] grid size-[35px] shrink-0 place-items-center rounded-full border font-mono ${isActive ? "border-lime bg-lime text-lime-ink shadow-[0_0_0_4px_rgba(182,243,107,0.08)]" : isComplete ? "border-lime/35 text-lime" : "border-line bg-ink"}`}
          >
            {isComplete ? <Check aria-hidden className="size-3.5" /> : step.number}
          </b>
          <span className="pt-[3px] max-[820px]:hidden">
            <strong className="block text-base font-medium">{step.title}</strong>
            <small className="mt-[5px] block text-sm text-[#505966]">{step.subtitle}</small>
          </span>
        </button>
      )
    })}
  </aside>
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
      await updateRuntimeSettingsMutation.mutateAsync({
        body: { advertisedUrl, advertisedUrlEnabled: true },
      })
      onContinue()
    } catch {
      setSaveError("Could not save the external URL. Check the hostname and try again.")
    }
  }

  return (
    <div>
      <div className="mb-[25px] flex items-center gap-[13px]">
        <span className="grid size-10 place-items-center rounded-[9px] border border-line bg-panel-2 text-body">
          <ArrowUpRight aria-hidden className="size-5" />
        </span>
        <div>
          <h2 className="m-0 text-lg font-semibold">Configure external access</h2>
          <p className="m-0 mt-1.5 text-base text-muted">
            Use an HTTPS endpoint that forwards to{" "}
            <code className="text-[#b8c0cb]">127.0.0.1:{localAgentPort}</code>.
          </p>
        </div>
      </div>

      <FieldLabel htmlFor="external-url">Public server URL</FieldLabel>
      <div className="flex items-center gap-2 rounded-md border border-line-input bg-surface-deep px-[11px]">
        <span className="text-base text-dim">https://</span>
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
        <p className="mt-2 text-base text-danger" role="alert">
          {validationError}
        </p>
      ) : null}

      {saveError !== null ? (
        <p className="mt-2 text-base text-danger" role="alert">
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
              className={`relative cursor-pointer border-0 bg-transparent px-3.5 py-2.5 text-base ${isActive ? "text-body after:absolute after:right-2.5 after:bottom-[-1px] after:left-2.5 after:h-0.5 after:bg-lime after:content-['']" : "text-[#687280]"}`}
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
          <CopyButton value={template.code(fullUrl)} />
        </div>
        <pre className="m-0 overflow-x-auto p-3.5 font-mono text-base leading-[1.6] text-body-soft">
          {template.code(fullUrl)}
        </pre>
      </div>

      <p className="mt-3.5 text-base leading-[1.55] text-muted">{template.note}</p>

      <div className="mt-6 flex items-center justify-between border-t border-line-soft pt-[18px]">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button
          disabled={updateRuntimeSettingsMutation.isPending}
          onClick={() => void handleSave()}
        >
          Save &amp; continue <ArrowRight aria-hidden className="size-4" />
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
        <p className="m-0 mt-1.5 text-base text-muted" role="status">
          Loading saved URL…
        </p>
      </div>
    )
  }

  if (runtimeSettingsQuery.isError || runtimeSettingsQuery.data === undefined) {
    return (
      <div>
        <h2 className="m-0 text-lg font-semibold">Configure external access</h2>
        <p className="m-0 mt-1.5 text-base text-danger" role="alert">
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

const TestConnectionStep: React.FC<TestConnectionStepProps> = ({
  onBack,
  onContinue,
}) => {
  const runtimeSettingsQuery = useRuntimeSettingsQuery()
  const [panelState, setPanelState] = useState<ConnectionTestPanelState>({
    result: null,
    isRunning: false,
    canContinue: false,
    canContinueAnyway: false,
  })

  const advertisedUrl = runtimeSettingsQuery.data?.settings.advertisedUrl ?? null

  if (runtimeSettingsQuery.isPending) {
    return (
      <div>
        <h2 className="m-0 text-lg font-semibold">Test your connection</h2>
        <p className="m-0 mt-1.5 text-base text-muted" role="status">
          Loading saved URL…
        </p>
      </div>
    )
  }

  if (advertisedUrl === null) {
    return (
      <div>
        <h2 className="m-0 text-lg font-semibold">Test your connection</h2>
        <p className="m-0 mt-1.5 text-base text-danger" role="alert">
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
        <span className="grid size-10 place-items-center rounded-[9px] border border-line bg-panel-2 text-body">
          <Activity aria-hidden className="size-5" />
        </span>
        <div>
          <h2 className="m-0 text-lg font-semibold">Test your connection</h2>
          <p className="m-0 mt-1.5 text-base text-muted">
            DNS, TLS, and device authentication are checked against your advertised URL.
          </p>
        </div>
      </div>

      <ConnectionTestPanel advertisedUrl={advertisedUrl} onStateChange={setPanelState} />

      <div className="mt-6 flex items-center justify-between border-t border-line-soft pt-[18px]">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          {panelState.canContinueAnyway ? (
            <Button variant="secondary" onClick={onContinue}>
              Continue anyway
            </Button>
          ) : null}
          <Button disabled={!panelState.canContinue} onClick={onContinue}>
            Continue <ArrowRight aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

type PairDeviceStepProps = {
  pairingEndpoint: PairingEndpointChoice
  cloudProxyOn: boolean
  advertisedUrl: string | null
  onPairingEndpointChange: (endpoint: PairingEndpointChoice) => void
  onSetupCloud: () => void
  onEnableCloud: () => void
  onBack?: () => void
  onFinish: () => void
  finishLabel: string
  finishAlwaysEnabled: boolean
}

const qrPayload = (pairingCode: CreatePairingCodeResponse): string =>
  formatPairingQrUri({
    endpoint: pairingCode.endpoint,
    code: pairingCode.code,
  })

const endpointChoiceClass = (active: boolean) =>
  `rounded-md border px-3 py-1.5 text-sm cursor-pointer ${
    active
      ? "border-lime/50 bg-[rgba(182,243,107,0.06)] text-body"
      : "border-line bg-transparent text-muted hover:border-line-hover"
  }`

const PairDeviceStep: React.FC<PairDeviceStepProps> = ({
  pairingEndpoint,
  cloudProxyOn,
  advertisedUrl,
  onPairingEndpointChange,
  onSetupCloud,
  onEnableCloud,
  onBack,
  onFinish,
  finishLabel,
  finishAlwaysEnabled,
}) => {
  const createPairingCodeMutation = useCreatePairingCodeMutation()
  const { mutateAsync, isError } = createPairingCodeMutation
  const requestRef = useRef<{
    endpoint: PairingEndpointChoice
    promise: Promise<CreatePairingCodeResponse>
  } | null>(null)
  const [pairingCode, setPairingCode] = useState<CreatePairingCodeResponse | null>(null)
  const [pairedDeviceName, setPairedDeviceName] = useState<string | null>(null)
  const [isCreatingPairingCode, setIsCreatingPairingCode] = useState(true)
  const [pairPollEpoch, setPairPollEpoch] = useState(0)

  useEffect(() => {
    const active = { value: true }
    const cached = requestRef.current
    const promise =
      cached?.endpoint === pairingEndpoint
        ? cached.promise
        : mutateAsync({ endpoint: pairingEndpoint })
    requestRef.current = { endpoint: pairingEndpoint, promise }

    setIsCreatingPairingCode(true)
    setPairingCode(null)
    setPairedDeviceName(null)

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
  }, [mutateAsync, pairingEndpoint])

  useEffect(() => {
    return pollForPairedDevice({
      onPaired: (device) => {
        setPairedDeviceName(device.name)
      },
    })
  }, [pairPollEpoch, pairingEndpoint])

  const handleRegenerate = () => {
    setPairedDeviceName(null)
    setPairPollEpoch((epoch) => epoch + 1)
    setIsCreatingPairingCode(true)
    const promise = mutateAsync({ endpoint: pairingEndpoint })
    requestRef.current = { endpoint: pairingEndpoint, promise }
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

  const codeLabel = pairingCode?.code ?? "—"
  const expiresLabel =
    pairingCode === null ? "Waiting for code…" : `Expires at ${pairingCode.expiresAt}`
  const finishEnabled = finishAlwaysEnabled || pairedDeviceName !== null
  const listeningLabel = pairingCode?.endpoint ?? "Waiting for endpoint…"

  return (
    <div>
      <div className="mb-[25px] flex items-center justify-between gap-3">
        <div className="flex items-center gap-[13px]">
          <span className="grid size-10 place-items-center rounded-[9px] border border-line bg-panel-2 text-body">
            <Smartphone aria-hidden className="size-5" />
          </span>
          <div>
            <h2 className="m-0 text-lg font-semibold">Pair a device</h2>
            <p className="m-0 mt-1.5 text-base text-muted">
              Enter the code in a trusted client, or scan the QR.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <StatusPill variant="success">Local</StatusPill>
          {cloudProxyOn ? <StatusPill variant="violet">Cloud</StatusPill> : null}
        </div>
      </div>

      {cloudProxyOn ? (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Pairing endpoint">
          <button
            type="button"
            aria-pressed={pairingEndpoint === "advertised"}
            className={endpointChoiceClass(pairingEndpoint === "advertised")}
            onClick={() => onPairingEndpointChange("advertised")}
          >
            Cloud proxy
          </button>
          <button
            type="button"
            aria-pressed={pairingEndpoint === "loopback"}
            className={endpointChoiceClass(pairingEndpoint === "loopback")}
            onClick={() => onPairingEndpointChange("loopback")}
          >
            This machine
          </button>
        </div>
      ) : advertisedUrl === null ? (
        <div className="mb-4">
          <Button variant="text" onClick={onSetupCloud}>
            Set up cloud proxy
          </Button>
        </div>
      ) : (
        <div className="mb-4">
          <Button variant="text" onClick={onEnableCloud}>
            Use cloud proxy
          </Button>
        </div>
      )}

      <div className="grid items-center gap-7 md:grid-cols-[205px_1fr] max-[640px]:justify-items-center">
        <div className="relative grid size-[205px] place-items-center rounded-[9px] bg-white p-3.5">
          {pairingCode === null ? (
            <span className="text-base text-lime-ink">Waiting for code</span>
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
            <CopyButton
              value={pairingCode?.code ?? ""}
              disabled={pairingCode === null}
            />
          </div>
          <p className="mt-3 text-base leading-[1.55] text-muted">
            <strong className="text-body">{expiresLabel}</strong>
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 rounded-lg border border-line-soft bg-panel-2 px-3.5 py-3">
        <div className="flex-1">
          <strong className="block text-base text-body">
            {pairedDeviceName === null
              ? "Waiting for a device…"
              : `${pairedDeviceName} paired`}
          </strong>
          <small className="mt-1 block truncate font-mono text-2xs text-dim">
            {listeningLabel}
          </small>
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
        <div className="mt-4 rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-3 text-base text-danger" role="alert">
          Could not create a pairing code.
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between border-t border-line-soft pt-[18px]">
        {onBack !== undefined ? (
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button disabled={!finishEnabled} onClick={onFinish}>
          {finishLabel} <ArrowRight aria-hidden className="size-4" />
        </Button>
      </div>
    </div>
  )
}

export const ConnectWizard: React.FC = () => {
  const navigate = useNavigate()
  const [view, setView] = useState<WizardView>({ kind: "loading" })
  const [proxyProvider, setProxyProvider] = useState<ProxyProvider>("caddy")
  const [pairingEndpoint, setPairingEndpoint] =
    useState<PairingEndpointChoice>("loopback")
  const updateRuntimeSettingsMutation = useUpdateRuntimeSettingsMutation()
  const runtimeSettingsQuery = useRuntimeSettingsQuery()
  const hasResolvedLanding = useRef(false)

  const cloudStep = view.kind === "cloud" ? view.step : null
  const settings = runtimeSettingsQuery.data?.settings
  const advertisedUrl = settings?.advertisedUrl ?? null
  const cloudProxyOn = settings === undefined ? false : isCloudProxyOn(settings)

  useEffect(() => {
    if (hasResolvedLanding.current) {
      return
    }

    if (!runtimeSettingsQuery.isSuccess) {
      return
    }

    hasResolvedLanding.current = true
    setView({ kind: "pair" })
    setPairingEndpoint(
      isCloudProxyOn(runtimeSettingsQuery.data.settings) ? "advertised" : "loopback",
    )
  }, [runtimeSettingsQuery.data, runtimeSettingsQuery.isSuccess])

  useEffect(() => {
    setPairingEndpoint(cloudProxyOn ? "advertised" : "loopback")
  }, [cloudProxyOn])

  const pairStep = (
    <PairDeviceStep
      pairingEndpoint={pairingEndpoint}
      cloudProxyOn={cloudProxyOn}
      advertisedUrl={advertisedUrl}
      onPairingEndpointChange={setPairingEndpoint}
      onSetupCloud={() => setView({ kind: "cloud", step: 1 })}
      onEnableCloud={() => {
        void updateRuntimeSettingsMutation.mutateAsync({
          body: { advertisedUrlEnabled: true },
        })
      }}
      onBack={
        view.kind === "cloud"
          ? () => setView({ kind: "cloud", step: 2 })
          : undefined
      }
      onFinish={
        view.kind === "cloud"
          ? () => setView({ kind: "pair" })
          : () => void navigate("/devices")
      }
      finishLabel={view.kind === "cloud" ? "Finish" : "View paired devices"}
      finishAlwaysEnabled={view.kind === "cloud"}
    />
  )

  const showCloudRail = view.kind === "cloud"
  const cloudProgress =
    cloudStep === null ? null : `${cloudStep} / ${cloudWizardSteps.length}`

  return (
    <div>
      <div className="mb-[22px] flex items-start justify-between gap-4">
        <p className="m-0 max-w-2xl text-base text-muted">Pair a trusted device.</p>
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
          {view.kind === "loading" ? (
            <p className="m-0 text-base text-muted" role="status">
              Loading connection settings…
            </p>
          ) : null}
          {view.kind === "pair" ? pairStep : null}
          {view.kind === "cloud" && view.step === 1 ? (
            <ExternalUrlStep
              proxyProvider={proxyProvider}
              onProxyProviderChange={setProxyProvider}
              onBack={() => setView({ kind: "pair" })}
              onContinue={() => setView({ kind: "cloud", step: 2 })}
            />
          ) : null}
          {view.kind === "cloud" && view.step === 2 ? (
            <TestConnectionStep
              onBack={() => setView({ kind: "cloud", step: 1 })}
              onContinue={() => setView({ kind: "cloud", step: 3 })}
            />
          ) : null}
          {view.kind === "cloud" && view.step === 3 ? pairStep : null}
        </section>
      </div>
    </div>
  )
}
