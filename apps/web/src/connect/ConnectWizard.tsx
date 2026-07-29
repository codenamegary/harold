import React, { useState } from "react"
import { Button } from "../design-system/Button"
import { FieldLabel } from "../design-system/FieldLabel"
import { StatusDot } from "../design-system/StatusDot"
import { StatusPill } from "../design-system/StatusPill"
import { TextInput } from "../design-system/TextInput"
import { connectWizardSteps } from "./connect.wizard.steps"
import {
  defaultExternalHost,
  localAgentPort,
  proxyProviders,
  proxyTemplates,
  ProxyProvider,
} from "./proxy.templates"

type AccessMode = "local" | "cloud"

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
    {connectWizardSteps.map((step) => {
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
}

const AccessModeStep: React.FC<AccessModeStepProps> = ({
  accessMode,
  onAccessModeChange,
  onContinue,
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

const ExternalUrlStep: React.FC<ExternalUrlStepProps> = ({
  proxyProvider,
  onProxyProviderChange,
  onBack,
  onContinue,
}) => {
  const template = proxyTemplates[proxyProvider]
  const fullUrl = `https://${defaultExternalHost}`

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
          readOnly
          value={defaultExternalHost}
          className="border-0 bg-transparent px-0 focus:border-0"
        />
      </div>

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
          <Button variant="secondary" aria-disabled className="min-h-7 px-2.5">
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
        <Button onClick={onContinue}>
          Save &amp; continue <span aria-hidden>→</span>
        </Button>
      </div>
    </div>
  )
}

type TestConnectionStepProps = {
  onBack: () => void
}

const testChecks = [
  {
    id: "dns",
    title: "DNS & reachability",
    detail: "Public endpoint resolves successfully",
  },
  {
    id: "tls",
    title: "TLS certificate",
    detail: "Certificate is valid and trusted",
  },
  {
    id: "acp",
    title: "ACP handshake",
    detail: "Protocol version is compatible",
  },
] as const

const TestConnectionStep: React.FC<TestConnectionStepProps> = ({ onBack }) => (
  <div>
    <div className="mb-[25px] flex items-center gap-[13px]">
      <span className="grid size-10 place-items-center rounded-[9px] border border-line bg-panel-2 text-lg">
        ◎
      </span>
      <div>
        <h2 className="m-0 text-lg font-semibold">Test your connection</h2>
        <p className="m-0 mt-1.5 text-sm text-muted">
          We&apos;ll verify TLS, ACP discovery, and authentication.
        </p>
      </div>
    </div>

    <div className="flex items-center gap-2.5 rounded-lg border border-line-soft bg-panel-2 px-3.5 py-3">
      <StatusDot variant="warning" />
      <code className="font-mono text-sm text-body">https://{defaultExternalHost}</code>
      <span className="ml-auto text-2xs text-dim">External endpoint</span>
    </div>

    <div className="mt-4 flex flex-col gap-2">
      {testChecks.map((check) => (
        <div
          key={check.id}
          className="flex items-center gap-3 rounded-lg border border-line-soft bg-[#0b0e13] px-3.5 py-3"
        >
          <span className="font-mono text-sm text-dim">·</span>
          <div className="flex-1">
            <strong className="block text-sm font-medium text-body">{check.title}</strong>
            <small className="mt-1 block text-xs text-dim">{check.detail}</small>
          </div>
          <em className="text-2xs text-dim not-italic">Waiting</em>
        </div>
      ))}
    </div>

    <div className="mt-4 rounded-lg border border-line-soft bg-panel-2 px-3.5 py-3">
      <span className="block text-xs text-body">Ready when you are</span>
      <small className="mt-1 block text-2xs text-dim">
        Tests run locally and take about 3 seconds.
      </small>
    </div>

    <div className="mt-6 flex items-center justify-between border-t border-line-soft pt-[18px]">
      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
      <Button disabled>
        Run connection test <span aria-hidden>⌁</span>
      </Button>
    </div>
  </div>
)

type PairDeviceStepProps = {
  onBack: () => void
}

const PairDeviceStep: React.FC<PairDeviceStepProps> = ({ onBack }) => (
  <div>
    <div className="mb-[25px] flex items-center gap-[13px]">
      <span className="grid size-10 place-items-center rounded-[9px] border border-line bg-panel-2 text-lg">
        ◇
      </span>
      <div>
        <h2 className="m-0 text-lg font-semibold">Pair an Android device</h2>
        <p className="m-0 mt-1.5 text-sm text-muted">
          Scan the code or enter the six-character code in the Agent Server app.
        </p>
      </div>
    </div>

    <div className="grid items-center gap-7 md:grid-cols-[205px_1fr] max-[640px]:justify-items-center">
      <div
        aria-label="Decorative QR pairing code"
        className="relative size-[205px] rounded-[9px] bg-[#c8cdc4] p-3.5"
      >
        <div className="size-full rounded bg-[#b8bdb4]" />
        <span className="absolute top-1/2 left-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-lg bg-white text-sm font-semibold text-lime-ink">
          A
        </span>
      </div>

      <div>
        <p className="m-0 font-mono text-2xs tracking-[0.12em] text-dim">PAIRING CODE</p>
        <div className="mt-2 flex items-center gap-2">
          <span
            role="status"
            aria-label="Pairing code"
            className="font-mono text-2xl font-semibold tracking-[0.08em] text-body"
          >
            —
          </span>
          <Button variant="secondary" aria-disabled className="min-h-7 px-2.5">
            Copy
          </Button>
        </div>
        <p className="mt-3 text-xs leading-[1.55] text-muted">
          Expires in <strong className="text-body">—</strong>. Keep this page open until pairing is
          complete.
        </p>
        <ol className="mt-4 space-y-2 pl-4 text-xs leading-[1.55] text-body-soft">
          <li>Open Agent Server on Android</li>
          <li>
            Select <strong className="text-body">Pair a server</strong>
          </li>
          <li>Scan this code or enter the pairing code</li>
        </ol>
      </div>
    </div>

    <div className="mt-5 flex items-center gap-3 rounded-lg border border-line-soft bg-panel-2 px-3.5 py-3">
      <div className="flex-1">
        <strong className="block text-xs text-body">Waiting for a device…</strong>
        <small className="mt-1 block text-2xs text-dim">
          Listening securely on your external endpoint
        </small>
      </div>
      <Button variant="text" disabled>
        Regenerate
      </Button>
    </div>

    <div className="mt-6 flex items-center justify-between border-t border-line-soft pt-[18px]">
      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
      <Button disabled>
        View paired devices <span aria-hidden>→</span>
      </Button>
    </div>
  </div>
)

export const ConnectWizard: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1)
  const [accessMode, setAccessMode] = useState<AccessMode>("local")
  const [proxyProvider, setProxyProvider] = useState<ProxyProvider>("caddy")

  const goToStep = (step: number) => setCurrentStep(step)
  const goToNextStep = () => setCurrentStep((step) => Math.min(step + 1, connectWizardSteps.length))
  const goToPreviousStep = () => setCurrentStep((step) => Math.max(step - 1, 1))

  return (
    <div>
      <div className="mb-[22px] flex items-start justify-between gap-4">
        <p className="m-0 max-w-2xl text-sm text-muted">
          Choose how your Android app reaches this local agent server.
        </p>
        <div
          role="status"
          aria-label="Wizard progress"
          className="shrink-0 rounded-lg border border-line-soft bg-panel-2 px-3 py-2 font-mono text-2xs text-muted"
        >
          {currentStep} / {connectWizardSteps.length}
        </div>
      </div>

      <div className="grid items-start justify-center gap-[22px] max-[820px]:grid-cols-1 md:grid-cols-[205px_minmax(0,800px)]">
        <ConnectWizardStepRail currentStep={currentStep} onStepSelect={goToStep} />

        <section className="min-h-[540px] rounded-[10px] border border-line bg-panel p-7 max-[640px]:min-h-0 max-[640px]:p-[19px_15px]">
          {currentStep === 1 ? (
            <AccessModeStep
              accessMode={accessMode}
              onAccessModeChange={setAccessMode}
              onContinue={goToNextStep}
            />
          ) : null}
          {currentStep === 2 ? (
            <ExternalUrlStep
              proxyProvider={proxyProvider}
              onProxyProviderChange={setProxyProvider}
              onBack={goToPreviousStep}
              onContinue={goToNextStep}
            />
          ) : null}
          {currentStep === 3 ? (
            <TestConnectionStep onBack={goToPreviousStep} />
          ) : null}
          {currentStep === 4 ? <PairDeviceStep onBack={goToPreviousStep} /> : null}
        </section>
      </div>
    </div>
  )
}
