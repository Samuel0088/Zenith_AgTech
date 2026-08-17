import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  const missingVars = [
    !supabaseUrl && "VITE_SUPABASE_URL",
    !supabaseAnonKey && "VITE_SUPABASE_ANON_KEY ou VITE_SUPABASE_PUBLISHABLE_KEY",
  ].filter(Boolean)

  console.warn(
    `Supabase nao configurado. Variaveis ausentes: ${missingVars.join(", ")}`
  )
}

export const supabase = createClient(
  supabaseUrl || "https://rhwtwnzowqldxorxrviy.supabase.co",
  supabaseAnonKey || "sb_publishable_latImARMdifkNQQbBaXuJA_2oSYRUab"
)

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase ainda nao foi configurado no .env.")
  }
}

function logSupabaseError(operation, error, context = {}) {
  console.error(`[Supabase] Erro em ${operation}`, {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    status: error?.status,
    context,
    error,
  })
}

function throwIfSupabaseError(operation, error, context = {}) {
  if (!error) return
  logSupabaseError(operation, error, context)
  throw error
}

function withoutUndefined(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  )
}

function appTypeToDbType(type) {
  if (!type) return undefined
  return type === "PJ" || type === "juridica" ? "juridica" : "fisica"
}

function dbTypeToAppType(type) {
  if (!type) return ""
  return type === "juridica" ? "PJ" : "CPF"
}

function ageToBirthDate(age) {
  const numericAge = Number(age)
  if (!Number.isFinite(numericAge) || numericAge <= 0) return undefined

  const date = new Date()
  date.setFullYear(date.getFullYear() - numericAge)
  return date.toISOString().slice(0, 10)
}

function birthDateToAge(dateValue) {
  if (!dateValue) return ""

  const birthDate = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(birthDate.getTime())) return ""

  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }

  return age
}

function normalizeProfile(row) {
  if (!row) return null

  return {
    id: row.id,
    name: row.nome_completo || "",
    age: birthDateToAge(row.data_nascimento),
    type: dbTypeToAppType(row.tipo_pessoa),
    document: row.documento || "",
    hectares: "",
    email: row.email || "",
    profileIcon: "",
    phone: "",
    city: "",
    state: "",
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  }
}

function toProfileRow(profile) {
  return withoutUndefined({
    nome_completo: profile.name,
    data_nascimento: profile.data_nascimento || ageToBirthDate(profile.age),
    email: profile.email,
    tipo_pessoa: appTypeToDbType(profile.type),
    documento: profile.document,
  })
}

function normalizeFarm(row) {
  if (!row) return null

  return {
    id: row.id,
    ownerId: row.agricultor_id,
    ownerName: "",
    name: row.nome_fazenda || "",
    tipo_proprietario: dbTypeToAppType(row.tipo_pessoa),
    data_aquisicao: "",
    cep: row.cep || "",
    bairro: row.bairro || "",
    municipio: row.municipio || "",
    uf: row.unidade_federativa || "",
    area_total: row.area_total_plantacao,
    telefone: row.telefone || "",
    plantacao: row.principal_plantacao || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  }
}

function toFarmRow(farm) {
  const plantacao = Array.isArray(farm.plantacao)
    ? farm.plantacao.join(", ")
    : farm.plantacao

  return withoutUndefined({
    agricultor_id: farm.ownerId,
    nome_fazenda: farm.name,
    tipo_pessoa: appTypeToDbType(farm.tipo_proprietario),
    documento: farm.documento,
    cep: farm.cep,
    unidade_federativa: farm.uf,
    bairro: farm.bairro,
    municipio: farm.municipio,
    area_total_plantacao: farm.area_total === "" ? undefined : Number(farm.area_total),
    telefone: farm.telefone,
    principal_plantacao: plantacao,
  })
}

export async function getCurrentUser() {
  if (!isSupabaseConfigured) return null

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      logSupabaseError("auth.getSession", sessionError)
      return null
    }

    if (!sessionData.session) {
      return null
    }

    const { data, error } = await supabase.auth.getUser()
    if (error) {
      logSupabaseError("auth.getUser", error)
      return null
    }
    return data.user
  } catch (error) {
    logSupabaseError("auth.getUser", error)
    return null
  }
}

export function onAuthStateChanged(callback) {
  let active = true
  let lastUserId = Symbol("initial-auth-state")

  const emitUser = (user) => {
    if (!active) return

    const nextUserId = user?.id ?? null
    if (nextUserId === lastUserId) return

    lastUserId = nextUserId
    callback(user)
  }

  getCurrentUser().then((user) => {
    emitUser(user)
  })

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    emitUser(session?.user ?? null)
  })

  return () => {
    active = false
    data.subscription.unsubscribe()
  }
}

export async function signOut() {
  assertSupabaseConfigured()

  try {
    const { error } = await supabase.auth.signOut()
    throwIfSupabaseError("auth.signOut", error)
  } catch (error) {
    logSupabaseError("auth.signOut", error)
    throw error
  }
}

export async function signInWithEmail(email, password) {
  assertSupabaseConfigured()

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    throwIfSupabaseError("auth.signInWithPassword", error, { email })
    return data
  } catch (error) {
    logSupabaseError("auth.signInWithPassword", error, { email })
    throw error
  }
}

export async function signUpWithEmail(email, password, metadata = {}) {
  assertSupabaseConfigured()

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    })
    throwIfSupabaseError("auth.signUp", error, { email, metadata })

    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      const existingUserError = new Error(
        "Este email ja possui uma conta. Faca login ou use recuperacao de senha."
      )
      existingUserError.code = "auth/email-already-in-use"
      throw existingUserError
    }

    if (!data.session) {
      console.warn(
        "Cadastro criado sem sessao ativa. Se o insert em agricultores falhar por RLS, desative a confirmacao de email no Supabase durante o desenvolvimento ou aplique as policies anon."
      )
    }

    return data
  } catch (error) {
    logSupabaseError("auth.signUp", error, { email, metadata })
    throw error
  }
}

export async function signUpAndCreateProfile({ email, password, profile }) {
  assertSupabaseConfigured()

  try {
    const signUpData = await signUpWithEmail(email, password, {
      name: profile.name,
    })
    const user = signUpData?.session?.user || signUpData?.user

    if (!user?.id) {
      throw new Error("O Supabase nao retornou o ID do usuario criado.")
    }

    const createdProfile = await upsertProfile(user.id, {
      ...profile,
      email,
    })

    return {
      user,
      profile: createdProfile,
      session: signUpData.session,
    }
  } catch (error) {
    logSupabaseError("auth.signUpAndCreateProfile", error, {
      email,
      profile,
    })

    try {
      await supabase.auth.signOut()
    } catch (signOutError) {
      logSupabaseError("auth.signUpAndCreateProfile.signOutRollback", signOutError, {
        email,
      })
    }

    throw error
  }
}

export async function signInWithOAuth(provider) {
  assertSupabaseConfigured()

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/home`,
        scopes: provider === "azure" ? "email profile" : undefined,
      },
    })
    throwIfSupabaseError("auth.signInWithOAuth", error, { provider })
    return data
  } catch (error) {
    logSupabaseError("auth.signInWithOAuth", error, { provider })
    throw error
  }
}

export async function resetPasswordForEmail(email) {
  assertSupabaseConfigured()

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    throwIfSupabaseError("auth.resetPasswordForEmail", error, { email })
  } catch (error) {
    logSupabaseError("auth.resetPasswordForEmail", error, { email })
    throw error
  }
}

export async function getProfile(userId) {
  assertSupabaseConfigured()

  try {
    const { data, error } = await supabase
      .from("agricultores")
      .select("*")
      .eq("id", userId)
      .maybeSingle()

    throwIfSupabaseError("agricultores.select", error, { userId })
    return normalizeProfile(data)
  } catch (error) {
    logSupabaseError("agricultores.select", error, { userId })
    throw error
  }
}

export async function upsertProfile(userId, profile) {
  assertSupabaseConfigured()
  const profileRow = toProfileRow(profile)

  try {
    const { data, error } = await supabase
      .from("agricultores")
      .upsert({
        id: userId,
        ...profileRow,
      })
      .select("*")
      .single()

    throwIfSupabaseError("agricultores.upsert", error, { userId, profileRow })
    return normalizeProfile(data)
  } catch (error) {
    logSupabaseError("agricultores.upsert", error, { userId, profileRow })
    throw error
  }
}

export async function updateProfile(userId, profile) {
  assertSupabaseConfigured()
  const profileRow = toProfileRow(profile)

  if (Object.keys(profileRow).length === 0) {
    return getProfile(userId)
  }

  try {
    const { data, error } = await supabase
      .from("agricultores")
      .update(profileRow)
      .eq("id", userId)
      .select("*")
      .single()

    throwIfSupabaseError("agricultores.update", error, { userId, profileRow })
    return normalizeProfile(data)
  } catch (error) {
    logSupabaseError("agricultores.update", error, { userId, profileRow })
    throw error
  }
}

export async function getUserFarm(userId) {
  assertSupabaseConfigured()

  try {
    const { data, error } = await supabase
      .from("fazendas")
      .select("*")
      .eq("agricultor_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    throwIfSupabaseError("fazendas.select", error, { userId })
    return normalizeFarm(data)
  } catch (error) {
    logSupabaseError("fazendas.select", error, { userId })
    throw error
  }
}

export async function createFarm(farm) {
  assertSupabaseConfigured()
  const farmRow = toFarmRow(farm)

  try {
    const { data, error } = await supabase
      .from("fazendas")
      .insert(farmRow)
      .select("*")
      .single()

    throwIfSupabaseError("fazendas.insert", error, { farmRow })
    return normalizeFarm(data)
  } catch (error) {
    logSupabaseError("fazendas.insert", error, { farmRow })
    throw error
  }
}

export async function updateFarm(farmId, farm) {
  assertSupabaseConfigured()
  const farmRow = toFarmRow(farm)

  try {
    const { data, error } = await supabase
      .from("fazendas")
      .update(farmRow)
      .eq("id", farmId)
      .select("*")
      .single()

    throwIfSupabaseError("fazendas.update", error, { farmId, farmRow })
    return normalizeFarm(data)
  } catch (error) {
    logSupabaseError("fazendas.update", error, { farmId, farmRow })
    throw error
  }
}
