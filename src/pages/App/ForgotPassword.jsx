import { useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { resetPasswordForEmail } from "../../services/supabase"

import "../../styles/App/ForgotPassword.css"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DEFAULT_ERROR = "Nao foi possivel enviar o email de recuperacao."

export default function ForgotPassword() {
  const navigate = useNavigate()

  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState({
    type: "",
    text: "",
  })

  const showAlert = useCallback((type, text) => {
    setAlert({ type, text })
  }, [])

  const validateEmail = () => {
    if (!email.trim()) {
      showAlert("error", "Digite o email cadastrado para recuperar sua senha.")
      return false
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      showAlert("error", "Digite um email valido.")
      return false
    }

    return true
  }

  const handleResetPassword = async () => {
    if (!validateEmail()) return

    setLoading(true)
    setAlert({ type: "", text: "" })

    try {
      await resetPasswordForEmail(email.trim())

      showAlert(
        "success",
        "Email enviado com sucesso! Verifique sua caixa de entrada."
      )

      setTimeout(() => {
        navigate("/login")
      }, 2500)
    } catch (error) {
      console.error("Erro ao enviar recuperacao de senha:", error)
      showAlert("error", DEFAULT_ERROR)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleResetPassword()
    }
  }

  return (
    <div className="forgot-page" data-system-bar-color="#091c13">
      <div className="forgot-hero">
        <div className="forgot-hero__overlay" />

        <div className="forgot-hero__content">
          <div className="forgot-logo">
            <img
              src="assets/image/Logo-redonda.png"
              alt="Zenith Agro"
              className="forgot-logo__img"
            />
          </div>

          <p className="forgot-hero__subtitle">
            Recuperacao de acesso
          </p>

          <h1 className="forgot-hero__title">
            Esqueceu a senha?
          </h1>
        </div>
      </div>

      <main className="forgot-card" data-system-bar-color="#f7f5f0">
        <div className="forgot-header">
          <h2 className="forgot-header__title">
            Recuperar senha
          </h2>

          <p className="forgot-header__text">
            Informe o email da sua conta e enviaremos
            um link para redefinir sua senha.
          </p>
        </div>

        <div className="forgot__field">
          <label
            htmlFor="forgot-email"
            className="forgot__label"
          >
            Email
          </label>

          <input
            id="forgot-email"
            type="email"
            className="forgot__input"
            placeholder="seuemail@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            autoComplete="email"
          />
        </div>

        {alert.text && (
          <div
            className={`forgot__alert forgot__alert--${alert.type}`}
          >
            {alert.text}
          </div>
        )}

        <button
          className={`forgot__btn-primary ${
            loading ? "forgot__btn-primary--loading" : ""
          }`}
          onClick={handleResetPassword}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="forgot__spinner" />
              Enviando...
            </>
          ) : (
            "Enviar recuperacao"
          )}
        </button>

        <button
          className="forgot__btn-secondary"
          onClick={() => navigate("/login")}
          disabled={loading}
        >
          Voltar para login
        </button>
      </main>
    </div>
  )
}
