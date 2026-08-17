import { useEffect, useState } from "react"
import { getUserFarm, onAuthStateChanged } from "../../../../services/supabase"

export function useFarm() {
  const [farmData, setFarmData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (user) => {
      if (!user) {
        setFarmData(null)
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        const farm = await getUserFarm(user.id)
        setFarmData(farm)
      } catch (error) {
        console.error("Erro ao buscar fazenda:", error)
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [])

  return { farmData, loading }
}
