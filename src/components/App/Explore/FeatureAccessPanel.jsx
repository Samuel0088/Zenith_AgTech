import "../../../styles/App/FeatureAccessPanel.css"

const FEATURE_NAMES = {
  diagnosis: "análise da soja por IA",
  monitoring: "monitoramento da plantação"
}

export default function FeatureAccessPanel({ feature, access }) {
  if (access.fullAccess) return null

  if (access.loading) {
    return <div className="feature-access-panel" role="status">Verificando análises disponíveis...</div>
  }

  if (access.error) {
    return (
      <section className="feature-access-panel feature-access-panel--blocked" role="alert">
        <div><strong>Acesso temporariamente indisponível</strong><p>{access.error}</p></div>
        <button type="button" onClick={access.refresh}>Tentar novamente</button>
      </section>
    )
  }

  if (access.remaining > 0) {
    return (
      <aside className="feature-access-panel" aria-label="Análises disponíveis hoje">
        <span className="material-symbols-outlined" aria-hidden="true">schedule</span>
        <div><strong>Limite diário</strong><p>{access.remaining} de 3 {access.remaining === 1 ? "análise disponível" : "análises disponíveis"} hoje para {FEATURE_NAMES[feature]}.</p></div>
      </aside>
    )
  }

  return (
    <section className="feature-access-panel feature-access-panel--blocked" role="status">
      <span className="material-symbols-outlined" aria-hidden="true">lock_clock</span>
      <div><strong>Limite diário alcançado</strong><p>Você já usou as 3 análises de {FEATURE_NAMES[feature]} hoje. Novas análises ficam disponíveis amanhã.</p></div>
    </section>
  )
}
