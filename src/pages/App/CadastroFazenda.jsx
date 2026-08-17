import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { createFarm, getCurrentUser, getUserFarm } from "../../services/supabase"
import "../../styles/App/CadastrarFazenda.css"

export default function CadastrarFazenda({ setAppLoading }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const submittingRef = useRef(false)

  const [formData, setFormData] = useState({
    name: "",
    tipo_proprietario: "",
    data_aquisicao: "",
    cep: "",
    bairro: "",
    municipio: "",
    uf: "",
    area_total: "",
    telefone: "",
    plantacao: ""
  })

  function handleChange(e) {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })
  }

  async function handleRegister(e) {
    e.preventDefault()
    if (loading || submittingRef.current) return

    const user = await getCurrentUser()
    if (!user) {
      alert("Usuário não autenticado")
      return
    }

    try {
      submittingRef.current = true
      setLoading(true)

      const existingFarm = await getUserFarm(user.id)

      if (existingFarm) {
        alert("Você já possui uma fazenda cadastrada.")
        navigate("/home")
        return
      }

      await createFarm({
        ...formData,
        ownerId: user.id,
      })

      alert("Fazenda cadastrada com sucesso!")
      sessionStorage.removeItem("zenithShowWhiteLoaderOnce")
      sessionStorage.setItem("zenithBlockWhiteLoaderUntil", String(Date.now() + 5000))
      setAppLoading?.(true)
      navigate("/home", { replace: true })

    } catch (error) {
      console.error(error)
      alert("Erro ao cadastrar fazenda")
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  return (
    <div className="register-container">

      {/* HEADER FIXO */}
      <header className="register-header">
        <button onClick={() => navigate("/home")}>
          ← Voltar
        </button>
        <h1>Cadastro de Fazenda</h1>
      </header>

      <div className="register-card">
        <form onSubmit={handleRegister}>

          <div className="input-group">
            <label>Nome da Fazenda</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <label>Tipo de Proprietário</label>
            <select
              name="tipo_proprietario"
              value={formData.tipo_proprietario}
              onChange={handleChange}
              required
            >
              <option value="">Selecione</option>
              <option value="PF">Pessoa Física</option>
              <option value="PJ">Pessoa Jurídica</option>
            </select>
          </div>

          <div className="input-group">
            <label>Data de Aquisição</label>
            <input
              type="date"
              name="data_aquisicao"
              value={formData.data_aquisicao}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <label>CEP</label>
            <input
              type="text"
              name="cep"
              value={formData.cep}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <label>Bairro</label>
            <input
              type="text"
              name="bairro"
              value={formData.bairro}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <label>Município</label>
            <input
              type="text"
              name="municipio"
              value={formData.municipio}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <label>UF</label>
            <input
              type="text"
              name="uf"
              maxLength="2"
              value={formData.uf}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <label>Área Total (hectares)</label>
            <input
              type="number"
              inputMode="decimal"
              name="area_total"
              value={formData.area_total}
              onChange={handleChange}
              placeholder="Digite a área em hectares"
              required
            />
          </div>

          <div className="input-group">
            <label>Telefone do Proprietário</label>
            <input
              type="text"
              name="telefone"
              value={formData.telefone}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <label>Principal Plantação</label>
            <select
              name="plantacao"
              value={formData.plantacao}
              onChange={handleChange}
              required
            >
              <option value="">Selecione</option>
              <option value="Soja">Soja</option>
              <option value="Tomate">Tomate</option>
              <option value="Café">Café</option>
            </select>
          </div>

          <button
            type="submit"
            className="btn-submit"
            disabled={loading}
          >
            {loading ? "Cadastrando..." : "Cadastrar Fazenda"}
          </button>

        </form>
      </div>
    </div>
  )
}
