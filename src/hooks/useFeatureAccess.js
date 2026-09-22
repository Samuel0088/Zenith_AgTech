import { useCallback, useEffect, useRef, useState } from "react"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "../services/firebase"
import { consumeFeatureUse, FeatureLimitError, getFeatureAccess, getFeatureDay } from "../services/featureAccess"

export function useFeatureAccess(feature) {
  const [access, setAccess] = useState({ loading: true, fullAccess: false, used: 0, remaining: 0, error: "" })
  const claimingRef = useRef(false)

  const refresh = useCallback(async () => {
    setAccess((current) => ({ ...current, loading: true, error: "" }))
    try {
      const next = await getFeatureAccess(feature)
      setAccess({ ...next, loading: false, error: "" })
      return next
    } catch (error) {
      setAccess((current) => ({ ...current, loading: false, remaining: 0, error: error?.message || "Não foi possível verificar o acesso agora." }))
      return null
    }
  }, [feature])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) refresh()
      else setAccess({ loading: false, fullAccess: false, used: 0, remaining: 0, error: "Entre novamente na sua conta para continuar." })
    })
    const checkDay = () => {
      if (auth.currentUser && access.day !== getFeatureDay()) refresh()
    }
    const timer = window.setInterval(checkDay, 60_000)
    window.addEventListener("focus", checkDay)
    return () => {
      unsubscribe()
      window.clearInterval(timer)
      window.removeEventListener("focus", checkDay)
    }
  }, [access.day, refresh])

  const consume = useCallback(async () => {
    if (claimingRef.current) return { allowed: false, pending: true }
    claimingRef.current = true
    try {
      const next = await consumeFeatureUse(feature)
      setAccess({ ...next, loading: false, error: "" })
      return { allowed: true, access: next }
    } catch (error) {
      if (error instanceof FeatureLimitError || error?.code === "feature-limit-reached") {
        setAccess((current) => ({ ...current, loading: false, day: getFeatureDay(), used: 3, remaining: 0, error: "" }))
        return { allowed: false, limitReached: true }
      }
      setAccess((current) => ({ ...current, loading: false, remaining: 0, error: error?.message || "Não foi possível verificar o acesso agora." }))
      return { allowed: false, error }
    } finally {
      claimingRef.current = false
    }
  }, [feature])

  return { ...access, consume, refresh }
}
