import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import MenuBar from "../../components/App/Global/MenuBar"
import { ACCOUNT_ROLES } from "../../services/accessControl"
import { getUserFarm, onAuthStateChanged, supabase } from "../../services/supabase"
import "../../styles/App/TeamAccess.css"

const fallbackTasks = [
  { id: "t1", title: "Inspecionar Setor A12", status: "andamento", due: "Hoje, 16:00", priority: "Alta" },
  { id: "t2", title: "Registrar umidade do solo", status: "pendente", due: "Hoje, 17:30", priority: "Media" },
  { id: "t3", title: "Enviar observacao do plantio", status: "concluida", due: "Ontem", priority: "Baixa" },
]

export default function EmployeeWork() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [farmData, setFarmData] = useState(null)
  const [tasks, setTasks] = useState(fallbackTasks)
  const [workStatus, setWorkStatus] = useState("trabalhando")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (currentUser) => {
      if (!currentUser) {
        navigate("/login", { replace: true })
        return
      }

      setUser(currentUser)
      let userProfile = null

      try {
        const { data, error } = await supabase
          .from("users")
          .select("*")
          .eq("id", currentUser.id)
          .maybeSingle()

        if (error) throw error

        if (data) {
          userProfile = { id: data.id, ...data }
        }
      } catch (error) {
        console.error("Erro ao carregar perfil operacional:", error)
      }

      if (userProfile) {
        setProfile(userProfile)
        setWorkStatus(userProfile.status === "offline" ? "trabalhando" : userProfile.status || "trabalhando")
      }

      try {
        const ownerId = userProfile?.ownerId || userProfile?.teamId || currentUser.id
        const farm = await getUserFarm(ownerId)
        if (farm) setFarmData(farm)
      } catch (error) {
        console.error("Erro ao carregar fazenda operacional:", error)
      }

      try {
        const { data, error } = await supabase
          .from("tasks")
          .select("*")
          .eq("employeeId", currentUser.id)

        if (error) throw error
        if (data?.length) setTasks(data)
      } catch (error) {
        console.error("Erro ao carregar tarefas:", error)
      }
    })

    return () => unsubscribe()
  }, [navigate])

  const stats = useMemo(() => {
    const total = tasks.length || 1
    const done = tasks.filter((task) => task.status === "concluida").length

    return {
      pending: tasks.filter((task) => task.status === "pendente").length,
      active: tasks.filter((task) => task.status === "andamento").length,
      done,
      productivity: Math.round((done / total) * 100),
    }
  }, [tasks])

  const roleLabel = profile?.role === ACCOUNT_ROLES.COLLABORATOR ? "colaborador" : "funcionário"

  const updateTaskStatus = async (taskId, status) => {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status } : task))

    try {
      if (!String(taskId).startsWith("t")) {
        const { error } = await supabase
          .from("tasks")
          .update({
            status,
            updatedAt: new Date().toISOString(),
          })
          .eq("id", taskId)

        if (error) throw error
      }
    } catch (error) {
      console.error("Erro ao atualizar tarefa:", error)
    }
  }

  const updateStatus = async (status) => {
    setWorkStatus(status)

    if (!user) return

    try {
      const { error } = await supabase
        .from("users")
        .update({
          status,
          lastActivityAt: new Date().toISOString(),
        })
        .eq("id", user.id)

      if (error) throw error
    } catch (error) {
      console.error("Erro ao atualizar status:", error)
    }
  }

  const submitNote = async () => {
    if (!note.trim() || !user) return

    setSaving(true)

    try {
      const { error } = await supabase.from("activities").insert({
        employeeId: user.id,
        employeeName: profile?.name || user.email,
        type: "observacao",
        note: note.trim(),
        createdAt: new Date().toISOString(),
      })

      if (error) throw error
      setNote("")
    } catch (error) {
      console.error("Erro ao salvar observacao:", error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="team-page employee-page" data-system-bar-color="#f7f5f0">
      <section className="team-hero">
        <div>
          <span className="team-kicker">Area exclusiva do {roleLabel}</span>
          <h1>Funcionários</h1>
          <p>Olá, {profile?.name?.split(" ")[0] || "Funcionário"}. Acompanhe suas tarefas, horários, observações e desempenho individual.</p>
        </div>

        <div className="employee-clock-card">
          <span>Entrada</span>
          <strong>07:30</strong>
          <span>Saída prevista</span>
          <strong>17:30</strong>
        </div>
      </section>

      <section className="status-grid">
        {["trabalhando", "pausa", "ausente", "offline"].map((status) => (
          <button
            key={status}
            className={`status-chip ${workStatus === status ? "active" : ""}`}
            onClick={() => updateStatus(status)}
          >
            {status}
          </button>
        ))}
      </section>

      <section className="team-metrics">
        <article><span>Pendentes</span><strong>{stats.pending}</strong></article>
        <article><span>Em andamento</span><strong>{stats.active}</strong></article>
        <article><span>Concluídas</span><strong>{stats.done}</strong></article>
        <article><span>Produtividade</span><strong>{stats.productivity}%</strong></article>
      </section>

      <section className="team-panel employee-farm-panel">
        <div className="team-section-header">
          <h2>Dados da fazenda</h2>
          <span>Consulta operacional</span>
        </div>

        {farmData ? (
          <>
            <div className="employee-farm-header">
              <div className="employee-farm-icon">
                <span className="material-symbols-outlined">agriculture</span>
              </div>
              <div>
                <strong>{farmData.name || "Fazenda"}</strong>
                <p>{farmData.municipio || "Cidade não informada"}{farmData.uf ? `, ${farmData.uf}` : ""}</p>
              </div>
            </div>

            <div className="employee-farm-grid">
              <span>Área total <strong>{farmData.area_total || "0"} ha</strong></span>
              <span>Plantação <strong>{farmData.plantacao || "Não informada"}</strong></span>
              <span>Telefone <strong>{farmData.telefone || "Não informado"}</strong></span>
              <span>CEP <strong>{farmData.cep || "Não informado"}</strong></span>
            </div>
          </>
        ) : (
          <p className="team-empty-text">Nenhuma fazenda vinculada ao seu perfil.</p>
        )}
      </section>

      <section className="team-panel">
        <div className="team-section-header">
          <h2>Minhas tarefas</h2>
          <span>{tasks.length} registros</span>
        </div>

        <div className="task-list">
          {tasks.map((task) => (
            <article className="task-card" key={task.id}>
              <div>
                <strong>{task.title}</strong>
                <p>Prazo: {task.due || "Sem prazo"} • Prioridade: {task.priority || "Media"}</p>
              </div>
              <select value={task.status} onChange={(event) => updateTaskStatus(task.id, event.target.value)}>
                <option value="pendente">Pendente</option>
                <option value="andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
              </select>
            </article>
          ))}
        </div>
      </section>

      <section className="team-panel">
        <div className="team-section-header">
          <h2>Observações</h2>
          <span>Enviar atualização</span>
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Descreva uma ocorrência, avanço ou necessidade no campo..."
        />
        <button className="team-primary-btn" onClick={submitNote} disabled={saving || !note.trim()}>
          {saving ? "Enviando..." : "Enviar observação"}
        </button>
      </section>

      <MenuBar />
    </main>
  )
}
