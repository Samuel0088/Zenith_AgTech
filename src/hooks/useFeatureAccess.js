import { useCallback, useEffect, useRef, useState } from "react"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "../services/firebase"
import { consumeFeatureUse, FeatureLimitError, getFeatureAccess } from "../services/featureAccess"

export function useFeatureAccess(feature) {
  const [access, setAccess] = useState({ loading: true, fullAccess: false, used: 0, remaining: 0, error: "" })
  const pending = useRef(false)
  const refresh = useCallback(async () => { try { const next = await getFeatureAccess(feature); setAccess({ ...next, loading: false, error: "" }); return next } catch (error) { setAccess({ loading: false, fullAccess: false, used: 0, remaining: 0, error: error.message }); return null } }, [feature])
  useEffect(() => onAuthStateChanged(auth, (currentUser) => { if (currentUser) refresh(); else setAccess({ loading: false, fullAccess: false, used: 0, remaining: 0, error: "Entre novamente na sua conta para continuar." }) }), [refresh])
  const consume = useCallback(async () => { if (pending.current) return { allowed: false, pending: true }; pending.current = true; try { const next = await consumeFeatureUse(feature); setAccess({ ...next, loading: false, error: "" }); return { allowed: true, access: next } } catch (error) { if (error instanceof FeatureLimitError) { setAccess((current) => ({ ...current, used: 3, remaining: 0 })); return { allowed: false, limitReached: true } } return { allowed: false, error } } finally { pending.current = false } }, [feature])
  return { ...access, consume, refresh }
}
