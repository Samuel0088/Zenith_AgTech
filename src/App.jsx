// App.jsx do PWA
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom"
import { useState, useEffect, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Navigate } from "react-router-dom"
import { ACCOUNT_ROLES, getRoleHomePath, getUserAccessProfile } from "./services/accessControl"
import { onAuthStateChanged } from "./services/supabase"

import Intro from "./pages/App/Intro"
import Login from "./pages/App/Login"
import CadastroCompleto from "./pages/App/CadastroCompleto"
import CadastrarFazenda from "./pages/App/CadastroFazenda"
import Home from "./pages/App/Home"
import Profile from "./pages/App/Profile"
import ForgotPassword from "./pages/App/ForgotPassword"
import Explore from "./pages/App/Explore"
import Planos from "./pages/App/Planos"
import EmployeeWork from "./pages/App/EmployeeWork"
import AdminTeamDashboard from "./pages/App/AdminTeamDashboard"

// Componentes
import SplashScreen from "./components/App/Global/SplashScreen"
import InstallPrompt from "./components/App/Global/InstallPrompt"
import InstallSuccess from "./components/App/Global/InstallSuccess"
import UpdatePrompt from "./components/App/Global/UpdatePrompt"
import AccessibilityTextControls from "./components/App/Global/AccessibilityTextControls"
import ProfileLoadingScreen from "./components/App/Profile/ProfileLoadScreen"
import SystemBarTheme from "./components/App/System/SystemBarTheme"

// Estilos
import "./App.css"

const UPDATE_PROMPT_PENDING_KEY = "zenithUpdatePromptPending"

function AccessibilityGate() {
  const location = useLocation()
  const hiddenRoutes = ["/", "/login", "/register", "/cadastrar-fazenda"]

  if (hiddenRoutes.includes(location.pathname)) return null

  return <AccessibilityTextControls />
}

function RouteChangeLoader() {
  const location = useLocation()
  const firstRenderRef = useRef(true)
  const previousPathRef = useRef(location.pathname)
  const [showRouteLoading, setShowRouteLoading] = useState(false)
  const internalRoutes = ["/home", "/profile", "/explore", "/plans"]

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      previousPathRef.current = location.pathname
      sessionStorage.removeItem("zenithShowWhiteLoaderOnce")
      sessionStorage.removeItem("zenithSkipWhiteLoaderOnce")
      return
    }

    const previousPath = previousPathRef.current
    previousPathRef.current = location.pathname
    const requestedWhiteLoader =
      sessionStorage.getItem("zenithShowWhiteLoaderOnce") === "true"
    const blockWhiteLoaderUntil = Number(
      sessionStorage.getItem("zenithBlockWhiteLoaderUntil") || 0
    )
    const isWhiteLoaderBlocked = Date.now() < blockWhiteLoaderUntil

    sessionStorage.removeItem("zenithShowWhiteLoaderOnce")

    const shouldShowLoader =
      requestedWhiteLoader &&
      !isWhiteLoaderBlocked &&
      internalRoutes.includes(previousPath) &&
      internalRoutes.includes(location.pathname)

    if (!shouldShowLoader) {
      if (!isWhiteLoaderBlocked && blockWhiteLoaderUntil > 0) {
        sessionStorage.removeItem("zenithBlockWhiteLoaderUntil")
      }
      setShowRouteLoading(false)
      return
    }

    setShowRouteLoading(true)
    const timer = setTimeout(() => setShowRouteLoading(false), 420)

    return () => clearTimeout(timer)
  }, [location.pathname])

  if (!showRouteLoading) return null

  return <ProfileLoadingScreen message="Carregando..." />
}

function ProtectedRoute({ allowedRoles, children }) {
  const [state, setState] = useState({
    loading: true,
    user: null,
    profile: null,
  })

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (currentUser) => {
      if (!currentUser) {
        setState({ loading: false, user: null, profile: null })
        return
      }

      const profile = await getUserAccessProfile(currentUser.id)
      setState({ loading: false, user: currentUser, profile })
    })

    return () => unsubscribe()
  }, [])

  if (state.loading) return <ProfileLoadingScreen message="Carregando acesso..." />
  if (!state.user) return <Navigate to="/login" replace />

  const role = state.profile?.role || ACCOUNT_ROLES.ADMIN

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={getRoleHomePath(role)} replace />
  }

  return children
}

const pageTransition = {
  type: "tween",
  ease: [0.22, 1, 0.36, 1],
  duration: 0.32,
}

function AnimatedRoutes({ setAppLoading }) {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        className="app-route-transition"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={pageTransition}
      >
        <Routes location={location}>
          <Route path="/" element={<Intro />} />
          <Route path="/login" element={<Login setAppLoading={setAppLoading} />} />
          <Route path="/register" element={<CadastroCompleto setAppLoading={setAppLoading} />} />
          <Route path="/cadastrar-fazenda" element={<CadastrarFazenda setAppLoading={setAppLoading} />} />
          <Route path="/home" element={<ProtectedRoute allowedRoles={[ACCOUNT_ROLES.ADMIN]}><Home /></ProtectedRoute>} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/explore" element={<ProtectedRoute allowedRoles={[ACCOUNT_ROLES.ADMIN]}><Explore /></ProtectedRoute>} />
          <Route path="/plans" element={<ProtectedRoute allowedRoles={[ACCOUNT_ROLES.ADMIN]}><Planos /></ProtectedRoute>} />
          <Route path="/funcionarios" element={<ProtectedRoute allowedRoles={[ACCOUNT_ROLES.EMPLOYEE, ACCOUNT_ROLES.COLLABORATOR]}><EmployeeWork /></ProtectedRoute>} />
          <Route path="/employee" element={<Navigate to="/funcionarios" replace />} />
          <Route path="/admin/team" element={<ProtectedRoute allowedRoles={[ACCOUNT_ROLES.ADMIN]}><AdminTeamDashboard /></ProtectedRoute>} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

function App() {
  const [loading, setLoading] = useState(true)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [showInstallSuccess, setShowInstallSuccess] = useState(false)
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false)
  const [waitingServiceWorker, setWaitingServiceWorker] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)

  
  
  useEffect(() => {
    // Detectar dispositivo
    const userAgent = navigator.userAgent
    setIsIOS(/iPhone|iPad|iPod/i.test(userAgent))
    setIsAndroid(/Android/i.test(userAgent))

    // Verificar se já está instalado (modo standalone)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         window.navigator.standalone === true
    
    if (isStandalone) {
      setIsInstalled(true)
      console.log('✅ App rodando em modo standalone')
      return
    }

    // Verificar parâmetros da URL
    const params = new URLSearchParams(window.location.search)
    const shouldInstall = params.get('install') === 'true'
    const source = params.get('source')
    
    console.log('📱 Modo:', isStandalone ? 'standalone' : 'navegador')
    console.log('🔧 Parâmetros:', { shouldInstall, source })

    // Se veio para instalar, mostrar prompt após 1 segundo
    if (shouldInstall && !isStandalone) {
      setTimeout(() => {
        setShowInstallPrompt(true)
      }, 1000)
    }

    // Capturar evento de instalação
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      console.log('📲 Evento beforeinstallprompt capturado')
      setDeferredPrompt(e)
    }

    

    // Quando o app for instalado
    const handleAppInstalled = (e) => {
      console.log('🎉 App instalado com sucesso!', e)
      setIsInstalled(true)
      setShowInstallPrompt(false)
      setShowInstallSuccess(true)
      setDeferredPrompt(null)
      
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    const markUpdatePending = () => {
      localStorage.setItem(UPDATE_PROMPT_PENDING_KEY, "true")
    }

    const showUpdate = (worker = null) => {
      setWaitingServiceWorker(worker)
      setShowUpdatePrompt(true)
    }

    const showWaitingUpdate = (registration) => {
      const worker = registration?.waiting

      if (worker && navigator.serviceWorker.controller) {
        markUpdatePending()
        showUpdate(worker)
        return
      }

      if (localStorage.getItem(UPDATE_PROMPT_PENDING_KEY) === "true") {
        showUpdate()
      }
    }

    const handleUpdateAvailable = (event) => {
      const worker = event.detail?.worker || event.detail?.registration?.waiting
      if (!worker) return

      markUpdatePending()
      showUpdate(worker)
    }

    navigator.serviceWorker?.getRegistration?.().then(showWaitingUpdate)
    window.addEventListener("app-update-available", handleUpdateAvailable)

    return () => {
      window.removeEventListener("app-update-available", handleUpdateAvailable)
    }
  }, [])


const handleInstall = async () => {
  if (!deferredPrompt) {
    console.log('❌ Prompt não disponível')
    return
  }

  setShowInstallPrompt(false)
  await deferredPrompt.prompt()

  const choiceResult = await deferredPrompt.userChoice

  if (choiceResult.outcome === 'accepted') {
    console.log('✅ Usuário aceitou instalar')
  } else {
    console.log('❌ Usuário recusou')
  }

  setDeferredPrompt(null)
}

const handleAppUpdate = () => {
  localStorage.removeItem(UPDATE_PROMPT_PENDING_KEY)

  setShowUpdatePrompt(false)

  if (waitingServiceWorker) {
    waitingServiceWorker.postMessage({ type: "SKIP_WAITING" })
    return
  }

  window.location.reload()
}

const finishInitialSplash = () => {
  setLoading(false)
}

  return (
    <BrowserRouter>
      <SystemBarTheme />
      <AnimatePresence mode="wait">
        {loading ? (
          <SplashScreen key="splash" onComplete={finishInitialSplash} />
        ) : (
          <>
            {/* Prompt de instalação */}
            {showInstallPrompt && !isInstalled && (
              <InstallPrompt 
                onInstall={handleInstall}
                onClose={() => setShowInstallPrompt(false)}
                isIOS={isIOS}
                isAndroid={isAndroid}
                hasPrompt={!!deferredPrompt}
              />
            )}

            {/* Mensagem de sucesso após instalação */}
            {showInstallSuccess && (
              <InstallSuccess 
                onClose={() => setShowInstallSuccess(false)}
                isIOS={isIOS}
                isAndroid={isAndroid}
              />
            )}

            {showUpdatePrompt && (
              <UpdatePrompt
                onUpdate={handleAppUpdate}
                onClose={() => setShowUpdatePrompt(false)}
              />
            )}
            
            <AnimatedRoutes setAppLoading={setLoading} />
            <RouteChangeLoader />
            <AccessibilityGate />
          </>
        )}
      </AnimatePresence>
    </BrowserRouter>
  )
}

export default App
