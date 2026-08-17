// Profile.jsx - Versão Tecnológica com Componentes
import { useState, useEffect } from "react"
import {
  getProfile,
  getUserFarm,
  onAuthStateChanged,
  signOut,
  updateFarm,
  updateProfile,
} from "../../services/supabase"
import { useNavigate } from "react-router-dom"

import FarmEditForm from "../../components/App/Profile/FarmEditForm"
// Componentes
import ProfileParticleBackground from "../../components/App/Profile/ProfileParticleBackground"
import ProfileMouseGlow from "../../components/App/Profile/ProfileMouseGlow"
import ProfileLoadingScreen from "../../components/App/Profile/ProfileLoadScreen"
import ProfileHeader from "../../components/App/Profile/ProfileHeader"
import ProfileStatsRow from "../../components/App/Profile/ProfileStatsRow"
import ProfileTabs from "../../components/App/Profile/ProfileTabs"
import ProfileActions from "../../components/App/Profile/ProfileActions"
import AlertMessage from "../../components/App/Profile/AlertMessage"
import PersonalInfoView from "../../components/App/Profile/PersonalInfoView"
import FarmInfoView from "../../components/App/Profile/FarmInfoView"
import ProfileEditForm from "../../components/App/Profile/ProfileEditForm"
import MenuBar from "../../components/App/Global/MenuBar"
import AppHeader from "../../components/App/Global/AppHeader"

// CSS
import "../../styles/App/Profile.css"

export default function Profile() {
  const [user, setUser] = useState(null)
  const [userData, setUserData] = useState(null)
  const [farmData, setFarmData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState("pessoal")
  const [editingFarm, setEditingFarm] = useState(false)
  const [savingFarm, setSavingFarm] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    age: "",
    type: "",
    document: "",
    hectares: "",
    email: "",
    profileIcon: "👨‍🌾",
    phone: "",
    city: "",
    state: ""
  })
  const [alertMessage, setAlertMessage] = useState({ type: "", text: "" })
  const navigate = useNavigate()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser)
        await loadUserData(currentUser.id)
        await loadFarmData(currentUser.id)
      } else {
        navigate("/login")
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [navigate])

  const loadUserData = async (uid) => {
    try {
      const data = await getProfile(uid)
      if (data) {
        setUserData(data)
        setFormData({
          name: data.name || "",
          age: data.age || "",
          type: data.type || "",
          document: data.document || "",
          hectares: data.hectares || "",
          email: data.email || "",
          profileIcon: data.profileIcon || "👨‍🌾",
          phone: data.phone || "",
          city: data.city || "",
          state: data.state || ""
        })
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error)
      showAlert("error", "Erro ao carregar perfil")
    }
  }

  const loadFarmData = async (uid) => {
    try {
      const data = await getUserFarm(uid)

      if (data) {
        setFarmData({
          id: data.id,
          name: data.name || "",
          area_total: data.area_total || "0",
          bairro: data.bairro || "",
          cep: data.cep || "",
          createdAt: data.createdAt || null,
          data_aquisicao: data.data_aquisicao || "",
          municipio: data.municipio || "",
          plantacao: data.plantacao || "",
          telefone: data.telefone || "",
          tipo_proprietario: data.tipo_proprietario || "",
          uf: data.uf || ""
        })
      } else {
        setFarmData(null)
      }
    } catch (error) {
      console.error("Erro ao carregar fazenda:", error)
      showAlert("error", "Erro ao carregar dados da fazenda")
    }
  }

  const showAlert = (type, text) => {
    setAlertMessage({ type, text })
    setTimeout(() => setAlertMessage({ type: "", text: "" }), 3000)
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleIconSelect = (icon) => {
    setFormData({ ...formData, profileIcon: icon })
  }

  const handleSave = async () => {
    if (!user) return
    if (saving) return

    setSaving(true)
    try {
      await updateProfile(user.id, {
        name: formData.name,
        age: parseInt(formData.age) || null,
        type: formData.type,
        document: formData.document,
        hectares: parseFloat(formData.hectares) || null,
        profileIcon: formData.profileIcon,
        phone: formData.phone,
        city: formData.city,
        state: formData.state,
        updatedAt: new Date().toISOString()
      })

      showAlert("success", "Perfil atualizado com sucesso! 🌱")
      setEditing(false)
      await loadUserData(user.id)
    } catch (error) {
      console.error("Erro ao atualizar:", error)
      showAlert("error", "Erro ao atualizar perfil")
    } finally {
      setSaving(false)
    }
  }

  const handleSaveFarm = async (updatedFarmData) => {
  if (!user || !farmData?.id) return
  if (savingFarm) return

  setSavingFarm(true)
  try {
    await updateFarm(farmData.id, {
      ownerId: user.id,
      name: updatedFarmData.name,
      area_total: parseFloat(updatedFarmData.area_total) || 0,
      plantacao: updatedFarmData.plantacao || "",
      municipio: updatedFarmData.municipio,
      uf: updatedFarmData.uf,
      bairro: updatedFarmData.bairro || "",
      cep: updatedFarmData.cep || "",
      data_aquisicao: updatedFarmData.data_aquisicao || "",
      telefone: updatedFarmData.telefone || "",
      tipo_proprietario: updatedFarmData.tipo_proprietario || "Proprietário",
      updatedAt: new Date().toISOString()
    })

    showAlert("success", "Fazenda atualizada com sucesso! 🌱")
    setEditingFarm(false)
    await loadFarmData(user.id)
  } catch (error) {
    console.error("Erro ao atualizar fazenda:", error)
    showAlert("error", "Erro ao atualizar fazenda")
  } finally {
    setSavingFarm(false)
  }
}

  const handleLogout = async () => {
    try {
      await signOut()
      navigate("/login")
    } catch (error) {
      console.error("Erro ao sair:", error)
    }
  }

  const handleAddFarm = () => {
    navigate("/cadastrar-fazenda")
  }

  const handleEditFarm = () => {
  setEditingFarm(true)
}

  const formatDocument = (doc) => {
    if (!doc) return "Não informado"
    if (formData.type === "CPF" && doc.length === 11) {
      return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    } else if (formData.type === "PJ" && doc.length === 14) {
      return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
    }
    return doc
  }

  const calculateMemberTime = () => {
    if (!userData?.createdAt) return "Hoje"
    const created = new Date(userData.createdAt)
    const now = new Date()
    const diffTime = Math.abs(now - created)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays < 30) return `${diffDays} dias`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} meses`
    return `${Math.floor(diffDays / 365)} anos`
  }

  const getTotalHectares = () => {
    if (farmData?.area_total) {
      const area = parseFloat(farmData.area_total)
      if (!isNaN(area)) return area.toFixed(1)
    }
    if (userData?.hectares) {
      const userArea = parseFloat(userData.hectares)
      if (!isNaN(userArea)) return userArea.toFixed(1)
    }
    return "0"
  }

  const formatPhone = (phone) => {
    if (!phone) return "Não informado"
    if (phone.length === 11) {
      return phone.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")
    } else if (phone.length === 10) {
      return phone.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3")
    }
    return phone
  }

  if (loading) {
    return <ProfileLoadingScreen />
  }

  return (
    <>
      <ProfileParticleBackground />
      <ProfileMouseGlow />
      
      {/*
        <AppHeader title="Perfil" showLogo={true} showNotification={true} />
      */}

      <div className="profile-container-tech" data-system-bar-color="#f7f5f0">
        <ProfileHeader 
          profileIcon={formData.profileIcon}
          userName={userData?.name}
          memberTime={calculateMemberTime()}
          editing={editing}
          onAvatarClick={() => editing && setActiveTab("editar")}
        />

        <ProfileStatsRow 
          hectares={getTotalHectares()}
          age={userData?.age || "-"}
          farmsCount={farmData ? 1 : 0}
        />

        <ProfileActions 
          editing={editing}
          saving={saving}
          onEdit={() => setEditing(true)}
          onSave={handleSave}
          onCancel={() => {
            setEditing(false)
            setFormData({
              name: userData?.name || "",
              age: userData?.age || "",
              type: userData?.type || "",
              document: userData?.document || "",
              hectares: userData?.hectares || "",
              email: user?.email || "",
              profileIcon: userData?.profileIcon || "👨‍🌾",
              phone: userData?.phone || "",
              city: userData?.city || "",
              state: userData?.state || ""
            })
          }}
          onLogout={handleLogout}
        />

        <ProfileTabs 
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <AlertMessage type={alertMessage.type} text={alertMessage.text} />

      <div className="profile-content">
  {!editing ? (
    <>
      {activeTab === "pessoal" && (
        <PersonalInfoView 
          userData={userData}
          user={user}
          formatDocument={formatDocument}
        />
      )}

      {activeTab === "fazenda" && !editingFarm && (
        <FarmInfoView 
          farmData={farmData}
          onAddFarm={handleAddFarm}
          onEditFarm={handleEditFarm}
          formatPhone={formatPhone}
        />
      )}

      {activeTab === "fazenda" && editingFarm && (
        <FarmEditForm 
          farmData={farmData}
          onSave={handleSaveFarm}
          onCancel={() => setEditingFarm(false)}
          saving={savingFarm}
        />
      )}
    </>
  ) : (
    <ProfileEditForm 
      formData={formData}
      onChange={handleChange}
      onIconSelect={handleIconSelect}
    />
  )}
</div>
      </div>

      <MenuBar />
    </>
  )
}
