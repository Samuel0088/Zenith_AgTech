import React, { useEffect, useRef, useState } from "react";
import { useMonitoramento } from "../hooks/useMonitoramento";
import UploadImage   from "./UploadImage";
import OverlayResult from "./OverlayResult";
import MetricsPanel  from "./MetricsPanel";
import { downloadMonitoringHistoryReport } from "./monitoringReportPdf";
import { interpretar } from "../../utils/Interpretations";
import { useFeatureAccess } from "../../../../hooks/useFeatureAccess";
import styles from "../../../../styles/App/MonitoramentoView.module.css";

const PLANTING_HISTORY_KEY = "plantingAnalysisHistory";

function readPlantingHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(PLANTING_HISTORY_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function toPercentage(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.round(numericValue * 100) : null;
}

/**
 * View principal do módulo de Monitoramento.
 *
 * Responsabilidades:
 *  - Orquestra os estados do hook (loading, error, result, preview)
 *  - Delega renderização para subcomponentes especializados
 *  - NÃO contém lógica de negócio — apenas composição de UI
 *
 * Layout:
 *  [Cabeçalho]
 *  [Upload]
 *  [Loading | Error]
 *  [AlertBanner]  ← primeira coisa que o agricultor lê
 *  [Imagens | Métricas]  ← grid responsivo
 *  [Botão: Nova análise]
 */
export default function MonitoramentoView() {
  const featureAccess = useFeatureAccess("monitoring");
  const { analisar, resetar, result, loading, error, preview } = useMonitoramento(featureAccess.consume);
  const [history, setHistory] = useState(readPlantingHistory);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const savedResultRef = useRef(null);
  const feedbackRef = useRef(null);
  // Interpretação agronômica só calculada quando há resultado
  const interpretacao = result ? interpretar(result) : null;

  const mostrarResultados = result && !loading && !error;
  const latestAnalysis = history[0] || null;
  const currentRowsDetected = Boolean(result?.rows?.detected || result?.alignment?.aligned);
  const rowsDetected = result ? currentRowsDetected : Boolean(latestAnalysis?.rowsDetected);
  const currentAlignmentScore = Number.isFinite(Number(result?.alignment?.score))
    ? Math.round(Number(result.alignment.score) * 100)
    : null;
  const alignmentScore = result ? currentAlignmentScore : latestAnalysis?.alignment ?? null;
  const hasSavedAnalysis = Boolean(result || latestAnalysis);
  const alignmentLabel = loading
    ? "Detectando fileiras"
    : hasSavedAnalysis
      ? rowsDetected ? "Fileiras detectadas" : "Fileiras não identificadas"
      : "Aguardando imagem";
  const alignmentIcon = loading
    ? "progress_activity"
    : !hasSavedAnalysis
      ? "image_search"
      : !rowsDetected
        ? "search_off"
      : rowsDetected && alignmentScore >= 75 ? "check" : "priority_high";
  const alignmentHint = !hasSavedAnalysis
    ? "aguardando imagem"
    : alignmentScore == null
      ? "não calculado"
      : result ? "de alinhamento" : "última análise";

  useEffect(() => {
    if (!mostrarResultados || savedResultRef.current === result) return;

    savedResultRef.current = result;
    const historyItem = {
      id: Date.now(),
      date: new Date().toLocaleString("pt-BR"),
      coverage: toPercentage(result?.coverage ?? result?.density),
      uniformity: toPercentage(result?.uniformity),
      alignment: alignmentScore,
      failureLevel: result?.failure_level ?? result?.failures ?? "BAIXO",
      rowsDetected,
    };

    setHistory((currentHistory) => {
      const updatedHistory = [historyItem, ...currentHistory];
      try {
        localStorage.setItem(PLANTING_HISTORY_KEY, JSON.stringify(updatedHistory));
      } catch {
        // O histórico permanece disponível durante a sessão se o armazenamento falhar.
      }
      return updatedHistory;
    });
  }, [alignmentScore, mostrarResultados, result, rowsDetected]);

  useEffect(() => {
    if (!error && !mostrarResultados) return;

    const scrollTimer = window.setTimeout(() => {
      feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);

    return () => window.clearTimeout(scrollTimer);
  }, [error, mostrarResultados]);

  const deleteHistoryItem = (id) => {
    setHistory((currentHistory) => {
      const updatedHistory = currentHistory.filter((item) => item.id !== id);
      try {
        localStorage.setItem(PLANTING_HISTORY_KEY, JSON.stringify(updatedHistory));
      } catch {
        // Mantém a remoção apenas no estado atual quando necessário.
      }
      return updatedHistory;
    });
  };

  const visibleHistory = showAllHistory ? history : history.slice(0, 5);

  const exportHistory = async () => {
    const validAlignments = history
      .map((item) => Number(item.alignment))
      .filter(Number.isFinite);
    const averageAlignment = validAlignments.length > 0
      ? Math.round(validAlignments.reduce((total, value) => total + value, 0) / validAlignments.length)
      : null;
    const items = history.map((item) => ({
      date: item.date || "-",
      coverage: item.coverage,
      uniformity: item.uniformity,
      alignment: item.alignment,
      rowsDetected: Boolean(item.rowsDetected),
      status: getHistoryStatus(item).label,
    }));

    try {
      await downloadMonitoringHistoryReport({
        items,
        totalAnalyses: history.length,
        averageAlignment,
      });
    } catch (reportError) {
      console.error("Não foi possível gerar o relatório de monitoramento.", reportError);
      window.alert("Não foi possível gerar o relatório agora. Tente novamente.");
    }
  };

  const getHistoryStatus = (item) => {
    if (item.failureLevel === "ALTO") return { label: "Crítico", className: styles.plantingHistoryStatusCritical };
    if (["MÉDIO", "MEDIO"].includes(item.failureLevel)) return { label: "Atenção", className: styles.plantingHistoryStatusWarning };
    return { label: "Saudável", className: styles.plantingHistoryStatusHealthy };
  };

  return (
    <div
      className={`${styles.container} ${!mostrarResultados ? styles.containerUpload : ""}`}
      data-page-gutter="planting"
    >
      <section className={styles.hero}>
        <div className={styles.cabecalho}>
          <h2 className={styles.titulo}>Alinhamento da Plantação</h2>
          <p className={styles.subtitulo}>
            Analise o alinhamento e a uniformidade das fileiras
          </p>
          <p className={styles.usageLimit} aria-live="polite">
            {featureAccess.loading
              ? "Verificando o limite de análises..."
              : featureAccess.fullAccess
                ? "Acesso ilimitado para demonstração."
                : `Limite de demonstração: você utilizou ${featureAccess.used} de 3 análises. Restam ${featureAccess.remaining}.`}
          </p>
        </div>

        <section
          className={`${styles.alignmentCard} ${loading ? styles.alignmentCard_loading : ""}`}
          aria-live="polite"
          aria-busy={loading}
        >
          <div className={styles.alignmentGuide} aria-hidden="true">
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index}></span>
            ))}
            <i className="material-symbols-outlined">{rowsDetected ? "check" : "eco"}</i>
          </div>
          <div className={styles.alignmentState}>
            <span className="material-symbols-outlined" aria-hidden="true">psychiatry</span>
            {alignmentLabel}
          </div>
          <div className={styles.alignmentResult}>
            <div>
              <strong>{loading ? "..." : alignmentScore == null ? "—" : `${alignmentScore}%`}</strong>
              <small>{loading ? "analisando imagem" : alignmentHint}</small>
            </div>
            {result && !rowsDetected && !loading ? (
              <button
                type="button"
                className={styles.alignmentRetry}
                onClick={resetar}
                aria-label="Enviar outra imagem"
              >
                <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
              </button>
            ) : (
              <span className="material-symbols-outlined" aria-hidden="true">{alignmentIcon}</span>
            )}
          </div>
        </section>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Upload — sempre visível                                             */}
      {/* ------------------------------------------------------------------ */}
      {!mostrarResultados && (
        <UploadImage
          onSelect={analisar}
          disabled={loading}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Erro                                                                */}
      {/* ------------------------------------------------------------------ */}
      {error && !loading && (
        <div ref={feedbackRef} className={styles.erroContainer} role="alert">
          <span className={styles.erroIcone} aria-hidden="true">⚠️</span>
          <div className={styles.erroTextos}>
            <p className={styles.erroTitulo}>Não foi possível analisar</p>
            <p className={styles.erroMensagem}>{error}</p>
          </div>
          <button
            className={styles.botaoTentar}
            onClick={resetar}
            aria-label="Limpar erro e tentar novamente"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Resultados                                                          */}
      {/* ------------------------------------------------------------------ */}
      {mostrarResultados && interpretacao && (
        <div ref={feedbackRef} className={styles.resultados}>

          {/* Grid: imagens + métricas */}
          <div className={styles.resultadosGrid}>
            <div className={styles.colunaImagem}>
              <OverlayResult originalSrc={preview} result={result} />
            </div>
            <div className={styles.colunaMetricas}>
              <MetricsPanel result={result} insights={interpretacao.insights} />
            </div>
          </div>

          {/* Ação secundária */}
          <button
            className={styles.botaoNova}
            onClick={resetar}
          >
            Analisar nova imagem
          </button>
        </div>
      )}

      {!mostrarResultados && (
        <aside className={styles.tipCard}>
          <span className="material-symbols-outlined" aria-hidden="true">lightbulb</span>
          <div>
            <strong>Dica</strong>
            <p>Use uma imagem do drone capturada de cima, com boa iluminação e toda a área das fileiras visível.</p>
          </div>
          <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
        </aside>
      )}

      <section
        className={`${styles.plantingHistorySection} ${history.length === 0 ? styles.plantingHistorySectionEmpty : ""}`}
        aria-labelledby="planting-history-title"
      >
        <div className={styles.plantingHistoryHeader}>
          <div>
            <span className="material-symbols-outlined" aria-hidden="true">history</span>
            <h3 id="planting-history-title">Histórico de análises</h3>
          </div>
          <div className={styles.plantingHistorySummary}>
            <span>{history.length} {history.length === 1 ? "resultado" : "resultados"}</span>
            {history.length > 0 && (
              <button type="button" onClick={exportHistory} aria-label="Baixar histórico completo em PDF">
                <span className="material-symbols-outlined" aria-hidden="true">download</span>
              </button>
            )}
          </div>
        </div>

        {history.length === 0 ? (
          <div className={styles.plantingHistoryEmpty}>
            <span className="material-symbols-outlined" aria-hidden="true">image_search</span>
            <div>
              <strong>Nenhuma análise realizada</strong>
              <p>Os resultados das imagens enviadas aparecerão aqui.</p>
            </div>
          </div>
        ) : (
          <div className={styles.plantingHistoryList}>
            {visibleHistory.map((item) => {
              const status = getHistoryStatus(item);
              return (
                <article className={styles.plantingHistoryCard} key={item.id}>
                  <div className={styles.plantingHistoryCardTop}>
                    <span className={styles.plantingHistoryIcon} aria-hidden="true">
                      <span className="material-symbols-outlined">psychiatry</span>
                    </span>
                    <div className={styles.plantingHistoryInfo}>
                      <div>
                        <strong>{item.rowsDetected ? "Fileiras analisadas" : "Talhão analisado"}</strong>
                        <span className={`${styles.plantingHistoryStatus} ${status.className}`}>{status.label}</span>
                      </div>
                      <small>
                        <span className="material-symbols-outlined" aria-hidden="true">schedule</span>
                        {item.date}
                      </small>
                    </div>
                    <button
                      type="button"
                      className={styles.plantingHistoryDelete}
                      onClick={() => deleteHistoryItem(item.id)}
                      aria-label="Excluir análise"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                    </button>
                  </div>

                  <div className={styles.plantingHistoryMetrics}>
                    <span><small>Cobertura</small><strong>{item.coverage == null ? "—" : `${item.coverage}%`}</strong></span>
                    <span><small>Uniformidade</small><strong>{item.uniformity == null ? "—" : `${item.uniformity}%`}</strong></span>
                    <span><small>Alinhamento</small><strong>{item.alignment == null ? "—" : `${item.alignment}%`}</strong></span>
                  </div>
                </article>
              );
            })}

            {history.length > 5 && (
              <button
                type="button"
                className={styles.plantingHistoryMore}
                onClick={() => setShowAllHistory((current) => !current)}
              >
                {showAllHistory ? "Mostrar menos" : "Ver todos"}
                <span className="material-symbols-outlined" aria-hidden="true">
                  {showAllHistory ? "expand_less" : "expand_more"}
                </span>
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
