import { useEffect, useMemo } from "react"
import "../../../../styles/App/BatchDiagnosis.css"

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB"
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

export default function BatchImagePreview({
  images,
  notice,
  onAddImages,
  onRemoveImage,
  onBack,
  onAnalyze,
  addImagesLabel = "Adicionar fotos",
  addImagesIcon = "add_photo_alternate",
  addTileTitle = "Adicionar",
  addTileSubtitle = "mais imagens"
}) {
  const totalSize = useMemo(
    () => images.reduce((total, image) => total + (image.file?.size || 0), 0),
    [images]
  )

  useEffect(() => {
    const menuBar = document.querySelector(".nav, .menu-bar")
    const previousOverflow = document.body.style.overflow
    if (menuBar) menuBar.style.display = "none"
    document.body.style.overflow = "hidden"

    return () => {
      if (menuBar) menuBar.style.display = "flex"
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <div className="batch-modal-shell" role="dialog" aria-modal="true" aria-labelledby="batch-preview-title">
      <section className="batch-preview-card">
        <header className="batch-preview-header">
          <div className="batch-heading-group">
            <div className="batch-heading-icon" aria-hidden="true">
              <span className="material-symbols-outlined">flight_takeoff</span>
            </div>
            <div>
              <span className="batch-eyebrow">MISSÃO DE MAPEAMENTO</span>
              <h1 id="batch-preview-title">Fotos prontas para análise</h1>
              <p>Revise o lote antes de enviar as imagens para a inteligência artificial.</p>
            </div>
          </div>

          <div className="batch-preview-stats" aria-label="Resumo dos arquivos">
            <div>
              <strong>{images.length}</strong>
              <span>{images.length === 1 ? "foto" : "fotos"}</span>
            </div>
            <div>
              <strong>{formatBytes(totalSize)}</strong>
              <span>tamanho total</span>
            </div>
            <div>
              <strong>{100 - images.length}</strong>
              <span>vagas no lote</span>
            </div>
          </div>
        </header>

        {notice?.text && (
          <div className={`batch-notice batch-notice-${notice.type || "info"}`} role="status">
            <span className="material-symbols-outlined">
              {notice.type === "warning" ? "warning" : "info"}
            </span>
            <span>{notice.text}</span>
          </div>
        )}

        <div className="batch-preview-toolbar">
          <div>
            <h2>Imagens selecionadas</h2>
            <p>JPG, PNG ou WEBP • máximo de 20 MB por foto</p>
          </div>
          <button type="button" className="batch-button batch-button-ghost" onClick={onAddImages}>
            <span className="material-symbols-outlined">{addImagesIcon}</span>
            {addImagesLabel}
          </button>
        </div>

        <div className="batch-thumbnail-grid">
          {images.map((image, index) => (
            <article className="batch-thumbnail-card" key={image.id}>
              <div className="batch-thumbnail-image">
                <img src={image.preview} alt={`Prévia de ${image.file.name}`} />
                <span className="batch-thumbnail-index">{String(index + 1).padStart(2, "0")}</span>
                <button
                  type="button"
                  className="batch-thumbnail-remove"
                  onClick={() => onRemoveImage(image.id)}
                  aria-label={`Remover ${image.file.name}`}
                  title="Remover foto"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="batch-thumbnail-meta">
                <strong title={image.file.name}>{image.file.name}</strong>
                <span>{formatBytes(image.file.size)}</span>
              </div>
            </article>
          ))}

          {images.length < 100 && (
            <button type="button" className="batch-add-tile" onClick={onAddImages}>
              <span className="material-symbols-outlined">{addImagesIcon}</span>
              <strong>{addTileTitle}</strong>
              <small>{addTileSubtitle}</small>
            </button>
          )}
        </div>

        <footer className="batch-preview-footer">
          <div className="batch-privacy-note">
            <span className="material-symbols-outlined">verified_user</span>
            <span>O lote será processado em uma única análise consolidada.</span>
          </div>
          <div className="batch-preview-actions">
            <button type="button" className="batch-button batch-button-secondary" onClick={onBack}>
              <span className="material-symbols-outlined">arrow_back</span>
              Cancelar
            </button>
            <button
              type="button"
              className="batch-button batch-button-primary"
              onClick={onAnalyze}
              disabled={images.length === 0}
            >
              <span className="material-symbols-outlined">auto_awesome</span>
              Analisar {images.length === 1 ? "foto" : `${images.length} fotos`}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
