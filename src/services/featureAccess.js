import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore"
import { auth, db } from "./firebase"

export const FEATURE_LIMIT = 3
export const FEATURE_TIME_ZONE = "America/Sao_Paulo"

const FULL_ACCESS_EMAILS = new Set([
  "oarsilva6@gmail.com",
  "leocarrilhom@gmail.com",
  "samuel.vieirafreitas@outlook.com",
  "zenith.agroia@gmail.com"
])

const COUNTERS = {
  diagnosis: "diagnosisUses",
  monitoring: "monitoringUses",
  reconstruction3d: "reconstruction3dUses"
}

export class FeatureLimitError extends Error {
  constructor(feature) {
    super("Você já utilizou as três análises disponíveis hoje para este recurso.")
    this.name = "FeatureLimitError"
    this.code = "feature-limit-reached"
    this.feature = feature
  }
}

export function getFeatureDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FEATURE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function requireFeature(feature) {
  const counter = COUNTERS[feature]
  if (!counter) throw new Error("Recurso de acesso desconhecido.")
  return counter
}

function requireUser() {
  const user = auth.currentUser
  if (!user?.uid) throw new Error("Entre novamente na sua conta para continuar.")
  return user
}

function hasFullAccess(user) {
  return FULL_ACCESS_EMAILS.has(String(user.email || "").trim().toLowerCase())
}

function accessResult(feature, day, used, fullAccess = false) {
  const count = Math.max(0, Number(used) || 0)
  return {
    feature,
    day,
    fullAccess,
    used: fullAccess ? 0 : count,
    remaining: fullAccess ? null : Math.max(0, FEATURE_LIMIT - count)
  }
}

function usageRef(user, day) {
  return doc(db, "featureUsageDaily", user.uid, "days", day)
}

export async function getFeatureAccess(feature) {
  const counter = requireFeature(feature)
  const user = requireUser()
  const day = getFeatureDay()
  if (hasFullAccess(user)) return accessResult(feature, day, 0, true)

  const snapshot = await getDoc(usageRef(user, day))
  return accessResult(feature, day, snapshot.exists() ? snapshot.data()?.[counter] : 0)
}

export async function consumeFeatureUse(feature) {
  const counter = requireFeature(feature)
  const user = requireUser()
  const day = getFeatureDay()
  if (hasFullAccess(user)) return accessResult(feature, day, 0, true)

  const used = await runTransaction(db, async (transaction) => {
    const reference = usageRef(user, day)
    const snapshot = await transaction.get(reference)
    const current = Math.max(0, Number(snapshot.data()?.[counter]) || 0)
    if (current >= FEATURE_LIMIT) throw new FeatureLimitError(feature)
    const next = current + 1
    transaction.set(reference, { [counter]: next, updatedAt: serverTimestamp() }, { merge: true })
    return next
  })

  return accessResult(feature, day, used)
}
