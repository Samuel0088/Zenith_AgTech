// CadastroCompleto.jsx

import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  createFarm,
  signUpAndCreateProfile,
} from "../../services/supabase"
import "../../styles/App/CadastroCompleto.css"

const PROBLEMAS_LAVOURA = [
  "Monitoramento totalmente manual",
  "Pragas na lavoura",
  "Doenças nas folhas",
  "Dificuldade para identificar problemas rapidamente",
  "Falta de acompanhamento frequente da plantação",
  "Baixa produtividade",
  "Falhas no plantio",
  "Dificuldade no uso de tecnologia no campo",
  "Custo alto para monitoramento agrícola",
  "Falta de relatórios sobre a lavoura",
  "Outro",
]

const UFS_BRASIL = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
]

export default function CadastroCompleto({ setAppLoading }) {
  const navigate = useNavigate()

  const [etapa, setEtapa] = useState(1)
  const [loading, setLoading] = useState(false)
  const creatingUserRef = useRef(false)
  const savingFarmRef = useRef(false)
  const [cepData, setCepData] = useState(null)
  const [alertMessage, setAlertMessage] = useState({
    type: "",
    text: "",
  })

  const [userId, setUserId] = useState(null)

  const [userData, setUserData] = useState({
    name: "",
    age: "",
    type: "",
    document: "",
    email: "",
    password: "",
  })

  const [farmData, setFarmData] = useState({
    name: "",
    tipo_proprietario: "",
    cep: "",
    bairro: "",
    municipio: "",
    uf: "",
    area_total: "",
    telefone: "",
    plantacao: [],
  })

  const buscarCEP = async (cep) => {
    const cepLimpo = cep.replace(/\D/g, "")

    if (cepLimpo.length !== 8) {
      setCepData(null)
      return
    }

    try {
      const response = await fetch(
        `https://viacep.com.br/ws/${cepLimpo}/json/`
      )

      const data = await response.json()

      if (data.erro) {
        setCepData(null)
        setAlertMessage({
          type: "error",
          text: "CEP não encontrado.",
        })
        return
      }

      if (!data.erro) {
        setCepData(data)
        setFarmData((prev) => ({
          ...prev,
          bairro: data.bairro || "",
          municipio: data.localidade || "",
          uf: data.uf || "",
        }))
      }
    } catch (error) {
      console.error(error)
      setCepData(null)
    }
  }

  const handleUserChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value

    if (name === "name") {
      formattedValue = value
        .replace(/[^a-zA-ZÀ-ÿ\s'-]/g, "")
        .replace(/\s+/g, " ")
        .slice(0, 80)
    }

    if (name === "age") {
      formattedValue = value.replace(/\D/g, "").slice(0, 3)
    }

    if (name === "email") {
      formattedValue = value.trim().toLowerCase().slice(0, 120)
    }

    if (name === "password") {
      formattedValue = value.slice(0, 64)
    }

    setUserData({
      ...userData,
      [name]: formattedValue,
      ...(name === "type" ? { document: "" } : {}),
    })

    setAlertMessage({
      type: "",
      text: "",
    })
  }

  const handleFarmChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value

    if (name === "name") {
      formattedValue = value.replace(/\s+/g, " ").slice(0, 80)
    }

    if (name === "cep") {
      formattedValue = formatCEP(value)
      setCepData(null)
    }

    if (name === "uf") {
      formattedValue = value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2)
    }

    if (name === "bairro" || name === "municipio") {
      formattedValue = value
        .replace(/[^a-zA-ZÀ-ÿ\s'-]/g, "")
        .replace(/\s+/g, " ")
        .slice(0, 80)
    }

    if (name === "area_total") {
      formattedValue = value
        .replace(",", ".")
        .replace(/[^\d.]/g, "")
        .replace(/^(\d*\.?\d{0,2}).*$/, "$1")
        .slice(0, 10)
    }

    if (name === "telefone") {
      formattedValue = formatPhone(value)
    }

    setFarmData({
      ...farmData,
      [name]: formattedValue,
    })

    setAlertMessage({
      type: "",
      text: "",
    })
  }

  const handleProblemaChange = (problema) => {
    setFarmData((prev) => ({
      ...prev,
      plantacao: problema ? [problema] : [],
    }))
  }

  const validateUserData = () => {
    const nameIsValid = hasMinLetters(userData.name, 3)
    const age = Number(userData.age)
    const documentDigits = userData.document.replace(/\D/g, "")
    const emailIsValid = isValidEmail(userData.email)
    const passwordError = getPasswordError(userData.password)

    if (
      !userData.name ||
      !userData.age ||
      !userData.type ||
      !userData.document ||
      !userData.email ||
      !userData.password
    ) {
      setAlertMessage({
        type: "error",
        text: "Preencha todos os campos.",
      })

      return false
    }

    if (!nameIsValid) {
      setAlertMessage({
        type: "error",
        text: "Informe um nome completo válido.",
      })

      return false
    }

    if (!Number.isInteger(age) || age < 18 || age > 120) {
      setAlertMessage({
        type: "error",
        text: "Você precisa ter pelo menos 18 anos.",
      })

      return false
    }

    if (userData.type === "CPF" && !isValidCPF(documentDigits)) {
      setAlertMessage({
        type: "error",
        text: "Informe um CPF válido.",
      })

      return false
    }

    if (userData.type === "PJ" && !isValidCNPJ(documentDigits)) {
      setAlertMessage({
        type: "error",
        text: "Informe um CNPJ válido.",
      })

      return false
    }

    if (!emailIsValid) {
      setAlertMessage({
        type: "error",
        text: "Informe um email válido.",
      })

      return false
    }

    if (passwordError) {
      setAlertMessage({
        type: "error",
        text: passwordError,
      })

      return false
    }

    return true
  }

  const validateFarmData = async () => {
    const cepDigits = farmData.cep.replace(/\D/g, "")
    const phoneDigits = farmData.telefone.replace(/\D/g, "")
    const areaTotal = Number(farmData.area_total)

    if (
      !farmData.name ||
      !farmData.tipo_proprietario ||
      !farmData.cep ||
      !farmData.bairro ||
      !farmData.municipio ||
      !farmData.uf ||
      !farmData.area_total ||
      !farmData.telefone ||
      farmData.plantacao.length === 0
    ) {
      setAlertMessage({
        type: "error",
        text: "Preencha os dados da fazenda.",
      })

      return false
    }

    if (!hasMinLetters(farmData.name, 3)) {
      setAlertMessage({
        type: "error",
        text: "Informe um nome de fazenda válido.",
      })

      return false
    }

    if (cepDigits.length !== 8) {
      setAlertMessage({
        type: "error",
        text: "Informe um CEP válido com 8 dígitos.",
      })

      return false
    }

    const validCepData = await validateCEPExists(cepDigits)

    if (!validCepData) {
      setAlertMessage({
        type: "error",
        text: "CEP não encontrado. Confira o número informado.",
      })

      return false
    }

    if (!UFS_BRASIL.includes(farmData.uf)) {
      setAlertMessage({
        type: "error",
        text: "Informe uma UF válida, como SP, MG ou PR.",
      })

      return false
    }

    if (validCepData.uf && farmData.uf !== validCepData.uf) {
      setAlertMessage({
        type: "error",
        text: `A UF não corresponde ao CEP. Para este CEP, a UF é ${validCepData.uf}.`,
      })

      return false
    }

    if (!hasMinLetters(farmData.bairro, 2)) {
      setAlertMessage({
        type: "error",
        text: "Informe um bairro válido.",
      })

      return false
    }

    if (
      validCepData.bairro &&
      normalizeText(farmData.bairro) !== normalizeText(validCepData.bairro)
    ) {
      setAlertMessage({
        type: "error",
        text: `O bairro não corresponde ao CEP. Para este CEP, o bairro é ${validCepData.bairro}.`,
      })

      return false
    }

    if (!hasMinLetters(farmData.municipio, 2)) {
      setAlertMessage({
        type: "error",
        text: "Informe um município válido.",
      })

      return false
    }

    if (
      validCepData.localidade &&
      normalizeText(farmData.municipio) !== normalizeText(validCepData.localidade)
    ) {
      setAlertMessage({
        type: "error",
        text: `O município não corresponde ao CEP. Para este CEP, o município é ${validCepData.localidade}.`,
      })

      return false
    }

    if (!Number.isFinite(areaTotal) || areaTotal <= 0) {
      setAlertMessage({
        type: "error",
        text: "Informe uma área total válida em hectares.",
      })

      return false
    }

    if (!isValidBrazilianPhone(phoneDigits)) {
      setAlertMessage({
        type: "error",
        text: "Informe um telefone válido com DDD.",
      })

      return false
    }

    return true
  }

  const handleNextUserStep = () => {
    if (loading || creatingUserRef.current) return

    if (userId) {
      setEtapa(2)
      setAlertMessage({
        type: "",
        text: "",
      })
      return
    }

    handleCreateUser()
  }

  const handleCreateUser = async () => {
    if (loading || creatingUserRef.current || userId) return
    if (!validateUserData()) return

    creatingUserRef.current = true
    setLoading(true)

    try {
      const { user } = await signUpAndCreateProfile({
        email: userData.email,
        password: userData.password,
        profile: {
          name: userData.name,
          age: parseInt(userData.age),
          type: userData.type,
          document: userData.document,
        },
      })

      setUserId(user.id)

      setAlertMessage({
        type: "success",
        text: "Conta criada com sucesso 🌱",
      })

      setTimeout(() => {
        setEtapa(2)

        setAlertMessage({
          type: "",
          text: "",
        })
      }, 1200)
    } catch (error) {
      console.error("Erro ao criar usuario/agricultor no Supabase:", error)
      let errorMessage = "Erro ao criar conta."

      if (error.code === "auth/email-already-in-use") {
        errorMessage = "Este email já está em uso."
      }

      if (error.code === "auth/invalid-email") {
        errorMessage = "Informe um email válido."
      }

      if (error.code === "auth/weak-password") {
        errorMessage = "A senha está muito fraca."
      }

      setAlertMessage({
        type: "error",
        text: errorMessage,
      })
    } finally {
      creatingUserRef.current = false
      setLoading(false)
    }
  }

  const handleSaveFarm = async () => {
    if (loading || savingFarmRef.current) return
    if (!userId) {
      setAlertMessage({
        type: "error",
        text: "Crie os dados do agricultor antes de cadastrar a fazenda.",
      })
      return
    }

    if (!(await validateFarmData())) return

    savingFarmRef.current = true
    setLoading(true)

    try {
      await createFarm({
        ...farmData,
        ownerId: userId,
        ownerName: userData.name,
      })

      setAlertMessage({
        type: "success",
        text: "Cadastro concluído 🌾",
      })

      setTimeout(() => {
        sessionStorage.removeItem("zenithShowWhiteLoaderOnce")
        sessionStorage.setItem("zenithBlockWhiteLoaderUntil", String(Date.now() + 5000))
        setAppLoading?.(true)
        navigate("/home", { replace: true })
      }, 1800)
    } catch (error) {
      console.error(error)

      setAlertMessage({
        type: "error",
        text: "Erro ao cadastrar fazenda.",
      })
    } finally {
      savingFarmRef.current = false
      setLoading(false)
    }
  }

  const formatDocument = (value, type) => {
    const numbers = value.replace(/\D/g, "")

    if (type === "CPF") {
      return numbers
        .slice(0, 11)
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
    }

    return numbers
      .slice(0, 14)
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2")
  }

  const formatCEP = (value) => {
    const numbers = value.replace(/\D/g, "").slice(0, 8)

    return numbers.replace(/^(\d{5})(\d)/, "$1-$2")
  }

  const formatPhone = (value) => {
    const numbers = value.replace(/\D/g, "").slice(0, 11)

    if (numbers.length <= 10) {
      return numbers
        .replace(/^(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{4})(\d)/, "$1-$2")
    }

    return numbers
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2")
  }

  const hasMinLetters = (value, minLetters) => {
    const letters = value.match(/[a-zA-ZÀ-ÿ]/g) || []

    return letters.length >= minLetters
  }

  const isValidCPF = (digits) => {
    if (!/^\d{11}$/.test(digits)) return false
    if (/^(\d)\1+$/.test(digits)) return false

    const calculateDigit = (base, factor) => {
      const total = base
        .split("")
        .reduce((sum, number) => sum + Number(number) * factor--, 0)
      const remainder = (total * 10) % 11

      return remainder === 10 ? 0 : remainder
    }

    const firstDigit = calculateDigit(digits.slice(0, 9), 10)
    const secondDigit = calculateDigit(digits.slice(0, 10), 11)

    return firstDigit === Number(digits[9]) && secondDigit === Number(digits[10])
  }

  const isValidCNPJ = (digits) => {
    if (!/^\d{14}$/.test(digits)) return false
    if (/^(\d)\1+$/.test(digits)) return false

    const calculateDigit = (base, weights) => {
      const total = base
        .split("")
        .reduce((sum, number, index) => sum + Number(number) * weights[index], 0)
      const remainder = total % 11

      return remainder < 2 ? 0 : 11 - remainder
    }

    const firstDigit = calculateDigit(
      digits.slice(0, 12),
      [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    )
    const secondDigit = calculateDigit(
      digits.slice(0, 13),
      [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    )

    return firstDigit === Number(digits[12]) && secondDigit === Number(digits[13])
  }

  const isValidEmail = (email) => {
    const normalizedEmail = email.trim().toLowerCase()
    const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/

    if (normalizedEmail.length > 120) return false
    if (!emailPattern.test(normalizedEmail)) return false
    if (normalizedEmail.includes("..")) return false

    const [localPart, domain] = normalizedEmail.split("@")

    if (!localPart || localPart.length > 64) return false
    if (!domain || domain.length > 253) return false
    if (domain.split(".").some((part) => !part || part.length > 63)) return false

    return true
  }

  const getPasswordError = (password) => {
    if (password.length < 8) {
      return "A senha deve ter pelo menos 8 caracteres."
    }

    if (password.length > 64) {
      return "A senha deve ter no máximo 64 caracteres."
    }

    if (!/[A-Z]/.test(password)) {
      return "A senha deve ter pelo menos uma letra maiúscula."
    }

    if (!/[a-z]/.test(password)) {
      return "A senha deve ter pelo menos uma letra minúscula."
    }

    if (!/\d/.test(password)) {
      return "A senha deve ter pelo menos um número."
    }

    if (!/[!@#$%^&*()_+\-={}\[\]:;<>?,./]/.test(password)) {
      return "A senha deve ter pelo menos um caractere especial."
    }

    if (/\s/.test(password)) {
      return "A senha não pode conter espaços."
    }

    if (/^(.)\1+$/.test(password)) {
      return "A senha não pode ser uma repetição do mesmo caractere."
    }

    return ""
  }

  const normalizeText = (value) => {
    return value
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase()
  }

  const validateCEPExists = async (cepDigits) => {
    if (cepData && cepData.cep?.replace(/\D/g, "") === cepDigits) {
      return cepData
    }

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`)
      const data = await response.json()

      if (!response.ok || data.erro) return null

      setCepData(data)

      return data
    } catch (error) {
      console.error(error)
      return null
    }
  }

  const isValidBrazilianPhone = (digits) => {
    const validDDDs = new Set([
      "11", "12", "13", "14", "15", "16", "17", "18", "19", "21", "22",
      "24", "27", "28", "31", "32", "33", "34", "35", "37", "38", "41",
      "42", "43", "44", "45", "46", "47", "48", "49", "51", "53", "54",
      "55", "61", "62", "63", "64", "65", "66", "67", "68", "69", "71",
      "73", "74", "75", "77", "79", "81", "82", "83", "84", "85", "86",
      "87", "88", "89", "91", "92", "93", "94", "95", "96", "97", "98",
      "99",
    ])

    if (!/^\d{10,11}$/.test(digits)) return false
    if (/^(\d)\1+$/.test(digits)) return false

    const ddd = digits.slice(0, 2)
    const number = digits.slice(2)

    if (!validDDDs.has(ddd)) return false

    if (digits.length === 11) {
      return number.startsWith("9") && !/^9(\d)\1{7}$/.test(number)
    }

    return /^[2-5]/.test(number) && !/^(\d)\1{7}$/.test(number)
  }

  return (
    <div className="cadastro-page" data-system-bar-color="#091c13">

      <div className="cadastro-hero">
        <div className="login-hero__overlay" />

        <div className="login-hero__content">

          <div className="login-logo">
            <img
              className="logo-img"
              src="assets/image/Logo-redonda.png"
              alt=""
            />
          </div>

          <p className="login-hero__subtitle">
            Cadastre sua propriedade rural
          </p>

          <h1 className="login-hero__title">
            Cadastro
          </h1>

        </div>
      </div>

      <main className="cadastro-card" data-system-bar-color="#f8fcf6">
        <div className="cadastro-header">

          <div className="etapa-indicador">

            <span
              className={`etapa ${etapa === 1 ? "ativa" : "completa"}`}
            >
              {etapa > 1 ? "✓" : "1"}
            </span>

            <span className="etapa-linha"></span>

            <span
              className={`etapa ${etapa === 2 ? "ativa" : ""}`}
            >
              2
            </span>

          </div>

          <h2>
            {etapa === 1
              ? "Dados do Agricultor"
              : "Dados da Fazenda"}
          </h2>

          <p className="cadastro-subtitle">
            {etapa === 1
              ? "Primeiro, conte-nos sobre você"
              : "Agora, conte-nos sobre sua propriedade"}
          </p>

        </div>

        {etapa === 1 && (
          <div className="cadastro-form">

            <div className="input-group">
              <label>Nome Completo</label>

              <input
                type="text"
                name="name"
                value={userData.name}
                onChange={handleUserChange}
                placeholder="Seu nome"
                maxLength={80}
              />
            </div>

            <div className="input-row">

              <div className="input-group">
                <label>Idade</label>

              <input
                  type="text"
                  inputMode="numeric"
                  name="age"
                  value={userData.age}
                  onChange={handleUserChange}
                  placeholder="Sua idade"
                  maxLength={3}
                />
              </div>

              <div className="input-group">
                <label>Tipo</label>

                <select
                  name="type"
                  value={userData.type}
                  onChange={handleUserChange}
                >
                  <option value="">Selecione</option>
                  <option value="CPF">Pessoa Física</option>
                  <option value="PJ">Pessoa Jurídica</option>
                </select>
              </div>

            </div>

            {userData.type && (
              <div className="input-group">

                <label>
                  {userData.type === "CPF"
                    ? "CPF"
                    : "CNPJ"}
                </label>

                <input
                  type="text"
                  name="document"
                  value={userData.document}
                  onChange={(e) => {
                    const formatted = formatDocument(
                      e.target.value,
                      userData.type
                    )

                    handleUserChange({
                      target: {
                        name: "document",
                        value: formatted,
                      },
                    })
                  }}
                  placeholder={
                    userData.type === "CPF"
                      ? "000.000.000-00"
                      : "00.000.000/0000-00"
                  }
                  maxLength={userData.type === "CPF" ? 14 : 18}
                />

              </div>
            )}

            <div className="input-group">
              <label>Email</label>

              <input
                type="email"
                name="email"
                value={userData.email}
                onChange={handleUserChange}
                placeholder="seu@email.com"
                maxLength={120}
              />
            </div>

            <div className="input-group">
              <label>Senha</label>

              <input
                type="password"
                name="password"
                value={userData.password}
                onChange={handleUserChange}
                placeholder="Sua senha"
                maxLength={64}
              />
            </div>

            {alertMessage.text && (
              <div className={`alert-message ${alertMessage.type}`}>
                {alertMessage.text}
              </div>
            )}

            <button
              type="button"
              className="btn-next"
              onClick={handleNextUserStep}
              disabled={loading}
            >
              {loading
                ? "Criando conta..."
                : "Próximo →"}
            </button>

            <button
              type="button"
              className="cadastro-login-back"
              onClick={() => navigate("/login")}
              disabled={loading}
            >
              <span className="material-symbols-outlined">arrow_back</span>
              Voltar para login
            </button>

          </div>
        )}

        {etapa === 2 && (
          <div className="cadastro-form">

            <div className="input-group">
              <label>Nome da Fazenda</label>

              <input
                type="text"
                name="name"
                value={farmData.name}
                onChange={handleFarmChange}
                placeholder="Nome da fazenda"
                maxLength={80}
              />
            </div>

            <div className="input-group">
              <label>Tipo Proprietário</label>

              <select
                name="tipo_proprietario"
                value={farmData.tipo_proprietario}
                onChange={handleFarmChange}
              >
                <option value="">Selecione</option>
                <option value="PF">Pessoa Física</option>
                <option value="PJ">Pessoa Jurídica</option>
              </select>
            </div>

            <div className="input-row">

              <div className="input-group">
                <label>CEP</label>

                <input
                  type="text"
                  inputMode="numeric"
                  name="cep"
                  value={farmData.cep}
                  onChange={(e) => {
                    handleFarmChange(e)
                    buscarCEP(e.target.value)
                  }}
                  placeholder="00000-000"
                  maxLength={9}
                />
              </div>

              <div className="input-group">
                <label>UF</label>

                <input
                  type="text"
                  name="uf"
                  value={farmData.uf}
                  onChange={handleFarmChange}
                  placeholder="SP"
                  maxLength={2}
                />
              </div>

            </div>

            <div className="input-group">
              <label>Bairro</label>

              <input
                type="text"
                name="bairro"
                value={farmData.bairro}
                onChange={handleFarmChange}
                maxLength={80}
              />
            </div>

            <div className="input-group">
              <label>Município</label>

              <input
                type="text"
                name="municipio"
                value={farmData.municipio}
                onChange={handleFarmChange}
                maxLength={80}
              />
            </div>

            <div className="input-row">

              <div className="input-group">
                <label>Área Total em Hectares</label>

                <input
                  type="text"
                  inputMode="decimal"
                  name="area_total"
                  value={farmData.area_total}
                  onChange={handleFarmChange}
                  placeholder="Digite a área em hectares"
                  maxLength={10}
                />
              </div>

              <div className="input-group">
                <label>Telefone</label>

                <input
                  type="text"
                  inputMode="tel"
                  name="telefone"
                  value={farmData.telefone}
                  onChange={handleFarmChange}
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                />
              </div>

            </div>

            <div className="input-group">
              <label>Principal problema enfrentado na lavoura</label>

              <select
                name="plantacao"
                value={farmData.plantacao[0] || ""}
                onChange={(e) => handleProblemaChange(e.target.value)}
              >
                <option value="">Selecione</option>
                {PROBLEMAS_LAVOURA.map((problema) => (
                  <option key={problema} value={problema}>
                    {problema}
                  </option>
                ))}
              </select>
            </div>

            {alertMessage.text && (
              <div className={`alert-message ${alertMessage.type}`}>
                {alertMessage.text}
              </div>
            )}

            <div className="botoes-container">

              <button
                type="button"
                className="btn-voltar"
                onClick={() => setEtapa(1)}
                disabled={loading}
              >
                ← Voltar
              </button>

              <button
                type="button"
                className="btn-finalizar"
                onClick={handleSaveFarm}
                disabled={loading}
              >
                {loading
                  ? "Finalizando..."
                  : "Finalizar Cadastro"}
              </button>

            </div>

          </div>
        )}

      </main>

    </div>
  )
}
