/**
 * Camada de serviço para a API de Monitoramento.
 *
 * Responsabilidades:
 *  - Fazer a requisição com timeout via AbortController
 *  - Normalizar a resposta (compatível com API v1 e v2)
 *  - Validar o arquivo antes do envio
 *
 * NÃO contém estado React — apenas funções puras e I/O.
 */

const API_URL =
  "https://tccamsamericana-monitoramento-plantacao.hf.space/analyze";

const TIMEOUT_MS = 40_000; // HF Space cold-start pode ser lento

// ---------------------------------------------------------------------------
// Validação do arquivo (client-side, antes de qualquer fetch)
// ---------------------------------------------------------------------------

const TIPOS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];
const MAX_TAMANHO_MB = 50;

/**
 * Retorna mensagem de erro ou null se o arquivo for válido.
 * @param {File} file
 * @returns {string | null}
 */
export function validarArquivo(file) {
  if (!file) return "Nenhum arquivo selecionado.";

  if (!TIPOS_PERMITIDOS.includes(file.type)) {
    return "Formato não suportado. Use JPG, PNG ou WebP.";
  }

  if (file.size > MAX_TAMANHO_MB * 1024 * 1024) {
    return `Arquivo muito grande. Máximo permitido: ${MAX_TAMANHO_MB} MB.`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Normalização de resposta (compatibilidade v1 ↔ v2)
// ---------------------------------------------------------------------------

/**
 * Normaliza qualquer resposta da API para o formato v2 usado pelo front-end.
 *
 * API v1 retorna: { density, failure_score, failures, uniformity, alignment, overlay_image }
 * API v2 retorna: { coverage, veg_index_mean, failure_score, failure_level, failure_zones,
 *                   uniformity, rows, shadow_coverage, illumination_quality, overlay_image }
 *
 * @param {object} data - JSON bruto da API
 * @returns {object} - Dados normalizados
 */
function normalizarResposta(data) {
  const isV2 = "coverage" in data || "failure_level" in data;

  const limitarProporcao = (valor) => Math.min(1, Math.max(0, Number(valor) || 0));
  const variacao = Number(data.alignment?.variation);
  const scoreAlinhamento = Number.isFinite(variacao)
    ? limitarProporcao(1 - variacao / 30)
    : limitarProporcao(data.rows?.periodicity_snr ?? data.uniformity);

  const imageSrc = `data:image/jpeg;base64,${data.overlay_image}`;
  const debugSrc = data.debug_image
    ? `data:image/jpeg;base64,${data.debug_image}`
    : null;

  if (isV2) {
    return {
      ...data,
      alignment: {
        ...data.alignment,
        score: scoreAlinhamento,
      },
      imageSrc,
      debugSrc,
    };
  }

  // Mapeamento v1 → v2
  const alignmentSNR = data.alignment?.variation
    ? Math.max(0, 1 - data.alignment.variation / 30)
    : 0;

  return {
    coverage: data.density ?? 0,
    veg_index_mean: data.density ?? 0,
    failure_score: data.failure_score ?? 0,
    failure_level: data.failures ?? "BAIXO",
    failure_zones: [],
    uniformity: data.uniformity ?? 0,
    rows: {
      detected: data.alignment?.aligned ?? false,
      orientation_deg: null,
      row_spacing_px: null,
      row_count: null,
      periodicity_snr: alignmentSNR,
    },
    alignment: {
      ...data.alignment,
      score: alignmentSNR,
    },
    shadow_coverage: 0,
    illumination_quality: "good",
    overlay_image: data.overlay_image,
    imageSrc,
    debugSrc,
    _apiVersion: "v1",
  };
}

// ---------------------------------------------------------------------------
// Requisição principal
// ---------------------------------------------------------------------------

/**
 * Envia a imagem para análise e retorna os dados normalizados.
 *
 * @param {File} file
 * @returns {Promise<object>} Dados normalizados
 * @throws {Error} Com mensagem em português para exibição direta ao usuário
 */
export async function analisarImagem(file) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      let detalhe = `Erro do servidor (${response.status})`;
      try {
        const body = await response.json();
        const limitError = body?.detail?.code === "USAGE_LIMIT_REACHED" ? body.detail : body;
        detalhe = limitError?.message || body.detail || detalhe;
      } catch {
        // ignora erro de parse
      }
      throw new Error(detalhe);
    }

    const data = await response.json();
    return normalizarResposta(data);
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(
        "Tempo limite excedido. Verifique sua conexão e tente novamente."
      );
    }
    if (err.message.startsWith("Failed to fetch") || err.message.startsWith("NetworkError")) {
      throw new Error(
        "Sem conexão com o servidor. Verifique sua internet e tente novamente."
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
import { auth } from "./firebase";
