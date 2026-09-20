import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { auth } from "../../services/firebase"
import { db } from "../../services/firebase"
import { addDoc, collection, query, where, getDocs } from "firebase/firestore"
import {
  accountIdentifierMessage,
  attachUniquePhoneToProfile,
  maskAccountDocument,
  maskAccountPhone,
} from "../../services/accountIdentity"
import "../../styles/App/CadastrarFazenda.css"

export default function CadastrarFazenda({ setAppLoading }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: "",
    tipo_proprietario: "",
    documento_proprietario: "",
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
    if (name === "tipo_proprietario") {
      setFormData({ ...formData, tipo_proprietario: value, documento_proprietario: "" })
      return
    }
    if (name === "documento_proprietario") {
      const digits = value.replace(/\D/g, "").slice(0, formData.tipo_proprietario === "PF" ? 11 : 14)
      const formatted = formData.tipo_proprietario === "PF"
        ? digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2")
        : digits.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2")
      setFormData({ ...formData, [name]: formatted })
      return
    }
    setFormData({ ...formData, [name]: value })
  }

  async function handleRegister(e) {
    e.preventDefault()

    const user = auth.currentUser
    if (!user) {
      alert("Usuário não autenticado")
      return
    }

    try {
      setLoading(true)

      const q = query(
        collection(db, "farms"),
        where("ownerId", "==", user.uid)
      )

      const snapshot = await getDocs(q)

      if (!snapshot.empty) {
        alert("Você já possui uma fazenda cadastrada.")
        navigate("/home")
        return
      }

      await attachUniquePhoneToProfile({
        profileCollection: "owners",
        userId: user.uid,
        phone: formData.telefone,
      })

      const { telefone, documento_proprietario, ...safeFarmData } = formData
      await addDoc(collection(db, "farms"), {
        ...safeFarmData,
        area_total: parseFloat(formData.area_total),
        telefone_mascarado: maskAccountPhone(telefone),
        documento_proprietario_mascarado: maskAccountDocument(documento_proprietario),
        ownerId: user.uid,
        createdAt: new Date()
      })

      alert("Fazenda cadastrada com sucesso!")
      sessionStorage.removeItem("zenithShowWhiteLoaderOnce")
      sessionStorage.setItem("zenithBlockWhiteLoaderUntil", String(Date.now() + 5000))
      setAppLoading?.(true)
      navigate("/home", { replace: true })

    } catch (error) {
      console.error(error)
      alert(accountIdentifierMessage(error) || "Erro ao cadastrar fazenda")
    } finally {
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

          {formData.tipo_proprietario && (
            <div className="input-group">
              <label>{formData.tipo_proprietario === "PF" ? "CPF fictício" : "CNPJ fictício"}</label>
              <input type="text" inputMode="numeric" name="documento_proprietario" value={formData.documento_proprietario} onChange={handleChange} placeholder={formData.tipo_proprietario === "PF" ? "000.000.000-00" : "00.000.000/0000-00"} maxLength={formData.tipo_proprietario === "PF" ? 14 : 18} required />
              <small>Digite somente números; a pontuação é automática. Não use documento real. Exemplo: {formData.tipo_proprietario === "PF" ? "123.456.789-00" : "12.345.678/0001-00"}.</small>
            </div>
          )}

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
