import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { onAuthStateChanged } from "../../services/supabase"

import {
  ShieldCheck,
  Radar,
  TrendingUp,
  ArrowRight,
 Sparkles,
  ScanSearch,
  MonitorSmartphone,
} from "lucide-react"

import "../../styles/App/Intro.css"

const Logo = "/assets/image/Logo-redonda.png"

export default function Intro() {

  const navigate = useNavigate()
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged((user) => {
      if (user) {
        navigate("/home", { replace: true })
        return
      }

      setCheckingAuth(false)
    })

    return unsubscribe
  }, [navigate])

  if (checkingAuth) return null

  return (

    <main className="intro" data-system-bar-color="#07110b">

      {/* BACKGROUND */}
      <div className="intro-bg">

        <div className="intro-overlay" />

        <div className="intro-gradient" />

      </div>

      {/* HERO */}
      <section className="intro-hero">

        {/* BADGE */}
        <div className="intro-badge">

          <ScanSearch size={14} />

          <span>
            Drone agrícola com inteligência artificial
          </span>

        </div>

        {/* CONTENT */}
        <div className="intro-content">

          {/* TEXT */}
          <div className="intro-text">

            <h1>

              Monitoramento

              <span>
                Inteligente</span>

            </h1>

            {/* MINI LABEL */}
            <div className="intro-mini-label">

              <span className="mini-line" />

              <p>
                Tecnologia aérea inteligente para
                análise agrícola em tempo real
              </p>

            </div>

            {/* DESCRIPTION */}
            <p className="intro-description">

              Plataforma agrícola com drones inteligentes,
              monitoramento contínuo e análise avançada
              para proteção de lavouras de alta precisão.

            </p>

          </div>

          {/* FEATURES */}
          <div className="intro-features">

            <div className="feature-chip">

              <ShieldCheck size={15} />

              <span>
                Alta precisão
              </span>

            </div>

            <div className="feature-chip">

              <Radar size={15} />

              <span>
                Tempo real
              </span>

            </div>

            <div className="feature-chip">

              <TrendingUp size={15} />

              <span>
                Menos perdas
              </span>

            </div>

          </div>

          {/* ACTIONS */}
          <div className="intro-actions">

            <button
              className="btn-primary"
              onClick={() => navigate("/register")}
            >

              <Sparkles size={18} />

              <span>
                Começar agora
              </span>

              <ArrowRight size={18} />

            </button>

            <button
              className="btn-secondary"
              onClick={() => navigate("/login")}
            >

              <MonitorSmartphone size={18} />

              <span>
                Já tenho conta
              </span>

            </button>

          </div>

          {/* CARD */}
          <div className="intro-card">

            <div className="intro-card-logo">

              <img
                src={Logo}
                alt="Zenith Logo"
                draggable="false"
              />

            </div>

            <div>

              <h3>
                Zenith
              </h3>

              <p>
                Plataforma inteligente de drones agrícolas
                para monitoramento e proteção de lavouras.
              </p>

            </div>

          </div>

        </div>

      </section>

    </main>

  )

}
