import { useEffect, useRef, useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { getCurrentUser, onAuthStateChanged } from "../../../services/supabase"
import { ACCOUNT_ROLES, getUserAccessProfile, isOperationalRole } from "../../../services/accessControl"
import "../../../styles/Global/MenuBar.css"

const adminItems = [
  { path: "/home", icon: "home", label: "Home" },
  { path: "/admin/team", icon: "groups", label: "Equipe" },
  { path: "/admin/team", hash: "#nova-tarefa", icon: "add", label: "Nova tarefa", isPrimary: true },
  { path: "/explore", icon: "grid_view", label: "Explorar" },
  { path: "/profile", icon: "person", label: "Perfil" },
]

const employeeItems = [
  { path: "/funcionarios", icon: "assignment", label: "Tarefas" },
  { path: "/profile", icon: "person", label: "Perfil" },
]

export default function MenuBar() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const lastScrollYRef = useRef(0)
  const tickingRef = useRef(false)
  const [isVisible, setIsVisible] = useState(true)
  const [role, setRole] = useState(ACCOUNT_ROLES.ADMIN)
  const items = isOperationalRole(role) ? employeeItems : adminItems
  const isActive = ({ path, hash, isPrimary }) => {
    if (isPrimary) return location.pathname === path && location.hash === hash
    return location.pathname === path && !location.hash
  }
  const goToInternalPage = ({ path, hash }) => {
    if (location.pathname === path && location.hash === (hash || "")) return
    sessionStorage.setItem("zenithShowWhiteLoaderOnce", "true")
    navigate(`${path}${hash || ""}`)
  }

  useEffect(() => {
    lastScrollYRef.current = window.scrollY

    const handleScroll = () => {
      if (tickingRef.current) return

      tickingRef.current = true
      window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY
        const scrollDelta = currentScrollY - lastScrollYRef.current
        const isNearTop = currentScrollY < 12

        if (isNearTop) {
          setIsVisible(true)
        } else if (scrollDelta > 8) {
          setIsVisible(false)
        } else if (scrollDelta < -8) {
          setIsVisible(true)
        }

        lastScrollYRef.current = currentScrollY
        tickingRef.current = false
      })
    }

    window.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      window.removeEventListener("scroll", handleScroll)
    }
  }, [])

  useEffect(() => {
    const loadRole = async (currentUser) => {
      const user = currentUser || await getCurrentUser()
      if (!user) return
      const profile = await getUserAccessProfile(user.id)
      setRole(profile?.role || ACCOUNT_ROLES.ADMIN)
    }

    const handleRoleUpdated = () => loadRole()
    const unsubscribe = onAuthStateChanged(loadRole)
    window.addEventListener("zenith-user-role-updated", handleRoleUpdated)

    return () => {
      unsubscribe()
      window.removeEventListener("zenith-user-role-updated", handleRoleUpdated)
    }
  }, [])

  return (
    <nav className={`nav ${isVisible ? "nav--visible" : "nav--hidden"}`}>
      <ul className="nav__items" style={{ "--nav-item-count": items.length }}>
        {items.map((item) => {
          const { path, hash, icon, label, isPrimary } = item
          const active = isActive(item)
          return (
            <li
              key={`${path}${hash || ""}`}
              className={`nav__item${active ? " nav__item--active" : ""}${isPrimary ? " nav__item--primary" : ""}`}
            >
              <button
                className={`nav__item-btn${active ? " nav__item-btn--active" : ""}${isPrimary ? " nav__item-btn--primary" : ""}`}
                onClick={() => goToInternalPage(item)}
                aria-current={active ? "page" : undefined}
                aria-label={label}
              >
                <span className="material-symbols-outlined">{icon}</span>
                {!isPrimary && <span className="nav__label">{label}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
