import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore"
import { auth, db } from "./firebase"

export const FEATURE_LIMIT = 3
export const FULL_ACCESS_EMAILS = new Set(["oarsilva6@gmail.com", "leocarrilhom@gmail.com", "samuel.vieirafreitas@outlook.com"])
const COUNTERS = { diagnosis: "diagnosisUses", monitoring: "monitoringUses", reconstruction3d: "reconstruction3dUses" }

export class FeatureLimitError extends Error {
  constructor(feature) {
    super("Você já utilizou as três análises disponíveis para este recurso.")
    this.name = "FeatureLimitError"
    this.code = "feature-limit-reached"
    this.feature = feature
  }
}

export function hasFullFeatureAccess(user = auth.currentUser) {
  return FULL_ACCESS_EMAILS.has(String(user?.email || "").trim().toLowerCase())
}

function user() {
  if (!auth.currentUser?.uid) throw new Error("Entre novamente na sua conta para continuar.")
  return auth.currentUser
}

function result(feature, used, fullAccess = false) {
  return { feature, fullAccess, used: fullAccess ? 0 : used, remaining: fullAccess ? null : Math.max(0, FEATURE_LIMIT - used) }
}

export async function getFeatureAccess(feature) {
  const counter = COUNTERS[feature]
  if (!counter) throw new Error("Recurso de acesso desconhecido.")
  const currentUser = user()
  if (hasFullFeatureAccess(currentUser)) return result(feature, 0, true)
  const snapshot = await getDoc(doc(db, "featureUsage", currentUser.uid))
  return result(feature, Math.max(0, Number(snapshot.data()?.[counter]) || 0))
}

export async function consumeFeatureUse(feature) {
  const counter = COUNTERS[feature]
  if (!counter) throw new Error("Recurso de acesso desconhecido.")
  const currentUser = user()
  if (hasFullFeatureAccess(currentUser)) return result(feature, 0, true)
  const reference = doc(db, "featureUsage", currentUser.uid)
  const used = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference)
    const current = Math.max(0, Number(snapshot.data()?.[counter]) || 0)
    if (current >= FEATURE_LIMIT) throw new FeatureLimitError(feature)
    transaction.set(reference, { [counter]: current + 1, updatedAt: serverTimestamp() }, { merge: true })
    return current + 1
  })
  return result(feature, used)
}
