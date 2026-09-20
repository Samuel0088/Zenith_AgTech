import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import CameraView from "./CameraView"
import BatchImagePreview from "./BatchImagePreview"
import BatchDiagnosisResult from "./BatchDiagnosisResult"
import AnalysisLoader from "./AnalysisLoader"
import DiagnosisResult from "./DiagnosisResult"
import AllHistory from "./AllHistory"
import { formatDiagnosisName } from "./diagnosisLabels"
import { diagnosticarLote } from "../../../../services/sojaApi"
import { useLanguage } from "../../../../contexts/LanguageContext"
import { useFeatureAccess } from "../../../../hooks/useFeatureAccess"
import "../../../../styles/App/Diagnostico.css"
import "../../../../styles/App/BatchDiagnosis.css"

const MAX_BATCH_IMAGES = 100
const MAX_FILE_SIZE = 20 * 1024 * 1024
const MAX_BATCH_SIZE = 500 * 1024 * 1024
const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp)$/i
const DASHBOARD_MONTHS = 6
const DASHBOARD_CHART_WIDTH = 600
const DASHBOARD_CHART_BASELINE = 104

const checkIsMobile = () => window.innerWidth < 1025

function getHistoryTimestamp(item) {
  const numericId = Number(item?.id)
  if (Number.isFinite(numericId) && numericId > 1_000_000_000_000) return numericId

  const parts = String(item?.date || "").match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  )
  if (!parts) return null

  const [, day, month, year, hour = "0", minute = "0", second = "0"] = parts
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).getTime()
}

function averageConfidence(items) {
  if (items.length === 0) return 0
  return Math.round(
    items.reduce((total, item) => total + Math.max(0, Math.min(100, Number(item?.confidence) || 0)), 0) /
      items.length
  )
}

function percentageChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

function createSmoothPath(points) {
  if (points.length === 0) return ""

  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index]
    const controlX = (previous.x + point.x) / 2
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`
  }, `M ${points[0].x} ${points[0].y}`)
}

function createDashboardData(history, locale) {
  const now = new Date()
  const months = Array.from({ length: DASHBOARD_MONTHS }, (_, index) => {
    const offset = DASHBOARD_MONTHS - index - 1
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    return {
      start: start.getTime(),
      end: end.getTime(),
      label: new Intl.DateTimeFormat(locale, { month: "short" })
        .format(start)
        .replace(".", "")
    }
  })

  const datedHistory = history.map((item) => ({ item, timestamp: getHistoryTimestamp(item) }))
  const monthlyItems = months.map(({ start, end }) =>
    datedHistory
      .filter(({ timestamp }) => timestamp !== null && timestamp >= start && timestamp < end)
      .map(({ item }) => item)
  )
  const monthlyCounts = monthlyItems.map((items) => items.length)
  const currentItems = monthlyItems.at(-1) || []
  const previousItems = monthlyItems.at(-2) || []
  const currentAverage = averageConfidence(currentItems)
  const previousAverage = averageConfidence(previousItems)
  const maxCount = Math.max(1, ...monthlyCounts)
  const points = monthlyCounts.map((count, index) => ({
    x: 12 + (index * (DASHBOARD_CHART_WIDTH - 24)) / (DASHBOARD_MONTHS - 1),
    y: DASHBOARD_CHART_BASELINE - (count / maxCount) * 74
  }))
  const linePath = createSmoothPath(points)

  return {
    total: history.length,
    average: averageConfidence(history),
    currentCount: currentItems.length,
    countTrend: percentageChange(currentItems.length, previousItems.length),
    confidenceTrend: currentItems.length > 0 && previousItems.length > 0
      ? currentAverage - previousAverage
      : 0,
    monthLabels: months.map(({ label }) => label),
    points,
    linePath,
    areaPath: linePath
      ? `${linePath} L ${points.at(-1).x} ${DASHBOARD_CHART_BASELINE + 8} L ${points[0].x} ${DASHBOARD_CHART_BASELINE + 8} Z`
      : ""
  }
}

function trendIcon(value) {
  if (value > 0) return "trending_up"
  if (value < 0) return "trending_down"
  return "trending_flat"
}

function trendTone(value) {
  if (value > 0) return "positive"
  if (value < 0) return "negative"
  return "neutral"
}

function createImageId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isSupportedImage(file) {
  if (!(file instanceof File)) return false
  return ACCEPTED_MIME_TYPES.has(file.type) || (!file.type && ACCEPTED_EXTENSIONS.test(file.name))
}

function fileIdentity(file) {
  return `${file.name}::${file.size}::${file.lastModified}`
}

export default function DiagnosticoTab() {
  const { locale, t } = useLanguage()
  const videoRef = useRef(null)
  const fileInputRef = useRef(null)
  const selectedImagesRef = useRef([])
  const requestControllerRef = useRef(null)
  const location = useLocation()

  const [step, setStep] = useState("start")
  const [selectedImages, setSelectedImages] = useState([])
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [isMobile, setIsMobile] = useState(checkIsMobile)
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const [selectionNotice, setSelectionNotice] = useState(null)
  const [selectionSource, setSelectionSource] = useState(null)
  const dashboardData = useMemo(() => createDashboardData(history, locale), [history, locale])
  const featureAccess = useFeatureAccess("diagnosis")

  useEffect(() => {
    selectedImagesRef.current = selectedImages
  }, [selectedImages])

  useEffect(() => {
    const handleResize = () => setIsMobile(checkIsMobile())
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    if (location.state?.showHistory) setShowAllHistory(true)
    if (location.state?.showResult && location.state?.diagnosticData) {
      const diagnostic = location.state.diagnosticData
      setResult({
        doenca: formatDiagnosisName(diagnostic.disease),
        confianca: diagnostic.confidence,
        probabilidades: {}
      })
      setStep("result")
    }
  }, [location])

  useEffect(() => {
    try {
      const saved = localStorage.getItem("diagnosticHistory")
      if (saved) setHistory(JSON.parse(saved))
    } catch {
      // O diagnóstico continua funcionando mesmo se o navegador bloquear o armazenamento local.
    }
  }, [])

  useEffect(() => {
    return () => {
      selectedImagesRef.current.forEach((image) => URL.revokeObjectURL(image.preview))
      requestControllerRef.current?.abort()
      videoRef.current?.srcObject?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const persistHistoryItem = (item) => {
    setHistory((currentHistory) => {
      const updated = [item, ...currentHistory].slice(0, 20)
      try {
        localStorage.setItem("diagnosticHistory", JSON.stringify(updated))
      } catch {
        // Mantém o item em memória quando o localStorage não estiver disponível.
      }
      return updated
    })
  }

  const saveBatchToHistory = (data) => {
    const general = data?.resultado_geral
    if (!general) return

    const conditions = general.ocorrencias_confiaveis || []
    let title = t("diagnosis.inconclusiveBatch")

    if (conditions.length > 1) title = t("diagnosis.detectedConditions", { count: conditions.length })
    else if (conditions.length === 1) title = formatDiagnosisName(conditions[0].classe)
    else if (general.condicao_predominante) title = formatDiagnosisName(general.condicao_predominante)

    persistHistoryItem({
      id: Date.now(),
      type: "batch",
      disease: title,
      confidence: Math.max(0, Math.min(100, Math.round(Number(general.confianca_media) || 0))),
      date: new Date().toLocaleString(locale),
      imageCount: Number(general.total_recebidas) || selectedImages.length,
      reliableCount: Number(general.resultados_confiaveis) || 0,
      conditionCount: conditions.length,
      status: general.status
    })
  }

  const stopCamera = () => {
    videoRef.current?.srcObject?.getTracks().forEach((track) => track.stop())
  }

  const startCamera = async () => {
    setSelectionSource((current) => selectedImagesRef.current.length > 0 ? current || "camera" : "camera")
    setSelectionNotice(null)
    setStep("camera")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      })
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch (error) {
      console.error("Câmera:", error)
      setSelectionNotice({
        type: "warning",
        text: t("diagnosis.cameraError")
      })
      if (selectedImagesRef.current.length > 0) {
        setStep("preview")
      } else {
        setSelectionSource(null)
        setStep("start")
      }
    }
  }

  const addSelectedFiles = (fileList) => {
    const incomingFiles = Array.from(fileList || [])
    if (incomingFiles.length === 0) return

    const existingFiles = new Set(selectedImages.map((image) => fileIdentity(image.file)))
    const currentBatchSize = selectedImages.reduce((total, image) => total + image.file.size, 0)
    const accepted = []
    let acceptedSize = 0
    let unsupported = 0
    let oversized = 0
    let duplicated = 0
    let exceeded = 0
    let batchSizeExceeded = 0

    incomingFiles.forEach((file) => {
      if (!isSupportedImage(file)) {
        unsupported += 1
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        oversized += 1
        return
      }

      const identity = fileIdentity(file)
      if (existingFiles.has(identity)) {
        duplicated += 1
        return
      }
      if (selectedImages.length + accepted.length >= MAX_BATCH_IMAGES) {
        exceeded += 1
        return
      }
      if (currentBatchSize + acceptedSize + file.size > MAX_BATCH_SIZE) {
        batchSizeExceeded += 1
        return
      }

      existingFiles.add(identity)
      acceptedSize += file.size
      accepted.push({
        id: createImageId(),
        file,
        preview: URL.createObjectURL(file)
      })
    })

    if (accepted.length > 0) {
      setSelectedImages((current) => [...current, ...accepted])
      setStep("preview")
    }

    const problems = []
    if (unsupported) problems.push(`${unsupported} em formato não compatível`)
    if (oversized) problems.push(`${oversized} acima de 20 MB`)
    if (duplicated) problems.push(`${duplicated} duplicada${duplicated > 1 ? "s" : ""}`)
    if (exceeded) problems.push(`${exceeded} acima do limite de ${MAX_BATCH_IMAGES}`)
    if (batchSizeExceeded) problems.push(`${batchSizeExceeded} acima do limite total de 500 MB`)

    if (problems.length > 0) {
      setSelectionNotice({
        type: "warning",
        text: `${accepted.length ? `${accepted.length} adicionada${accepted.length > 1 ? "s" : ""}. ` : ""}Ignoradas: ${problems.join(", ")}.`
      })
    } else {
      setSelectionNotice(null)
    }
  }

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) return

    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext("2d").drawImage(video, 0, 0)

    canvas.toBlob((blob) => {
      if (!blob) return
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
      const cameraFile = new File([blob], `captura-soja-${timestamp}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now()
      })
      stopCamera()
      addSelectedFiles([cameraFile])
    }, "image/jpeg", 0.92)
  }

  const openGallery = () => {
    setSelectionSource((current) => selectedImagesRef.current.length > 0 ? current || "gallery" : "gallery")
    fileInputRef.current?.click()
  }

  const addMoreImages = () => {
    if (selectionSource === "camera") {
      startCamera()
      return
    }

    openGallery()
  }

  const handleGalleryImages = (event) => {
    if (!event.target.files?.length && selectedImagesRef.current.length === 0) {
      setSelectionSource(null)
    }
    addSelectedFiles(event.target.files)
    event.target.value = ""
  }

  const handleDragOverImage = (event) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDraggingImage(true)
  }

  const handleDragLeaveImage = (event) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDraggingImage(false)
  }

  const handleDropImage = (event) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDraggingImage(false)
    setSelectionSource((current) => current || "gallery")
    addSelectedFiles(event.dataTransfer.files)
  }

  const removeSelectedImage = (imageId) => {
    const imageToRemove = selectedImages.find((image) => image.id === imageId)
    if (imageToRemove) URL.revokeObjectURL(imageToRemove.preview)

    const remaining = selectedImages.filter((image) => image.id !== imageId)
    setSelectedImages(remaining)
    if (remaining.length === 0) {
      setSelectionNotice(null)
      setSelectionSource(null)
      setStep("start")
    }
  }

  const clearSelectedImages = () => {
    selectedImages.forEach((image) => URL.revokeObjectURL(image.preview))
    setSelectedImages([])
    setSelectionNotice(null)
    setSelectionSource(null)
  }

  const analyzeBatch = async () => {
    if (selectedImages.length === 0) return
    const permission = await featureAccess.consume()
    if (!permission.allowed) {
      setResult({ status: "limite_atingido", resultado: "Limite atingido", mensagem: permission.limitReached ? "Você já utilizou as três análises disponíveis para este recurso." : permission.error?.message || "Não foi possível verificar seu limite." })
      setStep("result")
      return
    }

    const controller = new AbortController()
    requestControllerRef.current = controller
    setStep("analysis")

    try {
      const data = await diagnosticarLote(selectedImages, { signal: controller.signal })
      setResult(data)
      saveBatchToHistory(data)
    } catch (error) {
      if (controller.signal.aborted) return
      setResult({
        status: error?.status ? "erro_api" : "erro_conexao",
        resultado: "Erro",
        mensagem: error?.message || t("diagnosis.batchError")
      })
    } finally {
      if (!controller.signal.aborted) setStep("result")
      if (requestControllerRef.current === controller) requestControllerRef.current = null
    }
  }

  const reset = () => {
    stopCamera()
    clearSelectedImages()
    setResult(null)
    setStep("start")
  }

  const cancelCamera = () => {
    stopCamera()
    if (selectedImages.length > 0) {
      setStep("preview")
      return
    }

    reset()
  }

  const backFromHistory = () => {
    setShowAllHistory(false)
    try {
      const saved = localStorage.getItem("diagnosticHistory")
      if (saved) setHistory(JSON.parse(saved))
    } catch {
      // Mantém o histórico que já está em memória.
    }
  }

  const viewAllHistory = () => {
    setShowAllHistory(true)
    window.scrollTo({ top: 0, behavior: "auto" })
  }

  const galleryInput = (
    <input
      type="file"
      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
      multiple
      ref={fileInputRef}
      className="hidden-input"
      onChange={handleGalleryImages}
    />
  )

  if (showAllHistory) return <AllHistory onBack={backFromHistory} />
  if (step === "camera") return <CameraView videoRef={videoRef} onCapture={capturePhoto} onCancel={cancelCamera} />
  if (step === "preview") {
    return (
      <>
        <BatchImagePreview
          images={selectedImages}
          notice={selectionNotice}
          onAddImages={addMoreImages}
          onRemoveImage={removeSelectedImage}
          onBack={reset}
          onAnalyze={analyzeBatch}
          addImagesLabel={selectionSource === "camera" ? t("diagnosis.takeAnother") : t("diagnosis.addPhotos")}
          addImagesIcon={selectionSource === "camera" ? "photo_camera" : "add_photo_alternate"}
          addTileTitle={selectionSource === "camera" ? t("diagnosis.takePhotoShort") : t("diagnosis.add")}
          addTileSubtitle={selectionSource === "camera" ? t("diagnosis.again") : t("diagnosis.moreImages")}
        />
        {galleryInput}
      </>
    )
  }
  if (step === "analysis") return <AnalysisLoader imageCount={selectedImages.length} />
  if (step === "result" && result?.resultado_geral) {
    return <BatchDiagnosisResult result={result} selectedImages={selectedImages} onRestart={reset} />
  }
  if (step === "result" && selectedImages.length > 0) {
    return <BatchDiagnosisResult result={result} selectedImages={selectedImages} onRestart={reset} />
  }
  if (step === "result") return <DiagnosisResult result={result} onRestart={reset} />

  return (
    <div className="diagnostic-container">
      <div className="diagnostic-hero">
        <div className="diagnostic-header">
          <h1 className="diagnostico-title">{t("diagnosis.title")}</h1>
          <p>
            {t("diagnosis.subtitle")}{" "}
            <span className="highlight">{t("diagnosis.ai")}</span>
          </p>
          <p className="analysis-usage" aria-live="polite">
            {featureAccess.loading ? "Carregando limite de análises..." : featureAccess.fullAccess ? "Acesso ilimitado" : `${featureAccess.used} de 3 análises usadas · ${featureAccess.remaining} restante${featureAccess.remaining === 1 ? "" : "s"}`}
          </p>
        </div>

        <section className="diagnostic-dashboard" aria-label={t("diagnosis.summary")}>
          <div className="diagnostic-dashboard-metrics">
            <div className="diagnostic-dashboard-metric">
              <div className="diagnostic-dashboard-label">
                <span className="material-symbols-outlined" aria-hidden="true">clinical_notes</span>
                <span>{t("diagnosis.diagnoses")}</span>
              </div>
              <div className="diagnostic-dashboard-value-row">
                <strong>{dashboardData.total.toLocaleString(locale)}</strong>
                <span className={`diagnostic-dashboard-trend ${trendTone(dashboardData.countTrend)}`}>
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {trendIcon(dashboardData.countTrend)}
                  </span>
                  {dashboardData.countTrend > 0 ? "+" : ""}{dashboardData.countTrend}%
                </span>
              </div>
              <p>{t("diagnosis.thisMonth", { count: dashboardData.currentCount })}</p>
            </div>

            <div className="diagnostic-dashboard-metric">
              <div className="diagnostic-dashboard-label">
                <span className="material-symbols-outlined" aria-hidden="true">verified</span>
                <span>{t("diagnosis.averageConfidence")}</span>
              </div>
              <div className="diagnostic-dashboard-value-row">
                <strong>{dashboardData.average}%</strong>
                <span className={`diagnostic-dashboard-trend ${trendTone(dashboardData.confidenceTrend)}`}>
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {trendIcon(dashboardData.confidenceTrend)}
                  </span>
                  {dashboardData.confidenceTrend > 0 ? "+" : ""}{dashboardData.confidenceTrend} p.p.
                </span>
              </div>
              <p>{t("diagnosis.previousMonth")}</p>
            </div>
          </div>

          <div className="diagnostic-dashboard-chart">
            <div className="diagnostic-dashboard-chart-heading">
              <span>{t("diagnosis.activity")}</span>
              <small>{t("diagnosis.lastMonths")}</small>
            </div>
            <svg
              viewBox={`0 0 ${DASHBOARD_CHART_WIDTH} 120`}
              preserveAspectRatio="none"
              role="img"
              aria-label={t("diagnosis.chartLabel")}
            >
              <path className="diagnostic-dashboard-area" d={dashboardData.areaPath} />
              <path className="diagnostic-dashboard-line" d={dashboardData.linePath} />
              {dashboardData.points.map((point, index) => (
                <circle
                  key={dashboardData.monthLabels[index]}
                  className={index === dashboardData.points.length - 1 ? "is-current" : ""}
                  cx={point.x}
                  cy={point.y}
                  r={index === dashboardData.points.length - 1 ? 6 : 3.5}
                />
              ))}
            </svg>
            <div className="diagnostic-dashboard-months" aria-hidden="true">
              {dashboardData.monthLabels.map((month, index) => (
                <span className={index === dashboardData.monthLabels.length - 1 ? "is-current" : ""} key={month}>
                  {month}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      {selectionNotice?.text && (
        <div className="tips-card" role="status">
          <div className="tips-header">
            <span className="material-symbols-outlined">warning</span>
            <h4>{t("diagnosis.attention")}</h4>
          </div>
          <p>{selectionNotice.text}</p>
        </div>
      )}

      <div className="options-grid">
        {isMobile && (
          <button type="button" className="option-card" onClick={startCamera}>
            <div className="card-glow"></div>
            <div className="option-icon-wrapper">
              <div className="option-icon">
                <span className="material-symbols-outlined">
                  photo_camera
                </span>
              </div>
            </div>
            <h3>{t("diagnosis.takePhoto")}</h3>
            <p>{t("diagnosis.captureNow")}</p>
            <div className="card-action">
              <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
            </div>
          </button>
        )}

        <button
          type="button"
          className={`option-card ${isDraggingImage ? "drag-active" : ""}`}
          onClick={openGallery}
          onDragEnter={handleDragOverImage}
          onDragOver={handleDragOverImage}
          onDragLeave={handleDragLeaveImage}
          onDrop={handleDropImage}
        >
          <div className="card-glow"></div>
          <div className="option-icon-wrapper">
            <div className="option-icon">
              <span className="material-symbols-outlined">
                photo_library
              </span>
            </div>
          </div>
          <h3>{t("diagnosis.gallery")}</h3>
          <p>{t("diagnosis.chooseImages")}</p>
          <div className="card-action">
            <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </div>
        </button>
      </div>

      <div className="history-section">
        <div className="section-header">
          <div className="section-title">
            <span className="material-symbols-outlined">history</span>
            <h3>{t("diagnosis.history")}</h3>
          </div>
          <button type="button" className="section-link" onClick={viewAllHistory}>
            {t("diagnosis.viewAll")}
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>

        <div className={`history-list ${history.length > 5 ? "has-more" : ""}`}>
          {history.length === 0 ? (
            <div className="empty-history">
              <div className="empty-icon">
                <span className="material-symbols-outlined">history</span>
              </div>
              <p className="empty-title">{t("diagnosis.noneYet")}</p>
              <p className="empty-description">
                {t("diagnosis.firstDiagnosis")}
              </p>
              <div className="empty-actions">
                {isMobile && (
                  <button type="button" className="empty-action" onClick={startCamera}>
                    <span className="material-symbols-outlined">photo_camera</span>
                    {t("diagnosis.takePhoto")}
                  </button>
                )}
                <button type="button" className="empty-action secondary" onClick={openGallery}>
                  <span className="material-symbols-outlined">photo_library</span>
                  {t("diagnosis.gallery")}
                </button>
              </div>
            </div>
          ) : (
            history.slice(0, 5).map((item) => (
              <div key={item.id} className="history-item">
                <div className="history-icon">
                  <span className="material-symbols-outlined">{item.type === "batch" ? "flight" : "eco"}</span>
                </div>

                <div className="history-info">
                  <div className="history-name">{formatDiagnosisName(item.disease)}</div>
                  <div className="history-date">
                    {item.type === "batch" && item.imageCount ? `${t("diagnosis.photos", { count: item.imageCount })} • ` : ""}{item.date}
                  </div>
                </div>

                <div className="history-confidence" title={t("diagnosis.averageConfidence")}>
                  <div className="confidence-value">
                    {item.confidence}%
                  </div>
                  <div className="confidence-bar">
                    <div
                      className="confidence-fill"
                      style={{ width: `${Math.min(100, item.confidence)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {history.length > 5 && (
          <button type="button" className="show-more-history-btn" onClick={viewAllHistory}>
            {t("diagnosis.showMore")}
            <span className="material-symbols-outlined">expand_more</span>
          </button>
        )}
      </div>

      <div className="tips-card diagnostic-tip-card">
        <div className="diagnostic-tip-copy">
          <div className="tips-header">
            <span className="material-symbols-outlined">
              tips_and_updates
            </span>
            <h4>{t("diagnosis.tip")}</h4>
          </div>
          <p>
            {t("diagnosis.tipText")}
          </p>
        </div>
        <img src="/assets/image/soja-intro.jpg" alt={t("diagnosis.soyLeaves")} />
      </div>

      {galleryInput}
    </div>
  )
}
