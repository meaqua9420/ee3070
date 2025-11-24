import { useCallback, useEffect, useState } from 'react'
import { fetchCareInsights } from '../utils/backendClient'
import type { CareInsight } from '../types/smartHome'

interface CareInsightsState {
  generatedAt: string | null
  sampleCount: number
  insights: CareInsight[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useCareInsights(options: { disabled?: boolean; catId?: string | null; language?: string } = {}): CareInsightsState {
  const { disabled = false, catId = null, language } = options
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [sampleCount, setSampleCount] = useState(0)
  const [insights, setInsights] = useState<CareInsight[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (disabled) {
      setInsights([])
      setGeneratedAt(null)
      setSampleCount(0)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const payload = await fetchCareInsights(catId ?? undefined, language)
      setGeneratedAt(payload.generatedAt)
      setSampleCount(payload.sampleCount)
      setInsights(payload.insights)
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
    generatedAt,
    sampleCount,
    insights,
    loading,
    error,
    refresh: load,
  }
}
