import { getProfile, supabase } from "./supabase"

export const ACCOUNT_ROLES = {
  ADMIN: "admin",
  EMPLOYEE: "employee",
  COLLABORATOR: "collaborator",
}

export function normalizeRole(role) {
  if (role === ACCOUNT_ROLES.EMPLOYEE) return ACCOUNT_ROLES.EMPLOYEE
  if (role === ACCOUNT_ROLES.COLLABORATOR) return ACCOUNT_ROLES.COLLABORATOR
  return ACCOUNT_ROLES.ADMIN
}

export function isOperationalRole(role) {
  const normalizedRole = normalizeRole(role)
  return normalizedRole === ACCOUNT_ROLES.EMPLOYEE || normalizedRole === ACCOUNT_ROLES.COLLABORATOR
}

export function getRoleHomePath(role) {
  return isOperationalRole(role)
    ? "/funcionarios"
    : "/home"
}

export async function getUserAccessProfile(uid) {
  if (!uid) return null

  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", uid)
      .maybeSingle()

    if (!error && data) {
      return {
        id: data.id,
        ...data,
        role: normalizeRole(data.role),
      }
    }
  } catch (error) {
    console.error("[Supabase] Erro ao consultar perfil de acesso:", error)
  }

  try {
    const profile = await getProfile(uid)
    if (!profile) return null

    return {
      ...profile,
      role: normalizeRole(profile.role),
    }
  } catch (error) {
    console.error("[Supabase] Erro ao consultar agricultor para acesso:", error)
    return null
  }
}
