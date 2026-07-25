import { atom, useSetAtom } from "jotai"
import React, { useEffect } from "react"

export const nowAtom = atom(Date.now())

export const NowTicker: React.FC = () => {
  const setNow = useSetAtom(nowAtom)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [setNow])

  return null
}
