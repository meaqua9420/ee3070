import { useCallback, useEffect, useState } from 'react'
import { fetchBehaviorForecast } from '../utils/backendClient'
import type { BehaviorForecast } from '../types/smartHome'

interface BehaviorForecastState {
  forecast: BehaviorForecast | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useBehaviorForecast(options: { disabled?: boolean; catId?: string | null; language?: string } = {}): BehaviorForecastState {
  const { disabled = false, catId = null, language } = options
  const [forecast, setForecast] = useState<BehaviorForecast | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (disabled) {
      setForecast(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const payload = await fetchBehaviorForecast(catId ?? undefined, language)
      setForecast(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [disabled, catId, language])

  useEffect(() => {
    if (!disabled) {
      void load()
    }
  }, [disabled, load, catId])

  return {
    forecast,
    loading,
    error,
    refresh: load,
  }
}
