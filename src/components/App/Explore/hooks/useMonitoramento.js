import { useState, useCallback, useEffect, useRef } from "react";
import { analisarImagem, validarArquivo } from "../../../../services/Monitoramentoservice";
/**
 * Hook de monitoramento de plantação.
 *
 * Correções em relação ao v1:
 *  - Memory leak corrigido: revoga URL de objeto ao trocar imagem ou desmontar
 *  - Validação client-side antes do fetch
 *  - Estado `preview` separado do estado `result`
 *  - `resetar()` permite começar nova análise sem recarregar a tela
 *  - `useCallback` evita recriação desnecessária das funções
 */
export function useMonitoramento() {
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [preview, setPreview] = useState(null);

  // Ref para gerenciar o ciclo de vida da URL de preview (evita leak)
  const previewUrlRef = useRef(null);

  // Revoga a URL ao desmontar o componente pai
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const analisar = useCallback(async (file) => {
    if (!file) return;

    // Validação antes de qualquer requisição
    const erroValidacao = validarArquivo(file);
    if (erroValidacao) {
      setError(erroValidacao);
      return;
    }

    // Revoga URL anterior para liberar memória
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const novaPreview = URL.createObjectURL(file);
    previewUrlRef.current = novaPreview;

    setPreview(novaPreview);
    setResult(null);
    setError(null);
    setLoading(true);

    try {
      const data = await analisarImagem(file);
      setResult(data);
    } catch (err) {
      setError(err.message || "Erro desconhecido ao analisar imagem.");
    } finally {
      setLoading(false);
    }
  }, []);

  const resetar = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setResult(null);
    setError(null);
    setPreview(null);
    setLoading(false);
  }, []);

  return { analisar, resetar, result, loading, error, preview };
}
