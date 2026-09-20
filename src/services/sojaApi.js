const DEFAULT_API_BASE_URL = "https://tccamsamericana-api-doencas-soja.hf.space"
const REQUEST_TIMEOUT_MS = 300_000

function normalizeApiBaseUrl(value) {
  return String(value || DEFAULT_API_BASE_URL)
    .trim()
    .replace(/\/(predict\/batch|predict)\/?$/i, "")
    .replace(/\/+$/, "")
}

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_SOJA_API_URL)

function formatApiDetail(detail) {
  if (typeof detail === "string") return detail

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message || String(item))
      .filter(Boolean)
      .join(" ")
  }

  if (detail && typeof detail === "object") {
    return detail.message || detail.msg || JSON.stringify(detail)
  }

  return "A API não conseguiu concluir a análise."
}

async function postImages(path, fieldName, files, signal) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const abortRequest = () => controller.abort()

  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener("abort", abortRequest, { once: true })
  }

  const formData = new FormData()
  files.forEach((entry) => {
    const file = entry?.file instanceof File ? entry.file : entry
    if (!(file instanceof File)) return
    formData.append(fieldName, file, file.name || "imagem-soja.jpg")
  })

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      body: formData,
      signal: controller.signal
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      const error = new Error(formatApiDetail(data?.detail || data?.message))
      error.status = response.status
      error.data = data
      throw error
    }

    return data
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("A análise demorou mais que o esperado. Tente um lote menor ou repita em alguns instantes.")
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
    signal?.removeEventListener("abort", abortRequest)
  }
}

export function diagnosticarLote(files, options = {}) {
  const validFiles = Array.from(files || []).filter((entry) => {
    return entry instanceof File || entry?.file instanceof File
  })

  if (validFiles.length === 0) {
    return Promise.reject(new Error("Selecione pelo menos uma imagem para iniciar a análise."))
  }

  return postImages("/predict/batch", "files", validFiles, options.signal)
}

// Mantido para outras partes do projeto que ainda utilizam o diagnóstico individual.
export function diagnosticarSoja(file, options = {}) {
  if (!(file instanceof File)) {
    return Promise.reject(new Error("Selecione uma imagem válida para iniciar a análise."))
  }

  return postImages("/predict", "file", [file], options.signal)
}

export { API_BASE_URL }
import { auth } from "./firebase"
