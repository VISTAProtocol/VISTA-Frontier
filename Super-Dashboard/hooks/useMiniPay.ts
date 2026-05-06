"use client"

import { useEffect, useState } from "react"

export function useMiniPay() {
  const [isMiniPay, setIsMiniPay] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsMiniPay(!!(window.ethereum as any)?.isMiniPay)
    }
  }, [])

  return { isMiniPay }
}
