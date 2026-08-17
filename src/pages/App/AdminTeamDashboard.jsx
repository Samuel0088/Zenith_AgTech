import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import MenuBar from "../../components/App/Global/MenuBar"
import { ACCOUNT_ROLES } from "../../services/accessControl"
import { getCurrentUser, supabase } from "../../services/supabase"
import "../../styles/App/TeamAccess.css"

const demoEmployees = [
  {
    id: "demo-1",
    name: "Ana Paula",
    position: "Operadora de drone",
    sector: "Mapeamento",
    status: "trabalhando",
    entry: "07:20",
    exit: "17:10",
    hours: 8.6,
    pending: 2,
    active: 1,
    done: 9,
    daily: 91,
    weekly: 86,
    monthly: 88,
    delays: 0,
    absences: 0,
    lastActivity: "Atualizou voo do Setor A12 há 18 min",
  },
  {
    id: "demo-2",
    name: "Carlos Mendes",
    position: "Auxiliar de campo",
    sector: "Plantio",
    status: "pausa",
    entry: "07:45",
    exit: "17:30",
    hours: 7.8,
    pending: 4,
    active: 2,
    done: 5,
    daily: 72,
    weekly: 78,
    monthly: 81,
    delays: 1,
    absences: 0,
    lastActivity: "Registrou observação de umidade há 42 min",
  },
  {
    id: "demo-3",
    name: "Marina Costa",
    position: "Técnica agrícola",
    sector: "Diagnóstico",
    status: "offline",
    entry: "08:05",
    exit: "16:58",
    hours: 7.2,
    pending: 1,
    active: 0,
    done: 7,
    daily: 84,
    weekly: 89,
    monthly: 87,
    delays: 2,
    absences: 1,
    lastActivity: "Finalizou diagnóstico foliar ontem",
  },
]

const statusLabels = {
  online: "Online",
  offline: "Offline",
  trabalhando: "Trabalhando",
  pausa: "Em pausa",
  ausente: "Ausente",
}

export default function AdminTeamDashboard() {
  const location = useLocation()
  const assignTaskRef = useRef(null)
  const taskInputRef = useRef(null)
  const [employees, setEmployees] = useState(demoEmployees)
  const [selectedId, setSelectedId] = useState(demoEmployees[0].id)
  const [filters, setFilters] = useState({ employee: "", sector: "todos", status: "todos", date: "" })
  const [taskTitle, setTaskTitle] = useState("")
  const [showNewEmployee, setShowNewEmployee] = useState(false)
  const [newEmployee, setNewEmployee] = useState({
    name: "",
    email: "",
    position: "",
    sector: "",
    role: ACCOUNT_ROLES.EMPLOYEE,
  })

  useEffect(() => {
    async function loadEmployees() {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("*")
          .in("role", [ACCOUNT_ROLES.EMPLOYEE, ACCOUNT_ROLES.COLLABORATOR])

        if (error) throw error

        if (data?.length > 0) {
          setEmployees(data.map((employee, index) => ({
            id: employee.id,
            name: employee.name || "Funcionário",
            position: employee.position || "Funcionário de campo",
            sector: employee.sector || "Campo",
            status: employee.status || "offline",
            entry: employee.entry || "07:30",
            exit: employee.exit || "17:30",
            hours: employee.hours || 0,
            pending: employee.pendingTasks || 0,
            active: employee.activeTasks || 0,
            done: employee.completedTasks || 0,
            daily: employee.dailyProductivity || 0,
            weekly: employee.weeklyProductivity || 0,
            monthly: employee.monthlyProductivity || 0,
            delays: employee.delays || 0,
            absences: employee.absences || 0,
            lastActivity: employee.lastActivity || "Sem atividade registrada",
            colorIndex: index,
          })))
          setSelectedId(data[0].id)
        }
      } catch (error) {
        console.error("Erro ao carregar equipe:", error)
      }
    }

    loadEmployees()
  }, [])

  const sectors = useMemo(() => ["todos", ...new Set(employees.map((employee) => employee.sector))], [employees])

  const filteredEmployees = useMemo(() => employees.filter((employee) => {
    const byEmployee = !filters.employee || employee.name.toLowerCase().includes(filters.employee.toLowerCase())
    const bySector = filters.sector === "todos" || employee.sector === filters.sector
    const byStatus = filters.status === "todos" || employee.status === filters.status
    return byEmployee && bySector && byStatus
  }), [employees, filters])

  const selected = employees.find((employee) => employee.id === selectedId) || filteredEmployees[0] || employees[0]

  useEffect(() => {
    if (location.hash !== "#nova-tarefa" || !assignTaskRef.current) return

    assignTaskRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
    window.setTimeout(() => taskInputRef.current?.focus(), 360)
  }, [location.hash, selected?.id])

  const totals = useMemo(() => ({
    employees: employees.length,
    working: employees.filter((employee) => employee.status === "trabalhando" || employee.status === "online").length,
    pending: employees.reduce((sum, employee) => sum + employee.pending, 0),
    productivity: Math.round(employees.reduce((sum, employee) => sum + employee.daily, 0) / Math.max(employees.length, 1)),
  }), [employees])

  const assignTask = async () => {
    if (!taskTitle.trim() || !selected) return

    try {
      const { error } = await supabase.from("tasks").insert({
        employeeId: selected.id,
        employeeName: selected.name,
        title: taskTitle.trim(),
        status: "pendente",
        priority: "Media",
        due: filters.date || "Sem prazo",
        createdAt: new Date().toISOString(),
      })

      if (error) throw error
      setTaskTitle("")
    } catch (error) {
      console.error("Erro ao atribuir tarefa:", error)
    }
  }

  const registerEmployee = async () => {
    if (!newEmployee.name.trim() || !newEmployee.email.trim()) return

    const employeePayload = {
      name: newEmployee.name.trim(),
      email: newEmployee.email.trim().toLowerCase(),
      position: newEmployee.position.trim() || (newEmployee.role === ACCOUNT_ROLES.COLLABORATOR ? "Colaborador" : "Funcionário de campo"),
      sector: newEmployee.sector.trim() || "Campo",
      role: newEmployee.role,
      ownerId: "",
      teamId: "",
      status: "offline",
      entry: "--:--",
      exit: "--:--",
      hours: 0,
      pendingTasks: 0,
      activeTasks: 0,
      completedTasks: 0,
      dailyProductivity: 0,
      weeklyProductivity: 0,
      monthlyProductivity: 0,
      delays: 0,
      absences: 0,
      lastActivity: "Cadastro criado pelo administrador",
      inviteStatus: "pending",
      createdAt: new Date().toISOString(),
    }

    try {
      const currentUser = await getCurrentUser()
      const payload = {
        ...employeePayload,
        ownerId: currentUser?.id || "",
        teamId: currentUser?.id || "",
      }
      const { data, error } = await supabase
        .from("users")
        .insert(payload)
        .select("*")
        .single()

      if (error) throw error

      const createdEmployee = {
        id: data.id,
        ...payload,
        entry: payload.entry,
        exit: payload.exit,
        hours: payload.hours,
        pending: 0,
        active: 0,
        done: 0,
        daily: 0,
        weekly: 0,
        monthly: 0,
        delays: 0,
        absences: 0,
        lastActivity: payload.lastActivity,
      }

      setEmployees((current) => [createdEmployee, ...current])
      setSelectedId(data.id)
      setNewEmployee({ name: "", email: "", position: "", sector: "", role: ACCOUNT_ROLES.EMPLOYEE })
      setShowNewEmployee(false)
    } catch (error) {
      console.error("Erro ao cadastrar funcionário:", error)
    }
  }

  return (
    <main className="team-page admin-page" data-system-bar-color="#f7f5f0">
      <section className="team-hero admin-hero">
        <div>
          <span className="team-kicker">Dashboard administrativo</span>
          <h1>Monitoramento da equipe</h1>
          <p>Controle status, tarefas, horários, produtividade e desempenho de cada funcionário.</p>
        </div>
      </section>

      <section className="team-metrics">
        <article><span>Funcionários</span><strong>{totals.employees}</strong></article>
        <article><span>Em operação</span><strong>{totals.working}</strong></article>
        <article><span>Tarefas pendentes</span><strong>{totals.pending}</strong></article>
        <article><span>Produtividade média</span><strong>{totals.productivity}%</strong></article>
      </section>

      <section className="team-filters">
        <input
          value={filters.employee}
          onChange={(event) => setFilters((current) => ({ ...current, employee: event.target.value }))}
          placeholder="Filtrar funcionário"
        />
        <select value={filters.sector} onChange={(event) => setFilters((current) => ({ ...current, sector: event.target.value }))}>
          {sectors.map((sector) => <option key={sector} value={sector}>{sector === "todos" ? "Todos os setores" : sector}</option>)}
        </select>
        <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
          <option value="todos">Todos os status</option>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input
          type="date"
          value={filters.date}
          onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}
        />
      </section>

      <section className="admin-grid">
        <div className="team-panel">
          <div className="team-section-header">
            <h2>Equipe</h2>
            <button className="team-link-btn" onClick={() => setShowNewEmployee((value) => !value)}>
              {showNewEmployee ? "Fechar" : "Novo funcionário"}
            </button>
          </div>

          {showNewEmployee && (
            <div className="new-employee-form">
              <input
                value={newEmployee.name}
                onChange={(event) => setNewEmployee((current) => ({ ...current, name: event.target.value }))}
                placeholder="Nome do funcionário"
              />
              <input
                value={newEmployee.email}
                onChange={(event) => setNewEmployee((current) => ({ ...current, email: event.target.value }))}
                placeholder="Email de acesso"
                type="email"
              />
              <input
                value={newEmployee.position}
                onChange={(event) => setNewEmployee((current) => ({ ...current, position: event.target.value }))}
                placeholder="Cargo"
              />
              <input
                value={newEmployee.sector}
                onChange={(event) => setNewEmployee((current) => ({ ...current, sector: event.target.value }))}
                placeholder="Setor"
              />
              <select
                value={newEmployee.role}
                onChange={(event) => setNewEmployee((current) => ({ ...current, role: event.target.value }))}
              >
                <option value={ACCOUNT_ROLES.EMPLOYEE}>Funcionário</option>
                <option value={ACCOUNT_ROLES.COLLABORATOR}>Colaborador</option>
              </select>
              <button onClick={registerEmployee}>Cadastrar</button>
            </div>
          )}

          <div className="employee-table">
            {filteredEmployees.map((employee) => (
              <button
                key={employee.id}
                className={`employee-row ${selected?.id === employee.id ? "active" : ""}`}
                onClick={() => setSelectedId(employee.id)}
              >
                <span className={`status-dot ${employee.status}`}></span>
                <strong>{employee.name}</strong>
                <span className="employee-position">{employee.position}</span>
                <span className="employee-status">{statusLabels[employee.status] || employee.status}</span>
                <span className="employee-productivity">{employee.daily}%</span>
              </button>
            ))}
          </div>
        </div>

        {selected && (
          <aside className="team-panel employee-detail">
            <div className="detail-header">
              <div className="employee-avatar">{selected.name.slice(0, 1)}</div>
              <div>
                <h2>{selected.name}</h2>
                <p>{selected.position} • {selected.sector}</p>
              </div>
            </div>

            <div className="detail-stats">
              <span>Entrada <strong>{selected.entry}</strong></span>
              <span>Saída <strong>{selected.exit}</strong></span>
              <span>Horas <strong>{selected.hours}h</strong></span>
              <span>Atrasos <strong>{selected.delays}</strong></span>
              <span>Faltas <strong>{selected.absences}</strong></span>
              <span>Status <strong>{statusLabels[selected.status]}</strong></span>
            </div>

            <div className="productivity-bars">
              {[
                ["Diária", selected.daily],
                ["Semanal", selected.weekly],
                ["Mensal", selected.monthly],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <div><i style={{ width: `${value}%` }}></i></div>
                  <strong>{value}%</strong>
                </div>
              ))}
            </div>

            <p className="last-activity"><strong>Última atividade:</strong> {selected.lastActivity}</p>

            <div className="assign-task" id="nova-tarefa" ref={assignTaskRef}>
              <input
                ref={taskInputRef}
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="Nova tarefa para este funcionário"
              />
              <button onClick={assignTask}>Atribuir tarefa</button>
            </div>

            <div className="detail-actions">
              <button>Editar prazo</button>
              <button>Enviar aviso</button>
              <button>Gerar relatório</button>
            </div>
          </aside>
        )}
      </section>

      <MenuBar />
    </main>
  )
}
