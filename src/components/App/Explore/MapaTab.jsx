import { useState, useEffect, useMemo, useRef } from "react"
import { collection, getDocs, query, where } from "firebase/firestore"
import { useFarm } from "./hooks/useFarm"
import { formatDiagnosisName } from "./Diagnostico/diagnosisLabels"
import { auth, db } from "../../../services/firebase"
import { ACCOUNT_ROLES } from "../../../services/accessControl"
import "../../../styles/App/MapaTab.css"

import L from "leaflet"
import "leaflet/dist/leaflet.css"
import * as turf from "@turf/turf"

const MOBILE_MAP_QUERY = "(max-width: 767px), (pointer: coarse)"
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"

function normalizeCep(value = "") {
  return String(value).replace(/\D/g, "")
}

function parseLocation(latitude, longitude, addressLabel) {
  const lat = Number(latitude)
  const lng = Number(longitude)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  return { lat, lng, addressLabel }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  })

  if (!response.ok) {
    throw new Error(`Serviço de localização indisponível (${response.status})`)
  }

  return response.json()
}

async function geocodeAddress(query) {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "3",
    countrycodes: "br",
    "accept-language": "pt-BR",
    addressdetails: "1",
  })
  const results = await fetchJson(`${NOMINATIM_SEARCH_URL}?${params.toString()}`)
  const result = Array.isArray(results) ? results[0] : null

  if (!result) return null

  return parseLocation(
    result.lat,
    result.lon,
    result.display_name?.split(",").slice(0, 4).join(",") || query,
  )
}

function locationMatchesCep(result, cep) {
  const expectedCep = normalizeCep(cep)
  const resultCep = normalizeCep(result?.address?.postcode)
  const labelCep = normalizeCep(result?.display_name)

  return resultCep === expectedCep || labelCep.includes(expectedCep)
}

async function geocodeCepAddress(queries, cep) {
  for (const query of queries) {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "3",
      countrycodes: "br",
      "accept-language": "pt-BR",
      addressdetails: "1",
    })
    const results = await fetchJson(`${NOMINATIM_SEARCH_URL}?${params.toString()}`)

    if (!Array.isArray(results) || results.length === 0) continue

    const exactCepResult = results.find((result) => locationMatchesCep(result, cep))
    if (exactCepResult) {
      return parseLocation(
        exactCepResult.lat,
        exactCepResult.lon,
        exactCepResult.display_name?.split(",").slice(0, 4).join(",") || query,
      )
    }
  }

  return null
}

async function resolveCepLocation(cep) {
  let brasilApiLocation = null

  try {
    const data = await fetchJson(`https://brasilapi.com.br/api/cep/v2/${cep}`)
    const addressLabel = [data.street, data.neighborhood, data.city, data.state]
      .filter(Boolean)
      .join(", ")
    brasilApiLocation = parseLocation(
      data.location?.coordinates?.latitude,
      data.location?.coordinates?.longitude,
      addressLabel,
    )
  } catch (error) {
    console.warn("BrasilAPI não conseguiu localizar o CEP; tentando fallback.", error)
  }

  const data = await fetchJson(`https://viacep.com.br/ws/${cep}/json/`)
  if (data.erro) throw new Error("CEP não encontrado")

  const addressLabel = [data.logradouro, data.bairro, data.localidade, data.uf]
    .filter(Boolean)
    .join(", ")
  const cityState = [data.localidade, data.uf].filter(Boolean).join(", ")
  const isSpecificAddress = Boolean(data.logradouro || data.bairro)

  try {
    const awesomeData = await fetchJson(`https://cep.awesomeapi.com.br/json/${cep}`)
    const awesomeLocation = parseLocation(awesomeData.lat, awesomeData.lng, [
      awesomeData.address,
      awesomeData.district,
      awesomeData.city,
      awesomeData.state,
    ].filter(Boolean).join(", "))

    if (awesomeLocation) return awesomeLocation
  } catch (error) {
    console.warn("AwesomeAPI não conseguiu localizar o CEP; tentando geocodificação.", error)
  }

  const queries = [
    [data.logradouro, data.bairro, data.localidade, data.uf, "Brasil"].filter(Boolean).join(", "),
    [`${cep.slice(0, 5)}-${cep.slice(5)}`, cityState, "Brasil"].filter(Boolean).join(", "),
    `${cep}, Brasil`,
  ].filter((query, index, list) => query && list.indexOf(query) === index)
  const location = await geocodeCepAddress(queries, cep)

  if (!location) {
    if (!isSpecificAddress && brasilApiLocation) return brasilApiLocation

    const detail = isSpecificAddress
      ? "O CEP foi encontrado, mas não há coordenada exata disponível para esse endereço."
      : "Não foi possível localizar esse CEP no mapa"
    throw new Error(detail)
  }

  return { ...location, addressLabel: addressLabel || location.addressLabel }
}

// corrigir ícones
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
})

// formatar área
function formatArea(areaHa) {
  if (areaHa < 1) return `${(areaHa * 10000).toFixed(0)} m²`
  return `${areaHa.toFixed(2)} ha`
}

// cálculo com Turf
function calculateArea(latLngs) {
  if (!latLngs || latLngs.length < 3) return 0

  const coordinates = latLngs.map(p => [p.lng, p.lat])
  coordinates.push(coordinates[0])

  const polygon = turf.polygon([coordinates])
  const areaM2 = turf.area(polygon)

  return areaM2 / 10000
}

function calculatePerimeter(latLngs) {
  if (!latLngs || latLngs.length < 2) return 0

  const coordinates = latLngs.map(point => Array.isArray(point)
    ? [point[1], point[0]]
    : [point.lng, point.lat])
  coordinates.push(coordinates[0])

  return turf.length(turf.lineString(coordinates), { units: "kilometers" }) * 1000
}

function getAreaStatus() {
  return { label: "Mapeada", color: "#3d8057" }
}

function matchesAreaFilter(area, filter) {
  if (filter === "all") return true
  return getAreaStatusTone(area?.status) === filter
}

function getAreaStatusTone(status = "") {
  const normalized = status.toLowerCase()
  if (normalized.includes("crítico")) return "critical"
  if (normalized.includes("atenção")) return "warning"
  return "healthy"
}

function readStoredList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]")
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function getDiagnosticAreaId(item) {
  return item?.fieldAreaId ?? item?.areaId ?? item?.farmAreaId ?? item?.area?.id ?? null
}

function getDiagnosticTalhaoId(item) {
  return item?.talhaoId ?? item?.fieldBlockId ?? item?.plotId ?? item?.talhao?.id ?? null
}

function getDiagnosticEmployeeId(item) {
  return item?.employeeId ?? item?.responsibleId ?? item?.userId ?? item?.authorId ?? null
}

function getDiagnosticConfidence(item) {
  const value = item?.confidence ?? item?.confianca ?? item?.confianca_media ?? item?.score
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : null
}

function getDiagnosticTitle(item) {
  return formatDiagnosisName(item?.disease || item?.resultado || item?.doenca || "Análise recebida")
}

function getTalhaoTone(score) {
  if (score == null) return "pending"
  if (score >= 90) return "healthy"
  if (score >= 75) return "warning"
  return "critical"
}

function getTalhaoStatus(score) {
  if (score == null) return "Aguardando análise"
  if (score >= 90) return "Ótimo"
  if (score >= 75) return "Atenção"
  return "Crítico"
}

function getTalhaoColor(score) {
  const tone = getTalhaoTone(score)
  if (tone === "healthy") return "#3ba55d"
  if (tone === "warning") return "#e49a1f"
  if (tone === "critical") return "#d4443f"
  return "#7fa66b"
}

function getTalhaoDiagnostics(area, talhao, diagnostics) {
  return diagnostics.filter((item) => {
    const areaId = getDiagnosticAreaId(item)
    const talhaoId = getDiagnosticTalhaoId(item)
    const employeeId = getDiagnosticEmployeeId(item)
    if (talhaoId != null) return String(talhaoId) === String(talhao.id)
    return (
      areaId != null &&
      talhao.employeeId &&
      employeeId != null &&
      String(areaId) === String(area.id) &&
      String(employeeId) === String(talhao.employeeId)
    )
  })
}

function buildTalhaoView(area, talhao, diagnostics) {
  const linkedDiagnostics = getTalhaoDiagnostics(area, talhao, diagnostics)
  const scores = linkedDiagnostics
    .map(getDiagnosticConfidence)
    .filter((score) => score != null)
  const score = scores.length
    ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
    : null
  const latest = linkedDiagnostics
    .slice()
    .sort((a, b) => Number(new Date(b.submittedAt || b.date || b.id || 0)) - Number(new Date(a.submittedAt || a.date || a.id || 0)))[0]

  return {
    ...talhao,
    score,
    status: getTalhaoStatus(score),
    tone: getTalhaoTone(score),
    color: getTalhaoColor(score),
    diagnosticsCount: linkedDiagnostics.length,
    latestTitle: latest ? getDiagnosticTitle(latest) : "Sem imagens enviadas",
    employeeName: latest?.employeeName || talhao.employeeName || "Sem responsável",
  }
}

function getAreaMetrics(area) {
  const seed = Number(String(area?.id || 0).slice(-3)) || 127
  const tone = getAreaStatusTone(area?.status)

  return {
    moisture: tone === "critical" ? 42 : tone === "warning" ? 58 : 74,
    fertility: Math.min(96, 66 + (seed % 28)),
    yield: Math.min(94, 70 + (seed % 22)),
    pest: tone === "critical" ? 86 : tone === "warning" ? 62 : 24,
  }
}

function createFieldProjection(coordinates = []) {
  if (!coordinates || coordinates.length < 3) return null

  const lats = coordinates.map(([lat]) => lat)
  const lngs = coordinates.map(([, lng]) => lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latRange = maxLat - minLat || 0.0001
  const lngRange = maxLng - minLng || 0.0001
  const width = 620
  const height = 380
  const padding = 52

  const projectCoordinate = ([lat, lng]) => {
    const x = padding + ((lng - minLng) / lngRange) * (width - padding * 2)
    const y = padding + ((maxLat - lat) / latRange) * (height - padding * 2)
    return { x, y }
  }

  const points = coordinates.map(projectCoordinate)

  const pointsString = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")
  const center = points.reduce(
    (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
    { x: 0, y: 0 }
  )

  return { points, pointsString, center, width, height, projectCoordinate }
}

function getStatusColors(area) {
  const tone = getAreaStatusTone(area?.status)

  if (tone === "critical") {
    return { start: "#8f2d25", middle: "#cf5b46", end: "#5f1f1a" }
  }

  if (tone === "warning") {
    return { start: "#9d7a20", middle: "#d9b64c", end: "#5f5120" }
  }

  return { start: area?.color || "#2f8f45", middle: "#78b56a", end: "#215c32" }
}

function getProjectedZones(area, projection) {
  if (!area?.zones?.length || !projection) return []

  return area.zones
    .filter(zone => zone.coordinates?.length >= 3)
    .map((zone, index) => {
      const projected = zone.coordinates.map(projection.projectCoordinate)
      const points = projected.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")
      const center = projected.reduce(
        (acc, point) => ({ x: acc.x + point.x / projected.length, y: acc.y + point.y / projected.length }),
        { x: 0, y: 0 }
      )

      return {
        ...zone,
        id: `${area.id}-zone-${index}`,
        points,
        center,
        opacity: zone.color === "#2196F3" ? 0.46 : 0.42
      }
    })
}

function getFieldMarkers(area, projection) {
  if (!area || !projection) return []

  const tone = getAreaStatusTone(area.status)
  const seed = Number(String(area.id).slice(-4)) || 731
  const issueCount = tone === "critical" ? 18 : tone === "warning" ? 10 : 5
  const markers = []

  for (let index = 0; index < issueCount; index += 1) {
    const angle = (seed + index * 49) * 0.017
    const radiusX = 46 + ((seed + index * 23) % 120)
    const radiusY = 24 + ((seed + index * 17) % 70)
    markers.push({
      x: projection.center.x + Math.cos(angle) * radiusX,
      y: projection.center.y + Math.sin(angle) * radiusY,
      tone: index % 4 === 0 || tone === "critical" ? "critical" : "warning"
    })
  }

  return markers
}

function FieldSparkline({ type = "good" }) {
  const path = type === "danger"
    ? "M4 42 C42 42 44 8 72 8 S96 9 126 9"
    : "M4 34 C30 32 42 20 62 18 S78 30 92 22 112 20 126 20"

  return (
    <svg viewBox="0 0 130 52" className="metric-sparkline" aria-hidden="true">
      <path d="M4 44 H126" />
      <path d={path} />
    </svg>
  )
}

function MetricCard({ icon, label, value, tone = "good" }) {
  return (
    <div className={`farm3d-metric ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <FieldSparkline type={tone === "danger" ? "danger" : "good"} />
    </div>
  )
}

function Field3DView({ area }) {
  const dragRef = useRef(null)
  const pointersRef = useRef(new Map())
  const pinchRef = useRef(null)
  const touchGestureRef = useRef(null)
  const sceneViewRef = useRef(null)
  const [sceneView, setSceneView] = useState({
    rotateX: 58,
    rotateZ: -14,
    scale: 1,
    panX: 0,
    panY: 0,
  })

  useEffect(() => {
    pointersRef.current.clear()
    pinchRef.current = null
    touchGestureRef.current = null
    dragRef.current = null
    setSceneView({
      rotateX: 58,
      rotateZ: -14,
      scale: 1,
      panX: 0,
      panY: 0,
    })
  }, [area?.id])

  useEffect(() => {
    sceneViewRef.current = sceneView
  }, [sceneView])

  if (!area) {
    return (
      <section className="farm3d-panel empty">
        <div>
          <span className="farm3d-eyebrow">Modelo 3D</span>
          <h3>Selecione uma área para gerar a plantação em 3D</h3>
          <p>Depois de desenhar a lavoura, toque em um card de área para abrir a maquete visual com os pontos de atenção.</p>
        </div>
      </section>
    )
  }

  const projection = createFieldProjection(area.coordinates)
  const metrics = getAreaMetrics(area)
  const markers = getFieldMarkers(area, projection)
  const tone = getAreaStatusTone(area.status)
  const fieldColors = getStatusColors(area)
  const projectedZones = getProjectedZones(area, projection)
  const alertText = tone === "critical"
    ? "Ir primeiro aos pontos vermelhos: risco alto de pragas e queda de produtividade."
    : tone === "warning"
      ? "Verificar as faixas amarelas: solo e irrigação precisam de acompanhamento."
      : "Área estável: manter rotina de monitoramento e irrigação programada."

  if (!projection) return null

  const updateScale = (direction) => {
    setSceneView(view => ({
      ...view,
      scale: Math.min(1.55, Math.max(0.76, view.scale + direction * 0.12))
    }))
  }

  const getPointerDistance = () => {
    const pointers = Array.from(pointersRef.current.values())
    if (pointers.length < 2) return 0

    const [first, second] = pointers
    return Math.hypot(second.x - first.x, second.y - first.y)
  }

  const resetScene = () => {
    pointersRef.current.clear()
    pinchRef.current = null
    touchGestureRef.current = null
    dragRef.current = null
    setSceneView({
      rotateX: 58,
      rotateZ: -14,
      scale: 1,
      panX: 0,
      panY: 0,
    })
  }

  const handleScenePointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    if (pointersRef.current.size >= 2) {
      pinchRef.current = {
        distance: getPointerDistance(),
        scale: sceneViewRef.current?.scale || sceneView.scale,
      }
      dragRef.current = null
      return
    }

    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      view: sceneViewRef.current || sceneView,
    }
  }

  const handleScenePointerMove = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return

    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const nextDistance = getPointerDistance()
      if (!nextDistance || !pinchRef.current.distance) return

      const nextScale = pinchRef.current.scale * (nextDistance / pinchRef.current.distance)
      setSceneView(view => ({
        ...view,
        scale: Math.min(1.55, Math.max(0.76, nextScale))
      }))
      return
    }

    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return

    const deltaX = event.clientX - drag.x
    const deltaY = event.clientY - drag.y

    setSceneView({
      ...drag.view,
      rotateX: Math.min(68, Math.max(44, drag.view.rotateX - deltaY * 0.12)),
      rotateZ: Math.min(10, Math.max(-34, drag.view.rotateZ + deltaX * 0.12)),
      panX: Math.min(42, Math.max(-42, drag.view.panX + deltaX * 0.08)),
      panY: Math.min(26, Math.max(-26, drag.view.panY + deltaY * 0.06)),
    })
  }

  const handleScenePointerEnd = (event) => {
    pointersRef.current.delete(event.pointerId)
    pinchRef.current = null

    const remainingPointer = Array.from(pointersRef.current.entries())[0]
    if (remainingPointer) {
      const [id, pointer] = remainingPointer
      dragRef.current = {
        id,
        x: pointer.x,
        y: pointer.y,
        view: sceneViewRef.current || sceneView,
      }
      return
    }

    dragRef.current = null
  }

  const getTouchDistance = (touches) => {
    if (touches.length < 2) return 0

    return Math.hypot(
      touches[1].clientX - touches[0].clientX,
      touches[1].clientY - touches[0].clientY
    )
  }

  const getTouchCenter = (touches) => {
    if (touches.length < 2) {
      return {
        x: touches[0]?.clientX || 0,
        y: touches[0]?.clientY || 0,
      }
    }

    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    }
  }

  const handleSceneTouchStart = (event) => {
    if (event.touches.length === 1) {
      const touch = event.touches[0]
      touchGestureRef.current = {
        type: "drag",
        x: touch.clientX,
        y: touch.clientY,
        view: sceneViewRef.current || sceneView,
      }
      return
    }

    if (event.touches.length >= 2) {
      event.preventDefault()
      const center = getTouchCenter(event.touches)
      touchGestureRef.current = {
        type: "pinch",
        distance: getTouchDistance(event.touches),
        centerX: center.x,
        centerY: center.y,
        view: sceneViewRef.current || sceneView,
      }
    }
  }

  const handleSceneTouchMove = (event) => {
    const gesture = touchGestureRef.current
    if (!gesture) return

    if (event.touches.length >= 2) {
      event.preventDefault()
      const nextDistance = getTouchDistance(event.touches)
      const center = getTouchCenter(event.touches)
      if (!nextDistance || !gesture.distance) return

      const nextScale = gesture.view.scale * (nextDistance / gesture.distance)
      setSceneView({
        ...gesture.view,
        scale: Math.min(1.65, Math.max(0.72, nextScale)),
        panX: Math.min(52, Math.max(-52, gesture.view.panX + (center.x - gesture.centerX) * 0.05)),
        panY: Math.min(34, Math.max(-34, gesture.view.panY + (center.y - gesture.centerY) * 0.05)),
      })
      return
    }

    if (event.touches.length === 1 && gesture.type === "drag") {
      const touch = event.touches[0]
      const deltaX = touch.clientX - gesture.x
      const deltaY = touch.clientY - gesture.y

      setSceneView({
        ...gesture.view,
        rotateX: Math.min(68, Math.max(44, gesture.view.rotateX - deltaY * 0.12)),
        rotateZ: Math.min(10, Math.max(-34, gesture.view.rotateZ + deltaX * 0.12)),
        panX: Math.min(42, Math.max(-42, gesture.view.panX + deltaX * 0.08)),
        panY: Math.min(26, Math.max(-26, gesture.view.panY + deltaY * 0.06)),
      })
    }
  }

  const handleSceneTouchEnd = (event) => {
    if (event.touches.length === 0) {
      touchGestureRef.current = null
      return
    }

    if (event.touches.length === 1) {
      const touch = event.touches[0]
      touchGestureRef.current = {
        type: "drag",
        x: touch.clientX,
        y: touch.clientY,
        view: sceneViewRef.current || sceneView,
      }
    }
  }

  const sceneTransform = `translate(${sceneView.panX}px, ${sceneView.panY}px) rotateX(${sceneView.rotateX}deg) rotateZ(${sceneView.rotateZ}deg) scale(${sceneView.scale})`

  return (
    <section className="farm3d-panel">
      <div className="farm3d-heading">
        <div>
          <span className="farm3d-eyebrow">Modelo 3D da plantação</span>
          <h3>Área #{String(area.id).slice(-6)}</h3>
          <p>{formatArea(area.areaHa)} mapeados para inspeção rápida do produtor</p>
        </div>
        <div className={`farm3d-status ${tone}`}>
          <span></span>
          {area.status || "Saudável"}
        </div>
      </div>

      <div className="farm3d-dashboard">
        <aside className="farm3d-side left">
          <div className="weather-card">
            <strong>28°C, céu limpo</strong>
            <span>Sem chuva nas próximas horas</span>
          </div>
          <div className="distribution-card">
            <h4>Distribuição da área</h4>
            <div className="crop-ring">
              <span></span>
            </div>
            <div className="crop-legend">
              <p><i></i> Soja <strong>68%</strong></p>
              <p><i></i> Milho <strong>18%</strong></p>
              <p><i></i> Atenção <strong>14%</strong></p>
            </div>
          </div>
        </aside>

        <div
          className="farm3d-scene"
          aria-label="Plantação em 3D da área selecionada"
          onPointerDown={handleScenePointerDown}
          onPointerMove={handleScenePointerMove}
          onPointerUp={handleScenePointerEnd}
          onPointerCancel={handleScenePointerEnd}
          onTouchStart={handleSceneTouchStart}
          onTouchMove={handleSceneTouchMove}
          onTouchEnd={handleSceneTouchEnd}
          onTouchCancel={handleSceneTouchEnd}
        >
          <div className="farm3d-ground"></div>
          <div className="farm3d-stage" style={{ transform: sceneTransform }}>
            <svg
              className="farm3d-field"
              viewBox={`0 0 ${projection.width} ${projection.height}`}
              role="img"
              aria-label="Maquete 3D da área selecionada"
            >
              <defs>
                <clipPath id={`field-clip-${area.id}`}>
                  <polygon points={projection.pointsString} />
                </clipPath>
                <linearGradient id={`field-gradient-${area.id}`} x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor={fieldColors.start} />
                  <stop offset="54%" stopColor={fieldColors.middle} />
                  <stop offset="100%" stopColor={fieldColors.end} />
                </linearGradient>
                <pattern id={`field-lines-${area.id}`} width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
                  <rect width="46" height="46" fill="transparent" />
                  <path d="M0 12 H46 M0 30 H46" stroke="rgba(255,255,255,0.24)" strokeWidth="3" />
                </pattern>
              </defs>

              <polygon className="field-shadow" points={projection.pointsString} transform="translate(16 24)" />
              <polygon className="field-base" points={projection.pointsString} fill={`url(#field-gradient-${area.id})`} />
              <polygon className="field-texture" points={projection.pointsString} fill={`url(#field-lines-${area.id})`} />

              <g clipPath={`url(#field-clip-${area.id})`}>
                <path className="water-channel" d={`M20 ${projection.center.y - 14} C180 ${projection.center.y - 70} 352 ${projection.center.y + 72} 600 ${projection.center.y - 18}`} />
                <path className="field-road" d={`M70 ${projection.center.y + 96} C220 ${projection.center.y + 28} 390 ${projection.center.y + 126} 570 ${projection.center.y + 70}`} />
                {projectedZones.length > 0 ? (
                  projectedZones.map(zone => (
                    <polygon
                      key={zone.id}
                      className="zone zone-map"
                      points={zone.points}
                      fill={zone.color}
                      opacity={zone.opacity}
                    />
                  ))
                ) : (
                  <>
                    <rect className="zone zone-light" x="340" y="88" width="200" height="130" rx="16" transform={`rotate(10 ${projection.center.x} ${projection.center.y})`} />
                    {tone !== "healthy" && (
                      <rect className="zone zone-warning" x="190" y="232" width="250" height="104" rx="16" transform={`rotate(-5 ${projection.center.x} ${projection.center.y})`} />
                    )}
                  </>
                )}
              </g>

              <polygon className="field-border" points={projection.pointsString} />

              {markers.map((marker, index) => (
                <circle
                  key={`${marker.x}-${marker.y}-${index}`}
                  className={`field-marker ${marker.tone}`}
                  cx={marker.x}
                  cy={marker.y}
                  r={marker.tone === "critical" ? 5 : 4}
                />
              ))}

              <g className="site-pin" transform={`translate(${projection.center.x - 8} ${projection.center.y - 12})`}>
                <circle r="16" />
                <circle r="7" />
              </g>
            </svg>

            <div className="farm3d-label site-a">Talhão A<br /><strong>Soja</strong></div>
            {projectedZones.slice(0, 2).map((zone, index) => (
              <div
                key={`${zone.id}-label`}
                className={`farm3d-label zone-label zone-label-${index}`}
                style={{
                  left: `${(zone.center.x / projection.width) * 100}%`,
                  top: `${(zone.center.y / projection.height) * 100}%`,
                  borderColor: zone.color,
                }}
              >
                Zona {index + 1}<br /><strong>{zone.status}</strong>
              </div>
            ))}
            {projectedZones.length === 0 && (
              <>
                <div className="farm3d-label site-b">Talhão B<br /><strong>Irrigação</strong></div>
                <div className="farm3d-label site-c">Talhão C<br /><strong>Pragas</strong></div>
              </>
            )}
          </div>

          <div className="farm3d-controls" onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => updateScale(1)} aria-label="Aproximar modelo 3D">+</button>
            <button type="button" onClick={() => updateScale(-1)} aria-label="Afastar modelo 3D">−</button>
            <button type="button" onClick={resetScene} aria-label="Restaurar visão 3D">↺</button>
          </div>
        </div>

        <aside className="farm3d-side right">
          <MetricCard icon="💧" label="Umidade do solo" value={metrics.moisture} />
          <MetricCard icon="🌿" label="Fertilidade" value={metrics.fertility} />
          <MetricCard icon="📈" label="Produção prevista" value={metrics.yield} />
          <MetricCard icon="⚠️" label="Risco de pragas" value={metrics.pest} tone={metrics.pest > 70 ? "danger" : "warning"} />
        </aside>
      </div>

      <div className="farm3d-actions">
        <div>
          <strong>Rota recomendada</strong>
          <span>{alertText}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            document.querySelector(".mapa-area")?.scrollIntoView({ behavior: "smooth", block: "center" })
          }}
        >
          Ver no mapa
        </button>
      </div>
    </section>
  )
}

function WebODMPanel({
  analysis,
  configured,
  loading,
  error,
  activeLayer,
  orthophotoEnabled,
  onConnect,
  onLayerChange,
  onOrthophotoToggle,
  onFocusRoute,
  onExportReport,
}) {
  const open3D = () => window.open(analysis.publicTaskUrl, "_blank", "noopener,noreferrer")
  const hasDetections = analysis?.detections?.length > 0

  if (!analysis) {
    return (
      <section className="webodm-panel empty">
        <div className="webodm-connect-form">
          <span className="webodm-eyebrow">WebODM</span>
          <h3>{loading ? "Conectando ao WebODM..." : "WebODM automático"}</h3>
          <p>
            {configured
              ? "O app está tentando carregar o ortomosaico e as detecções reais configuradas no ambiente."
              : "Configure o WebODM uma vez no ambiente do projeto para o produtor não precisar preencher nada."}
          </p>

          {error && <p className="webodm-error">{error}</p>}

          <button type="button" className="webodm-connect-btn" onClick={onConnect} disabled={loading || !configured}>
            <span className="material-symbols-outlined">sync</span>
            {loading ? "Conectando..." : "Tentar novamente"}
          </button>
        </div>
      </section>
    )
  }

  const layerOptions = [
    { id: "detections", icon: "crisis_alert", label: "Detecções" },
    { id: "heatmap", icon: "local_fire_department", label: "Calor" },
    { id: "prescription", icon: "science", label: "Prescrição" },
    { id: "route", icon: "route", label: "Rota" },
  ]

  return (
    <section className="webodm-panel">
      <div className="webodm-heading">
        <div>
          <span className="webodm-eyebrow">WebODM conectado ao mapa</span>
          <h3>Projeto {analysis.projectId} · Task {analysis.taskId}</h3>
          <p>{analysis.orthophoto} · {analysis.dsm} · {analysis.resolutionCm} cm/pixel</p>
        </div>
        <div className={`webodm-risk ${analysis.severity >= 70 ? "critical" : analysis.severity >= 45 ? "warning" : "ok"}`}>
          <strong>{analysis.severity}%</strong>
          <span>severidade</span>
        </div>
      </div>

      <div className="webodm-layer-tabs" role="tablist" aria-label="Camadas WebODM">
        <button
          type="button"
          className={orthophotoEnabled ? "active" : ""}
          onClick={() => onOrthophotoToggle(value => !value)}
        >
          <span className="material-symbols-outlined">map</span>
          Ortomosaico
        </button>
        {layerOptions.map(option => (
          <button
            key={option.id}
            type="button"
            className={activeLayer === option.id ? "active" : ""}
            onClick={() => onLayerChange(option.id)}
          >
            <span className="material-symbols-outlined">{option.icon}</span>
            {option.label}
          </button>
        ))}
      </div>

      <div className="webodm-metrics-grid">
        <div className="webodm-stat">
          <span className="material-symbols-outlined">crop_free</span>
          <strong>{formatArea(analysis.affectedHa)}</strong>
          <p>área afetada ({analysis.affectedPct}%)</p>
        </div>
        <div className="webodm-stat">
          <span className="material-symbols-outlined">eco</span>
          <strong>{analysis.indices.ndvi}</strong>
          <p>NDVI médio</p>
        </div>
        <div className="webodm-stat">
          <span className="material-symbols-outlined">water_drop</span>
          <strong>{analysis.indices.drainageRisk}</strong>
          <p>risco de drenagem</p>
        </div>
        <div className="webodm-stat">
          <span className="material-symbols-outlined">trending_down</span>
          <strong>{analysis.productivityLoss}</strong>
          <p>perda produtiva</p>
        </div>
      </div>

      <div className="webodm-content-grid">
        <div className="webodm-card">
          <div className="webodm-card-title">
            <span className="material-symbols-outlined">travel_explore</span>
            Pontos detectados
          </div>
          {hasDetections ? (
            <div className="webodm-detections-list">
              {analysis.detections.map(item => (
              <div key={item.id} className="webodm-detection-item" style={{ "--item-color": item.color }}>
                <span className="webodm-color-dot"></span>
                <div>
                  <strong>{item.label}</strong>
                  <p>{formatArea(item.affectedHa)} · confiança {item.confidence}%</p>
                </div>
                <b>{item.severity}%</b>
              </div>
              ))}
            </div>
          ) : (
            <p className="webodm-muted">Nenhuma detecção georreferenciada foi carregada. Adicione uma URL de GeoJSON/JSON da sua IA para marcar problemas reais no mapa.</p>
          )}
        </div>

        <div className="webodm-card">
          <div className="webodm-card-title">
            <span className="material-symbols-outlined">timeline</span>
            Comparação temporal
          </div>
          {analysis.timeline.length > 0 ? (
            <div className="webodm-timeline">
              {analysis.timeline.map(item => (
              <div key={item.label} className="webodm-timeline-row">
                <span>{item.label}</span>
                <div>
                  <i style={{ width: `${item.value}%` }}></i>
                </div>
                <strong>{item.value}%</strong>
              </div>
              ))}
            </div>
          ) : (
            <p className="webodm-muted">WebODM carregado. Para comparação temporal, conecte detecções de voos anteriores na sua API de IA.</p>
          )}
        </div>

        <div className="webodm-card">
          <div className="webodm-card-title">
            <span className="material-symbols-outlined">fact_check</span>
            Prescrição localizada
          </div>
          {analysis.prescription.length > 0 ? (
            <div className="webodm-prescription-list">
              {analysis.prescription.map(item => (
              <div key={`${item.area}-${item.dose}`}>
                <strong>{item.area}</strong>
                <span>{item.dose}</span>
                <p>{item.action}</p>
              </div>
              ))}
            </div>
          ) : (
            <p className="webodm-muted">A prescrição aparece quando a IA envia detecções com coordenadas.</p>
          )}
        </div>

        <div className="webodm-card webodm-actions-card">
          <div className="webodm-card-title">
            <span className="material-symbols-outlined">dashboard</span>
            Resumo geral
          </div>
          <div className="webodm-summary-line">
            <span>{analysis.detections.length} detecções reais</span>
            <span>{formatArea(analysis.affectedHa)} afetados</span>
            <span>Status WebODM: {analysis.task?.status || "carregado"}</span>
          </div>
          <div className="webodm-actions">
            {analysis.publicTaskUrl && (
              <button type="button" onClick={open3D}>
                <span className="material-symbols-outlined">view_in_ar</span>
                Abrir 3D
              </button>
            )}
            <button type="button" onClick={onFocusRoute}>
              <span className="material-symbols-outlined">route</span>
              Ver rota
            </button>
            <button type="button" onClick={onExportReport}>
              <span className="material-symbols-outlined">download</span>
              Relatório
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function MapaTab() {
  const { farmData } = useFarm()

  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)

  const isDrawingRef = useRef(false)
  const currentPointsRef = useRef([])

  const polygonsRef = useRef({})
  const zoneLayersRef = useRef([])
  const baseLayerRef = useRef(null)
  const webodmLayerRef = useRef(null)
  const orthophotoLayerRef = useRef(null)
  const webodmServiceRef = useRef(null)
  const lineRef = useRef(null)
  const tooltipRef = useRef(null)
  const markersRef = useRef([])
  const searchMarkerRef = useRef(null)

  const [areas, setAreas] = useState([])
  const [selectedAreaId, setSelectedAreaId] = useState(null)
  const [visibleAreasCount, setVisibleAreasCount] = useState(3)
  const [activeWebODMLayer, setActiveWebODMLayer] = useState("detections")
  const [webodmConfig, setWebodmConfig] = useState(null)
  const [webodmAnalysis, setWebodmAnalysis] = useState(null)
  const [webodmLoading, setWebodmLoading] = useState(false)
  const [webodmError, setWebodmError] = useState("")
  const [orthophotoLayerEnabled, setOrthophotoLayerEnabled] = useState(true)
  const [mapStyle, setMapStyle] = useState("satellite")
  const [layersOpen, setLayersOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [areaFilter, setAreaFilter] = useState("all")
  const [openAreaMenuId, setOpenAreaMenuId] = useState(null)
  const [selectedTalhaoId, setSelectedTalhaoId] = useState(null)
  const [diagnosticHistory, setDiagnosticHistory] = useState([])
  const [employees, setEmployees] = useState([])
  const [isMobileMap, setIsMobileMap] = useState(() => (
    typeof window !== "undefined" && window.matchMedia(MOBILE_MAP_QUERY).matches
  ))

  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingMode, setDrawingMode] = useState("area")
  const [currentPoints, setCurrentPoints] = useState([])
  const [currentArea, setCurrentArea] = useState(0)

  const [searchAddress, setSearchAddress] = useState("")
  const [searching, setSearching] = useState(false)

  const totalArea = areas.reduce((sum, a) => sum + (a.areaHa || 0), 0)
  const filteredAreas = areas.filter(area => matchesAreaFilter(area, areaFilter))
  const visibleAreas = filteredAreas.slice(0, visibleAreasCount)
  const hasMoreAreas = visibleAreasCount < filteredAreas.length
  const selectedArea = areas.find(area => area.id === selectedAreaId) || areas[areas.length - 1] || null
  const selectedAreaTalhoes = useMemo(() => {
    if (!selectedArea?.talhoes?.length) return []
    return selectedArea.talhoes
      .filter((talhao) => talhao.coordinates?.length >= 3)
      .map((talhao) => buildTalhaoView(selectedArea, talhao, diagnosticHistory))
  }, [selectedArea, diagnosticHistory])
  const selectedTalhao = selectedAreaTalhoes.find((talhao) => talhao.id === selectedTalhaoId) || selectedAreaTalhoes[0] || null
  const selectedWebODM = isMobileMap ? null : webodmAnalysis
  const webodmConfigured = !isMobileMap
    && Boolean(webodmConfig)
    && Boolean(webodmServiceRef.current?.hasWebODMConfig(webodmConfig))

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_MAP_QUERY)
    const updateViewportMode = (event) => setIsMobileMap(event.matches)

    setIsMobileMap(mediaQuery.matches)
    mediaQuery.addEventListener?.("change", updateViewportMode)

    return () => mediaQuery.removeEventListener?.("change", updateViewportMode)
  }, [])

  useEffect(() => {
    let active = true

    if (isMobileMap) {
      webodmServiceRef.current = null
      setWebodmConfig(null)
      setWebodmAnalysis(null)
      setWebodmError("")
      return undefined
    }

    import("../../../services/webodmService").then(service => {
      if (!active) return
      webodmServiceRef.current = service
      setWebodmConfig(service.getStoredWebODMConfig())
    })

    return () => {
      active = false
    }
  }, [isMobileMap])

  useEffect(() => {
    isDrawingRef.current = isDrawing
  }, [isDrawing])

  useEffect(() => {
    setDiagnosticHistory(readStoredList("diagnosticHistory"))

    const handleStorage = (event) => {
      if (event.key === "diagnosticHistory") {
        setDiagnosticHistory(readStoredList("diagnosticHistory"))
      }
    }

    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [])

  useEffect(() => {
    let active = true

    async function loadEmployees() {
      try {
        const ownerId = auth.currentUser?.uid
        if (!ownerId) {
          if (active) setEmployees([])
          return
        }

        const employeesSnap = await getDocs(
          query(collection(db, "employees"), where("ownerId", "==", ownerId))
        )
        const nextEmployees = employeesSnap.docs
          .filter((docSnap) => {
            const data = docSnap.data()
            return (
              (data.role === ACCOUNT_ROLES.EMPLOYEE || data.role === ACCOUNT_ROLES.COLLABORATOR) &&
              data.archived !== true &&
              data.accessStatus !== "blocked"
            )
          })
          .map((docSnap) => {
            const data = docSnap.data()
            return {
              id: docSnap.id,
              name: data.name || data.email || "Funcionário",
            }
          })

        if (active) setEmployees(nextEmployees)
      } catch (error) {
        console.error("Erro ao carregar funcionários para os talhões:", error)
        if (active) setEmployees([])
      }
    }

    loadEmployees()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const validTalhoes = selectedArea?.talhoes?.filter((talhao) => talhao.coordinates?.length >= 3) || []

    if (!validTalhoes.length) {
      setSelectedTalhaoId(null)
      return
    }

    const exists = validTalhoes.some((talhao) => talhao.id === selectedTalhaoId)
    if (!exists) setSelectedTalhaoId(validTalhoes[0].id)
  }, [selectedArea?.id, selectedArea?.talhoes, selectedTalhaoId])

  useEffect(() => {
    currentPointsRef.current = currentPoints
  }, [currentPoints])

  const connectWebODM = async () => {
    if (isMobileMap) return

    const webodmService = webodmServiceRef.current

    if (!webodmService || !webodmConfigured) {
      setWebodmError("WebODM ainda não foi configurado no ambiente do projeto.")
      return
    }

    setWebodmLoading(true)
    setWebodmError("")

    try {
      const analysis = await webodmService.loadWebODMAnalysis(webodmConfig)
      setWebodmAnalysis(analysis)

      if (analysis.bounds && mapInstanceRef.current) {
        const bounds = analysis.bounds.bounds || analysis.bounds
        if (Array.isArray(bounds) && bounds.length >= 2) {
          mapInstanceRef.current.fitBounds(bounds)
        }
      }
    } catch (error) {
      setWebodmAnalysis(null)
      setWebodmError(error.message || "Não foi possível conectar ao WebODM.")
    } finally {
      setWebodmLoading(false)
    }
  }

  useEffect(() => {
    if (!isMobileMap && webodmConfigured) {
      connectWebODM()
    }
  }, [isMobileMap, webodmConfigured])

  // carregar áreas
  useEffect(() => {
    const saved = localStorage.getItem("farmPolygons")
    if (saved) {
      try {
        setAreas(JSON.parse(saved))
      } catch {
        setAreas([])
      }
    }
  }, [])

  const saveAreas = (newAreas) => {
    setAreas(newAreas)
    localStorage.setItem("farmPolygons", JSON.stringify(newAreas))
  }

  const startTalhaoDrawing = () => {
    if (!selectedArea) return

    setDrawingMode("talhao")
    setIsDrawing(true)
    setCurrentPoints([])
    currentPointsRef.current = []
    setCurrentArea(0)
    window.setTimeout(() => {
      document.querySelector(".mapa-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 0)
  }

  const assignEmployeeToTalhao = (talhaoId, employeeId) => {
    if (!selectedArea) return

    const employee = employees.find((item) => item.id === employeeId)
    const nextAreas = areas.map((area) => {
      if (area.id !== selectedArea.id) return area

      return {
        ...area,
        talhoes: (area.talhoes || []).map((talhao) => (
          talhao.id === talhaoId
            ? {
                ...talhao,
                employeeId,
                employeeName: employee?.name || "",
              }
            : talhao
        )),
      }
    })

    saveAreas(nextAreas)
    setSelectedTalhaoId(talhaoId)
  }

  // deletar área
  const deleteArea = (id) => {
    const confirmDelete = window.confirm("Tem certeza que deseja excluir essa área?")
    if (!confirmDelete) return

    const newAreas = areas.filter(area => area.id !== id)

    setAreas(newAreas)
    localStorage.setItem("farmPolygons", JSON.stringify(newAreas))

    if (selectedAreaId === id) {
      setSelectedAreaId(null)
    }

    if (polygonsRef.current[id]) {
      polygonsRef.current[id].remove()
      delete polygonsRef.current[id]
    }
  }

  // cancelar desenho
  const cancelDrawing = () => {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    if (lineRef.current) {
      mapInstanceRef.current.removeLayer(lineRef.current)
      lineRef.current = null
    }

    if (tooltipRef.current) {
      mapInstanceRef.current.removeLayer(tooltipRef.current)
      tooltipRef.current = null
    }

    setIsDrawing(false)
    setDrawingMode("area")
    setCurrentPoints([])
    currentPointsRef.current = []
    setCurrentArea(0)
  }

  // desenhar áreas
  useEffect(() => {
    if (!mapInstanceRef.current) return

    Object.values(polygonsRef.current).forEach(p => p.remove())
    polygonsRef.current = {}
    zoneLayersRef.current.forEach(layer => layer.remove())
    zoneLayersRef.current = []

    areas.forEach(area => {
      if (!matchesAreaFilter(area, areaFilter)) return
      
      if (!area.coordinates || area.coordinates.length < 3) return

      const polygon = L.polygon(area.coordinates, {
        color: area.color || "#3d8057",
        fillColor: area.color || "#3d8057",
        fillOpacity: 0.25,
        weight: 2,
        smoothFactor: 1
      })

      polygon.on("click", () => {
        setSelectedAreaId(area.id)

        const center = polygon.getBounds().getCenter()

        // ✅ monta HTML das zonas
        let zonesHtml = ""

        if (area.zones && area.zones.length > 0) {
          zonesHtml = area.zones.map(zone => `
            <div style="
              background:${zone.color};
              padding:6px;
              border-radius:8px;
              margin-top:6px;
              font-size:12px;
            ">
              📍 ${zone.status}
            </div>
          `).join("")
        }

        L.popup()
          .setLatLng(center)
          .setContent(`
            <div style="
              background:${area.color || "#3d8057"};
              padding:10px 12px;
              border-radius:12px;
              color:#fff;
              font-weight:600;
              font-size:14px;
              font-family:'Inter', sans-serif;
              min-width:160px;
            ">
              🌱 Área: ${formatArea(area.areaHa)}<br/>
              📊 Status: ${area.status || "Saudável"}
              ${zonesHtml}
            </div>
          `)
          .openOn(mapInstanceRef.current)
      })

      polygon.addTo(mapInstanceRef.current)
      polygonsRef.current[area.id] = polygon

      const talhoes = area.talhoes?.filter((talhao) => talhao.coordinates?.length >= 3) || []
      talhoes.forEach((talhao) => {
        const talhaoView = buildTalhaoView(area, talhao, diagnosticHistory)
        const isSelected = selectedTalhaoId === talhao.id
        const talhaoPolygon = L.polygon(talhao.coordinates, {
          color: talhaoView.color,
          fillColor: talhaoView.color,
          fillOpacity: isSelected ? 0.36 : 0.22,
          weight: isSelected ? 3 : 2,
          dashArray: talhaoView.score == null ? "6 6" : null,
        }).addTo(mapInstanceRef.current)

        talhaoPolygon.on("click", (event) => {
          if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent)
          setSelectedAreaId(area.id)
          setSelectedTalhaoId(talhao.id)
        })

        talhaoPolygon.bindTooltip(talhao.label, {
          permanent: true,
          direction: "center",
          className: "talhao-map-label",
        })

        zoneLayersRef.current.push(talhaoPolygon)
      })
    })
  }, [areas, areaFilter, diagnosticHistory, selectedTalhaoId])

  // destaque
  useEffect(() => {
    Object.entries(polygonsRef.current).forEach(([id, polygon]) => {
      polygon.setStyle({
        color: Number(id) === selectedAreaId ? "#56a870" : (areas.find(a => a.id == id)?.color || "#3d8057"),
        fillOpacity: Number(id) === selectedAreaId ? 0.4 : 0.25,
        weight: Number(id) === selectedAreaId ? 3 : 2
      })
    })
  }, [selectedAreaId, areas])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (webodmLayerRef.current) {
      webodmLayerRef.current.remove()
      webodmLayerRef.current = null
    }

    if (!selectedWebODM) return

    const layerGroup = L.layerGroup().addTo(map)
    webodmLayerRef.current = layerGroup

    selectedWebODM.detections.forEach((item) => {
      const popupHtml = `
        <div style="font-family:Inter,sans-serif;min-width:190px">
          <strong style="color:${item.color};font-size:14px">${item.label}</strong>
          <p style="margin:6px 0;color:#33433a">Severidade: ${item.severity}%</p>
          <p style="margin:6px 0;color:#33433a">Área afetada: ${formatArea(item.affectedHa)}</p>
          <p style="margin:6px 0;color:#33433a">Confiança IA: ${item.confidence}%</p>
        </div>
      `

      if (item.polygon?.length >= 3) {
        const fillOpacity = activeWebODMLayer === "heatmap"
          ? Math.min(0.72, 0.24 + item.severity / 150)
          : activeWebODMLayer === "prescription"
            ? 0.42
            : 0.28

        L.polygon(item.polygon, {
          color: item.color,
          fillColor: item.color,
          fillOpacity,
          weight: activeWebODMLayer === "detections" ? 2 : 1,
          dashArray: activeWebODMLayer === "prescription" ? "6 6" : null,
        }).addTo(layerGroup).bindPopup(popupHtml)
      }

      if (activeWebODMLayer === "detections" || activeWebODMLayer === "route") {
        L.circleMarker(item.center, {
          radius: 7,
          color: "#ffffff",
          fillColor: item.color,
          fillOpacity: 1,
          weight: 2,
        }).addTo(layerGroup).bindPopup(popupHtml)
      }
    })

    if (activeWebODMLayer === "route" && selectedWebODM.route.length > 1) {
      L.polyline(selectedWebODM.route, {
        color: "#111827",
        weight: 4,
        opacity: 0.86,
        dashArray: "10 10",
      }).addTo(layerGroup)

      selectedWebODM.route.forEach((point, index) => {
        L.marker(point, {
          icon: L.divIcon({
            className: "webodm-route-marker",
            html: `<span>${index + 1}</span>`,
          })
        }).addTo(layerGroup)
      })
    }

    return () => {
      layerGroup.remove()
      if (webodmLayerRef.current === layerGroup) {
        webodmLayerRef.current = null
      }
    }
  }, [selectedWebODM, activeWebODMLayer])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (orthophotoLayerRef.current) {
      orthophotoLayerRef.current.remove()
      orthophotoLayerRef.current = null
    }

    const webodmService = webodmServiceRef.current
    if (isMobileMap || !webodmService || !orthophotoLayerEnabled || !selectedWebODM?.orthophotoTiles) return

    const tileUrl = webodmService.getTileUrl(
      selectedWebODM.config,
      selectedWebODM.projectId,
      selectedWebODM.taskId,
      "orthophoto"
    )

    const AuthTileLayer = L.GridLayer.extend({
      createTile(coords, done) {
        const tile = document.createElement("img")
        const url = L.Util.template(tileUrl, {
          z: coords.z,
          x: coords.x,
          y: coords.y,
        })

        tile.alt = ""
        tile.setAttribute("role", "presentation")

        fetch(url, {
          headers: selectedWebODM.config.token
            ? { Authorization: `JWT ${selectedWebODM.config.token}` }
            : {},
        })
          .then(response => {
            if (!response.ok) throw new Error(`Tile ${response.status}`)
            return response.blob()
          })
          .then(blob => {
            const objectUrl = URL.createObjectURL(blob)
            tile.onload = () => URL.revokeObjectURL(objectUrl)
            tile.src = objectUrl
            done(null, tile)
          })
          .catch(error => done(error, tile))

        return tile
      }
    })

    orthophotoLayerRef.current = new AuthTileLayer({
      opacity: 0.84,
      tileSize: 256,
      maxZoom: 22,
      zIndex: 350,
    }).addTo(map)

    return () => {
      if (orthophotoLayerRef.current) {
        orthophotoLayerRef.current.remove()
        orthophotoLayerRef.current = null
      }
    }
  }, [selectedWebODM, orthophotoLayerEnabled, isMobileMap])

  const addPoint = (latlng) => {
    if (!isDrawingRef.current || !mapInstanceRef.current) return

    const newPoints = [...currentPointsRef.current, latlng]
    setCurrentPoints(newPoints)

    const marker = L.circleMarker(latlng, {
      radius: 5,
      color: "#3d8057",
      fillColor: "#56a870",
      fillOpacity: 1,
      weight: 2
    }).addTo(mapInstanceRef.current)

    markersRef.current.push(marker)

    if (lineRef.current) {
      mapInstanceRef.current.removeLayer(lineRef.current)
    }

    lineRef.current = L.polyline(newPoints, {
      color: "#3d8057",
      weight: 3,
      opacity: 0.8
    }).addTo(mapInstanceRef.current)

    if (newPoints.length >= 3) {
      const area = calculateArea(newPoints)
      setCurrentArea(area)

      if (tooltipRef.current) {
        mapInstanceRef.current.removeLayer(tooltipRef.current)
      }

      tooltipRef.current = L.marker(newPoints[0], {
        icon: L.divIcon({
          html: `<div style="background:#3d8057;padding:6px 12px;border-radius:10px;color:#fff;font-weight:600;font-size:12px;">
            ${formatArea(area)}
          </div>`
        })
      }).addTo(mapInstanceRef.current)
    }
  }

  const startDrawing = () => {
    setDrawingMode("area")
    setIsDrawing(true)
    setCurrentPoints([])
    currentPointsRef.current = []
    setCurrentArea(0)
  }

  const finishDrawing = () => {
    const points = currentPointsRef.current

    if (points.length < 3) {
      alert("Adicione pelo menos 3 pontos!")
      return
    }

    if (drawingMode === "talhao") {
      if (!selectedArea) {
        alert("Selecione uma área antes de demarcar um talhão.")
        return
      }

      const existingTalhoes = selectedArea.talhoes?.filter((talhao) => talhao.coordinates?.length >= 3) || []
      const talhaoIndex = existingTalhoes.length + 1
      const newTalhao = {
        id: `${selectedArea.id}-talhao-${Date.now()}`,
        label: `Talhão ${String(talhaoIndex).padStart(2, "0")}`,
        crop: "Soja",
        coordinates: points.map(p => [p.lat, p.lng]),
        areaHa: calculateArea(points),
        employeeId: "",
        employeeName: "",
        createdAt: new Date().toISOString(),
      }

      saveAreas(areas.map((area) => (
        area.id === selectedArea.id
          ? { ...area, talhoes: [...existingTalhoes, newTalhao] }
          : area
      )))
      setSelectedTalhaoId(newTalhao.id)
    } else {
      const statusData = getAreaStatus()

      const newArea = {
        id: Date.now(),
        coordinates: points.map(p => [p.lat, p.lng]),
        areaHa: calculateArea(points),
        status: statusData.label,
        color: statusData.color,
        talhoes: [],
      }

      saveAreas([...areas, newArea])
      setSelectedAreaId(newArea.id)
    }

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    if (lineRef.current) {
      mapInstanceRef.current.removeLayer(lineRef.current)
      lineRef.current = null
    }

    if (tooltipRef.current) {
      mapInstanceRef.current.removeLayer(tooltipRef.current)
      tooltipRef.current = null
    }

    setIsDrawing(false)
    setDrawingMode("area")
    setCurrentPoints([])
    currentPointsRef.current = []
    setCurrentArea(0)
  }

  const handleSearch = async (e) => {
    e.preventDefault()
    const query = searchAddress.trim()
    if (!query) return

    setSearching(true)

    try {
      const normalizedCep = normalizeCep(query)
      const containsOnlyCepCharacters = /^[\d.\-\s]+$/.test(query)

      if (containsOnlyCepCharacters && normalizedCep.length !== 8) {
        throw new Error("Digite um CEP válido com 8 números")
      }

      const location = normalizedCep.length === 8 && containsOnlyCepCharacters
        ? await resolveCepLocation(normalizedCep)
        : await geocodeAddress(query)

      if (!location) throw new Error("Endereço não encontrado")
      if (!mapInstanceRef.current) throw new Error("O mapa ainda está carregando")

      const { lat, lng, addressLabel } = location
      mapInstanceRef.current.setView([lat, lng], 16, { animate: true })

      if (searchMarkerRef.current) {
        searchMarkerRef.current.remove()
      }

      searchMarkerRef.current = L.marker([lat, lng])
        .addTo(mapInstanceRef.current)
        .bindTooltip(addressLabel, {
          permanent: true,
          direction: "top",
          offset: [0, -34],
          className: "cep-address-tooltip",
        })
        .openTooltip()

    } catch (error) {
      console.error("Erro ao buscar localização:", error)
      alert(error instanceof Error ? error.message : "Erro ao buscar localização")
    } finally {
      setSearching(false)
    }
  }

  const locateUser = () => {
    if (!navigator.geolocation || !mapInstanceRef.current) {
      alert("Localização indisponível neste dispositivo")
      return
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const position = [coords.latitude, coords.longitude]
        mapInstanceRef.current.setView(position, 17)
        L.circleMarker(position, {
          radius: 7,
          color: "#ffffff",
          fillColor: "#2d6140",
          fillOpacity: 1,
          weight: 3,
        }).addTo(mapInstanceRef.current).bindPopup("Sua localização").openPopup()
      },
      () => alert("Não foi possível acessar sua localização"),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    const map = L.map(mapContainerRef.current).setView([-15, -47], 4)
    mapInstanceRef.current = map

    map.on("click", (e) => {
      if (isDrawingRef.current) addPoint(e.latlng)
    })

    map.on("dblclick", () => {
      if (isDrawingRef.current) finishDrawing()
    })

    setTimeout(() => map.invalidateSize(), 200)

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (baseLayerRef.current) {
      baseLayerRef.current.remove()
    }

    const tileUrl = mapStyle === "streets"
      ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

    baseLayerRef.current = L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: mapStyle === "streets" ? "© OpenStreetMap" : "Tiles © Esri",
    }).addTo(map)
    baseLayerRef.current.bringToBack()

    return () => {
      if (baseLayerRef.current) {
        baseLayerRef.current.remove()
        baseLayerRef.current = null
      }
    }
  }, [mapStyle])

  const focusWebODMRoute = () => {
    if (!selectedWebODM?.route?.length || !mapInstanceRef.current) return

    setActiveWebODMLayer("route")
    mapInstanceRef.current.fitBounds(L.latLngBounds(selectedWebODM.route), {
      padding: [48, 48],
      maxZoom: 18,
    })
  }

  const exportWebODMReport = () => {
    if (!selectedWebODM) return

    const report = {
      area: {
        id: selectedArea?.id || null,
        tamanho: selectedArea ? formatArea(selectedArea.areaHa) : null,
        status: selectedArea?.status || null,
      },
      webodm: selectedWebODM,
    }

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `relatorio-webodm-task-${selectedWebODM.taskId}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const focusAreaOnMap = (area) => {
    setSelectedAreaId(area.id)
    const polygon = polygonsRef.current[area.id]

    if (polygon && mapInstanceRef.current) {
      mapInstanceRef.current.fitBounds(polygon.getBounds(), { padding: [24, 24] })
    }

    document.querySelector(".mapa-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const startNewArea = () => {
    startDrawing()
    document.querySelector(".mapa-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div className="mapa-container mapa-dashboard">
      <section className="mapa-hero">
        <header className="mapa-header">
          <h1>Mapa da Fazenda</h1>
          <p>Visualize e gerencie sua área</p>
        </header>

        <div className="total-area-badge">
          <span>Área total mapeada</span>
          <strong>{formatArea(totalArea)}</strong>
          {!isDrawing && (
            <button type="button" className="draw-area-btn" onClick={startDrawing}>
              <span className="material-symbols-outlined" aria-hidden="true">edit_location_alt</span>
              Desenhar área
            </button>
          )}
        </div>
      </section>

      {isDrawing && (
        <div className="drawing-controls">
          <div className="drawing-info">
            <span className="info-badge">{drawingMode === "talhao" ? "Demarcando talhão" : "Demarcando área"}</span>
            <span className="info-points">{currentPoints.length} pontos</span>
            <strong className="info-area">{formatArea(currentArea)}</strong>
          </div>
          <div className="drawing-buttons">
            <button type="button" onClick={finishDrawing} className="finish-draw-btn">
              <span className="material-symbols-outlined" aria-hidden="true">check</span>
              Finalizar
            </button>
            <button type="button" onClick={cancelDrawing} className="cancel-draw-btn">
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <section className="mapa-workspace" aria-label="Mapa e controles da fazenda">
        <div className="mapa-toolbar">
          <form className="mapa-search" onSubmit={handleSearch}>
            <span className="material-symbols-outlined search-icon" aria-hidden="true">search</span>
            <input
              type="search"
              aria-label="Buscar por CEP ou endereço"
              placeholder="Digite CEP ou endereço..."
              value={searchAddress}
              onChange={(e) => setSearchAddress(e.target.value)}
            />
            <button type="submit" className="search-btn" aria-label="Buscar endereço" disabled={searching}>
              <span className="material-symbols-outlined" aria-hidden="true">
                {searching ? "progress_activity" : "arrow_forward"}
              </span>
            </button>
          </form>

          <div className="map-filter-wrap">
            <button
              type="button"
              className={`map-filter-button ${filtersOpen ? "is-active" : ""}`}
              onClick={() => setFiltersOpen(open => !open)}
              aria-expanded={filtersOpen}
            >
              <span className="material-symbols-outlined" aria-hidden="true">filter_alt</span>
              Filtros
            </button>
            {filtersOpen && (
              <div className="map-filter-menu" role="menu" aria-label="Filtrar áreas por situação">
                {[
                  ["all", "Todas"],
                  ["healthy", "Saudáveis"],
                  ["warning", "Atenção"],
                  ["critical", "Críticas"],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={areaFilter === value}
                    className={areaFilter === value ? "is-selected" : ""}
                    key={value}
                    onClick={() => {
                      setAreaFilter(value)
                      setFiltersOpen(false)
                    }}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {areaFilter === value ? "radio_button_checked" : "radio_button_unchecked"}
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mapa-area">
          <div ref={mapContainerRef} className="map-container"></div>

          {isDrawing && (
            <div className="map-drawing-actions" aria-label="Ações da demarcação">
              <button
                type="button"
                onClick={finishDrawing}
                className="map-drawing-finish"
                disabled={currentPoints.length < 3}
              >
                <span className="material-symbols-outlined" aria-hidden="true">check</span>
                Finalizar
              </button>
              <button type="button" onClick={cancelDrawing} className="map-drawing-cancel">
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
                Cancelar
              </button>
            </div>
          )}

          <div className="map-quick-controls" aria-label="Controles rápidos do mapa">
            <button type="button" onClick={locateUser} title="Minha localização" aria-label="Ir para minha localização">
              <span className="material-symbols-outlined" aria-hidden="true">my_location</span>
            </button>
          </div>

          <div className="map-layers-control">
            <button
              type="button"
              className="map-layers-button"
              onClick={() => setLayersOpen(open => !open)}
              aria-expanded={layersOpen}
            >
              <span className="material-symbols-outlined" aria-hidden="true">layers</span>
              Camadas
            </button>
            {layersOpen && (
              <div className="map-layers-menu" role="menu" aria-label="Camadas do mapa">
                <button
                  type="button"
                  className={mapStyle === "satellite" ? "is-selected" : ""}
                  onClick={() => {
                    setMapStyle("satellite")
                    setLayersOpen(false)
                  }}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">satellite_alt</span>
                  Satélite
                </button>
                <button
                  type="button"
                  className={mapStyle === "streets" ? "is-selected" : ""}
                  onClick={() => {
                    setMapStyle("streets")
                    setLayersOpen(false)
                  }}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">map</span>
                  Ruas
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mapa-selection-summary">
          <span className="mapa-selection-icon material-symbols-outlined" aria-hidden="true">psychiatry</span>
          <div>
            <small>{selectedArea ? "Área selecionada" : "Nenhuma área selecionada"}</small>
            <strong>{selectedArea ? formatArea(selectedArea.areaHa) : "Desenhe uma área"}</strong>
            {selectedArea && <span>Perímetro {calculatePerimeter(selectedArea.coordinates).toFixed(0)} m</span>}
          </div>
          <button
            type="button"
            disabled={!selectedArea}
            onClick={selectedAreaTalhoes.length > 0
              ? () => document.querySelector(".talhoes-section")?.scrollIntoView({ behavior: "smooth", block: "start" })
              : startTalhaoDrawing}
          >
            {selectedAreaTalhoes.length > 0 ? "Ver talhões" : "Adicionar talhão"}
            <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      </section>

      {selectedArea && (
        <section className="talhoes-section" aria-label="Talhões da área selecionada">
          <div className="talhoes-header">
            <div>
              <span>Talhões</span>
              <strong>{selectedAreaTalhoes.length > 0 ? `${formatArea(selectedArea.areaHa)} total` : "Área ainda não dividida"}</strong>
            </div>
            <button type="button" onClick={startTalhaoDrawing}>
              <span className="material-symbols-outlined" aria-hidden="true">add_location_alt</span>
              Adicionar talhão
            </button>
          </div>

          {selectedAreaTalhoes.length === 0 ? (
            <div className="talhoes-empty-card">
              <span className="material-symbols-outlined" aria-hidden="true">grid_view</span>
              <div>
                <strong>Separe esta área em talhões</strong>
                <p>Toque em Adicionar talhão, marque os pontos no mapa e finalize a demarcação manualmente.</p>
              </div>
            </div>
          ) : (
            <div className="talhoes-cards">
              {selectedAreaTalhoes.map((talhao) => (
                <article
                  key={talhao.id}
                  className={`talhao-card ${selectedTalhao?.id === talhao.id ? "is-selected" : ""} ${talhao.tone}`}
                  style={{ "--talhao-color": talhao.color }}
                  onClick={() => setSelectedTalhaoId(talhao.id)}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      setSelectedTalhaoId(talhao.id)
                    }
                  }}
                >
                  <div className="talhao-card-main">
                    <div>
                      <strong>{talhao.label}</strong>
                      <span>{talhao.crop} · {formatArea(talhao.areaHa)}</span>
                    </div>
                    <em>{talhao.status}</em>
                  </div>

                  <div className="talhao-card-meta">
                    <span>{talhao.employeeName}</span>
                    <span>{talhao.latestTitle}</span>
                  </div>

                  <label className="talhao-assignee">
                    <span>Responsável</span>
                    <select
                      value={talhao.employeeId || ""}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => assignEmployeeToTalhao(talhao.id, event.target.value)}
                    >
                      <option value="">Selecionar funcionário</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>{employee.name}</option>
                      ))}
                    </select>
                  </label>

                  <div className="talhao-card-progress">
                    <span style={{ width: `${talhao.score ?? 0}%` }}></span>
                  </div>

                  <div className="talhao-card-footer">
                    <small>{talhao.diagnosticsCount > 0 ? `${talhao.diagnosticsCount} imagem(ns) analisada(s)` : "Aguardando envio de imagens"}</small>
                    <b>{talhao.score == null ? "--" : `${talhao.score}%`}</b>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {!isMobileMap && (
        <WebODMPanel
          analysis={selectedWebODM}
          configured={webodmConfigured}
          loading={webodmLoading}
          error={webodmError}
          activeLayer={activeWebODMLayer}
          orthophotoEnabled={orthophotoLayerEnabled}
          onConnect={connectWebODM}
          onLayerChange={setActiveWebODMLayer}
          onOrthophotoToggle={setOrthophotoLayerEnabled}
          onFocusRoute={focusWebODMRoute}
          onExportReport={exportWebODMReport}
        />
      )}

      <div className="areas-grid">
        <div className="areas-header">
          <h3>
            <span className="material-symbols-outlined" aria-hidden="true">psychiatry</span>
            Áreas cadastradas
          </h3>
          <span className="areas-count">{filteredAreas.length} área(s)</span>
        </div>

        {filteredAreas.length === 0 ? (
          <div className="empty-areas">
            <div className="empty-icon material-symbols-outlined">map</div>
            <p>{areas.length === 0 ? "Nenhuma área desenhada ainda" : "Nenhuma área encontrada neste filtro"}</p>
            <span>{areas.length === 0 ? "Use Desenhar área para começar" : "Selecione outro filtro para visualizar suas áreas"}</span>
          </div>
        ) : (
          <>
            <div className="areas-cards">
              {visibleAreas.map((area) => (
                <div
                  key={area.id}
                  className={`area-card-modern ${selectedAreaId === area.id ? "selected" : ""}`}
                  style={{ "--area-status-color": area.color || "#56a870" }}
                >
                  <div className="card-header">
                    <div className="card-icon">
                      <span className="material-symbols-outlined" aria-hidden="true">psychiatry</span>
                    </div>
                    <div className="card-title">
                      <h4>Área #{String(area.id).slice(-6)}</h4>
                      <span className="card-date">
                        <span className="material-symbols-outlined" aria-hidden="true">calendar_month</span>
                        {new Date(area.id).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <div className="area-card-menu-wrap">
                      <button
                        type="button"
                        className="area-card-menu-button"
                        aria-label={`Opções da área ${String(area.id).slice(-6)}`}
                        aria-expanded={openAreaMenuId === area.id}
                        onClick={() => setOpenAreaMenuId(current => current === area.id ? null : area.id)}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">more_vert</span>
                      </button>
                      {openAreaMenuId === area.id && (
                        <div className="area-card-menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => {
                            setOpenAreaMenuId(null)
                            focusAreaOnMap(area)
                          }}>
                            <span className="material-symbols-outlined" aria-hidden="true">visibility</span>
                            Ver no mapa
                          </button>
                          <button type="button" role="menuitem" className="is-danger" onClick={() => {
                            setOpenAreaMenuId(null)
                            deleteArea(area.id)
                          }}>
                            <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="card-stats">
                    <div className="stat">
                      <span className="stat-label">Tamanho</span>
                      <span className="stat-value">{formatArea(area.areaHa)}</span>
                    </div>
                    <div className="stat-divider"></div>
                    <div className="stat">
                      <span className="stat-label">Status</span>
                      <span className="stat-value">
                        <span className="status-dot"></span>
                        {area.status || "Saudável"}
                      </span>
                    </div>
                  </div>

                  <div className="card-footer-actions">
                    <button
                      className="view-btn"
                      onClick={() => focusAreaOnMap(area)}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">visibility</span>
                      Ver no mapa
                    </button>
                    <button
                      className="delete-btn-modern"
                      onClick={() => deleteArea(area.id)}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {hasMoreAreas && (
              <button
                className="show-more-areas-btn"
                onClick={() => setVisibleAreasCount(count => count + 3)}
              >
                Ver mais áreas
                <span>{filteredAreas.length - visibleAreasCount} restante(s)</span>
              </button>
            )}
          </>
        )}

        <button
          type="button"
          className="add-area-card"
          onClick={startNewArea}
          disabled={isDrawing}
        >
          <span className="add-area-icon material-symbols-outlined" aria-hidden="true">add</span>
          <span>
            <strong>{isDrawing ? "Desenho em andamento" : "Cadastrar nova área"}</strong>
            <small>Delimite uma nova área no mapa</small>
          </span>
          <span className="add-area-decoration material-symbols-outlined" aria-hidden="true">psychiatry</span>
        </button>
      </div>
    </div>
  )
}
