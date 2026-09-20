import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { onAuthStateChanged } from "firebase/auth"
import {
  Activity,
  ArrowRight,
  Download,
  Globe2,
  LogIn,
  Radar,
  ShieldCheck,
  Smartphone,
} from "lucide-react"

import { auth } from "../../services/firebase"
import LoadingScreen from "../../components/App/Home/LoadingScreen"
import "../../styles/App/Intro.css"

const Logo = "/assets/image/Logo-redonda.png"
export const SITE_CHOICE_SESSION_KEY = "zenithContinueOnWebsite"

export default function Intro({ onInstallRequest, isInstalled = false }) {
  const navigate = useNavigate()
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [showAccessChoice, setShowAccessChoice] = useState(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true

    return !isStandalone && sessionStorage.getItem(SITE_CHOICE_SESSION_KEY) !== "true"
  })

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
          window.navigator.standalone === true
        const choseWebsite = sessionStorage.getItem(SITE_CHOICE_SESSION_KEY) === "true"

        if (isStandalone || isInstalled || choseWebsite) {
          navigate("/home", { replace: true })
          return
        }

        setShowAccessChoice(true)
        setCheckingAuth(false)
        return
      }

      setCheckingAuth(false)
    })

    return unsubscribe
  }, [isInstalled, navigate])

  useEffect(() => {
    if (isInstalled) setShowAccessChoice(false)
  }, [isInstalled])

  const continueOnWebsite = () => {
    sessionStorage.setItem(SITE_CHOICE_SESSION_KEY, "true")

    if (auth.currentUser) {
      navigate("/home", { replace: true })
      return
    }

    setShowAccessChoice(false)
  }

  if (checkingAuth) return <LoadingScreen />

  if (showAccessChoice) {
    return (
      <main className="access-choice" data-system-bar-color="#123b27">
        <div className="access-choice__shade" aria-hidden="true" />

        <header className="access-choice__brand" aria-label="Zenith">
          <span className="access-choice__logo">
            <img src={Logo} alt="" draggable="false" />
          </span>
          <span>
            <strong>Zenith</strong>
            <small>Agricultura de precisão</small>
          </span>
        </header>

        <section className="access-choice__content" aria-labelledby="access-choice-title">
          <div className="access-choice__eyebrow">
            <Smartphone size={17} strokeWidth={2.1} aria-hidden="true" />
            <span>Zenith no seu dispositivo</span>
          </div>

          <h1 id="access-choice-title">Como você quer acessar?</h1>
          <p>
            Instale a Zenith para abrir direto pela tela inicial ou continue usando normalmente pelo navegador.
          </p>

          <div className="access-choice__actions">
            <button type="button" className="access-choice__button access-choice__button--install" onClick={onInstallRequest}>
              <Download size={20} strokeWidth={2.2} aria-hidden="true" />
              <span>Instalar aplicativo</span>
              <ArrowRight size={19} strokeWidth={2.2} aria-hidden="true" />
            </button>

            <button type="button" className="access-choice__button access-choice__button--web" onClick={continueOnWebsite}>
              <Globe2 size={20} strokeWidth={2.1} aria-hidden="true" />
              <span>Continuar pelo site</span>
            </button>
          </div>

          <small className="access-choice__note">
            Você também poderá instalar o aplicativo mais tarde pelo menu da Zenith.
          </small>
        </section>
      </main>
    )
  }

  return (
    <main className="intro-page" data-system-bar-color="#091c13">
      <section className="intro-hero" aria-labelledby="intro-title">
        <div className="intro-hero__overlay" aria-hidden="true" />
        <div className="intro-hero__content">
          <div className="intro-logo" aria-label="Zenith">
            <img src={Logo} alt="" draggable="false" />
          </div>
          <p className="intro-hero__subtitle">Agricultura de precisão</p>
          <h1 id="intro-title">Bem-vindo à Zenith</h1>
        </div>
      </section>

      <section className="intro-card" aria-label="Comece a usar a Zenith">
        <div className="intro-card__eyebrow">
          <Radar size={17} strokeWidth={2.2} aria-hidden="true" />
          Tecnologia para quem produz
        </div>
        <h2>Seu campo, visto com mais precisão.</h2>
        <p>
          Monitore lavouras, organize a operação e transforme dados em decisões mais seguras para a sua produção.
        </p>

        <div className="intro-benefits" aria-label="Benefícios da plataforma">
          <span><ShieldCheck size={17} aria-hidden="true" />Diagnóstico confiável</span>
          <span><Activity size={17} aria-hidden="true" />Acompanhamento contínuo</span>
        </div>

        <div className="intro-actions">
          <button type="button" className="intro-button intro-button--primary" onClick={() => navigate("/register")}>
            <span>Começar agora</span>
            <ArrowRight size={19} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button type="button" className="intro-button intro-button--secondary" onClick={() => navigate("/login")}>
            <LogIn size={18} strokeWidth={2.1} aria-hidden="true" />
            <span>Já tenho uma conta</span>
          </button>
        </div>
      </section>
    </main>
  )
}
