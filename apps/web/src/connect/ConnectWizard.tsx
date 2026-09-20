import React, { useEffect, useRef, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { ArrowRight, Smartphone } from "lucide-react"
import { CreatePairingCodeResponse, PairingEndpointChoice } from "contracts/http/pairing-code"
import { formatPairingQrUri } from "contracts/pairing/qr-uri"
import { Link, useNavigate } from "react-router"
import { Button } from "../design-system/Button"
import { CopyButton } from "../design-system/CopyButton"
import { pollForPairedDevice } from "./poll.for.paired.device"
import { isCloudProxyOn } from "../runtime-settings/is.cloud.proxy.on"
import { useRuntimeSettingsQuery } from "../runtime-settings/use.runtime.settings.query"
import { useCreatePairingCodeMutation } from "./use.create.pairing.code.mutation"

const qrPayload = (pairingCode: CreatePairingCodeResponse): string =>
  formatPairingQrUri({
    endpoint: pairingCode.endpoint,
    code: pairingCode.code,
  })

export const ConnectWizard: React.FC = () => {
  const navigate = useNavigate()
  const createPairingCodeMutation = useCreatePairingCodeMutation()
  const { mutateAsync, isError } = createPairingCodeMutation
  const runtimeSettingsQuery = useRuntimeSettingsQuery()
  const settings = runtimeSettingsQuery.data?.settings
  const cloudProxyOn = settings === undefined ? false : isCloudProxyOn(settings)
  const pairingEndpoint: PairingEndpointChoice = cloudProxyOn ? "advertised" : "loopback"

  const requestRef = useRef<{
    endpoint: PairingEndpointChoice
    promise: Promise<CreatePairingCodeResponse>
  } | null>(null)
  const [pairingCode, setPairingCode] = useState<CreatePairingCodeResponse | null>(null)
  const [pairedDeviceName, setPairedDeviceName] = useState<string | null>(null)
  const [isCreatingPairingCode, setIsCreatingPairingCode] = useState(true)
  const [pairPollEpoch, setPairPollEpoch] = useState(0)

  useEffect(() => {
    if (!runtimeSettingsQuery.isSuccess) {
      return
    }

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
  }, [mutateAsync, pairingEndpoint, runtimeSettingsQuery.isSuccess])

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
  const finishEnabled = pairedDeviceName !== null
  const listeningLabel = pairingCode?.endpoint ?? "Waiting for endpoint…"

  if (runtimeSettingsQuery.isPending) {
    return (
      <div className="mx-auto w-full max-w-200 rounded-lg border border-line bg-panel p-7">
        <h2 className="m-0 text-lg font-semibold">Pair a device</h2>
        <p className="m-0 mt-1.5 text-base text-muted" role="status">
          Loading pairing settings…
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-200 rounded-lg border border-line bg-panel p-7 max-[640px]:px-4 max-[640px]:py-5">
      <div className="mb-6.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="grid size-10 place-items-center rounded-lg border border-line bg-panel-2 text-body">
            <Smartphone aria-hidden className="size-5" />
          </span>
          <div>
            <h2 className="m-0 text-lg font-semibold">Pair a device</h2>
            <p className="m-0 mt-1.5 text-base text-muted">
              Enter the code in a trusted client, or scan the QR.
            </p>
          </div>
        </div>
      </div>

      <div className="grid items-center gap-7 md:grid-cols-[205px_1fr] max-[640px]:justify-items-center">
        <div className="relative grid size-51.5 place-items-center rounded-lg bg-white p-3.5">
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
          <p className="m-0 font-mono text-xs tracking-widest text-dim">PAIRING CODE</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              role="status"
              aria-label="Pairing code"
              className="font-mono text-2xl font-semibold tracking-widest text-body"
            >
              {codeLabel}
            </span>
            <CopyButton value={pairingCode?.code ?? ""} disabled={pairingCode === null} />
          </div>
          <p className="mt-3 text-base leading-normal text-muted">
            <strong className="text-body">{expiresLabel}</strong>
          </p>
          <p className="mt-2 text-base text-body-soft">
            Target: <code className="font-mono text-xs text-lime">{listeningLabel}</code>
          </p>
          <p className="mt-1 text-xs text-muted">
            {cloudProxyOn ? (
              <Link to="/settings" className="text-lime hover:underline">
                Change in Settings
              </Link>
            ) : (
              <Link to="/settings" className="text-lime hover:underline">
                Configure cloud proxy in Settings
              </Link>
            )}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 rounded-lg border border-line-soft bg-panel-2 px-3.5 py-3">
        <div className="flex-1">
          <strong className="block text-base text-body">
            {pairedDeviceName === null ? "Waiting for a device…" : `${pairedDeviceName} paired`}
          </strong>
          <small className="mt-1 block truncate font-mono text-xs text-dim">{listeningLabel}</small>
        </div>
        <Button variant="text" disabled={isCreatingPairingCode} onClick={handleRegenerate}>
          Regenerate
        </Button>
      </div>

      {isError ? (
        <div
          className="mt-4 rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-3 text-base text-danger"
          role="alert"
        >
          Could not create a pairing code.
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between border-t border-line-soft pt-4.5">
        <span />
        <Button disabled={!finishEnabled} onClick={() => void navigate("/devices")}>
          View paired devices <ArrowRight aria-hidden className="size-4" />
        </Button>
      </div>
    </div>
  )
}
