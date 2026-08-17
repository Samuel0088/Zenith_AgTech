import { useRef, useState } from "react"
import { signUpAndCreateProfile } from "../../services/supabase"
import "../../styles/App/Register.css"

export default function Register() {
  const [form, setForm] = useState({
    name: "",
    age: "",
    type: "",
    document: "",
    hectares: "",
    email: "",
    password: "",
  })
  const [loading, setLoading] = useState(false)
  const registeringRef = useRef(false)
  const [alertMessage, setAlertMessage] = useState({ type: "", text: "" })

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
    setAlertMessage({ type: "", text: "" })
  }

  const validateForm = () => {
    if (!form.name || !form.age || !form.type || !form.document || !form.hectares || !form.email || !form.password) {
      setAlertMessage({ type: "error", text: "Preencha todos os campos." })
      return false
    }
    if (form.password.length < 6) {
      setAlertMessage({ type: "error", text: "A senha deve ter pelo menos 6 caracteres." })
      return false
    }
    return true
  }

  const handleRegister = async () => {
    if (loading || registeringRef.current) return
    if (!validateForm()) return

    registeringRef.current = true
    setLoading(true)
    try {
      await signUpAndCreateProfile({
        email: form.email,
        password: form.password,
        profile: {
          name: form.name,
          age: parseInt(form.age),
          type: form.type,
          document: form.document,
        },
      })

      setAlertMessage({ type: "success", text: "Conta criada com sucesso! Bem-vindo ao campo!" })

      setForm({
        name: "",
        age: "",
        type: "",
        document: "",
        hectares: "",
        email: "",
        password: "",
      })

      setTimeout(() => {
        window.location.href = "/login"
      }, 2000)
    } catch (error) {
      console.error("Erro ao criar conta:", error)
      const errorMessage = error.message?.includes("already registered")
        ? "Este email ja esta em uso."
        : "Erro ao criar a conta. Tente novamente."

      setAlertMessage({ type: "error", text: errorMessage })
    } finally {
      registeringRef.current = false
      setLoading(false)
    }
  }

  return (
    <div className="register-container">
      <div className="register-background-layer register-background-layer-1"></div>
      <div className="register-background-layer register-background-layer-2"></div>
      <div className="register-background-overlay"></div>

      <div className="register-gradient-sphere register-gradient-sphere-1"></div>
      <div className="register-gradient-sphere register-gradient-sphere-2"></div>
      <div className="register-grid-pattern"></div>

      <div className="register-card">
        <div className="register-card-glow"></div>
        <div className="register-card-pattern"></div>

        <div className="register-form">
          <div className="input-group-register">
            <label>Nome do Agricultor</label>
            <input
              name="name"
              value={form.name}
              placeholder="Digite seu nome completo"
              onChange={handleChange}
            />
          </div>

          <div className="input-group-register">
            <label>Idade</label>
            <input
              type="number"
              name="age"
              value={form.age}
              placeholder="Sua idade"
              min="0"
              max="120"
              onChange={handleChange}
            />
          </div>

          <div className="input-group-register">
            <label>Tipo de Propriedade</label>
            <select name="type" value={form.type} onChange={handleChange}>
              <option value="">Selecione o tipo</option>
              <option value="CPF">Agricultor Familiar (CPF)</option>
              <option value="PJ">Produtor Rural (CNPJ)</option>
            </select>
          </div>

          {form.type && (
            <div className="input-group-register">
              <label>{form.type === "CPF" ? "CPF do Produtor" : "CNPJ da Propriedade"}</label>
              <input
                name="document"
                value={form.document}
                placeholder={form.type === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"}
                maxLength={form.type === "CPF" ? 14 : 18}
                onChange={handleChange}
              />
            </div>
          )}

          <div className="input-group-register">
            <label>Hectares (Area total)</label>
            <input
              type="number"
              name="hectares"
              value={form.hectares}
              placeholder="Ex: 10.5 hectares"
              min="0"
              step="0.01"
              onChange={handleChange}
            />
          </div>

          <div className="input-group-register">
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              placeholder="seu@email.com"
              onChange={handleChange}
            />
          </div>

          <div className="input-group-register">
            <label>Senha</label>
            <input
              type="password"
              name="password"
              value={form.password}
              placeholder="Minimo 6 caracteres"
              onChange={handleChange}
            />
          </div>

          {alertMessage.text && (
            <div className={`alert-message-register ${alertMessage.type}`}>
              {alertMessage.text}
            </div>
          )}

          <button
            type="button"
            className="register-button"
            onClick={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="loading-spinner-register"></span>
                Criando sua conta...
              </>
            ) : (
              "Criar conta"
            )}
          </button>

          <div className="login-link">
            <span>Ja tem uma conta?</span>
            <a href="/login">Fazer Login</a>
          </div>
        </div>
      </div>
    </div>
  )
}
