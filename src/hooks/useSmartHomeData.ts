import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applySettings,
  fetchSettingsFromBackend,
  fetchSmartHomeSnapshot,
  loadSettings,
} from '../data/mockApi'
import type {
  SmartHomeSettings,
  SmartHomeSnapshot,
} from '../types/smartHome'
import {
  type HistoricalRecord,
  getHistoricalLogs,
  syncHistoricalLogs,
} from '../utils/history'

const FALLBACK_SETTINGS: SmartHomeSettings = {
  autoMode: true,
  targetTemperatureC: 24,
  targetHumidityPercent: 55,
  waterBowlLevelTargetMl: 200,
  feederSchedule: '08:00, 13:00, 20:00',
  purifierIntensity: 'medium',
}

export function useSmartHomeData() {
  const initialSettings = useMemo(
    () => loadSettings() ?? FALLBACK_SETTINGS,
    [],
  )

  const [settings, setSettings] = useState<SmartHomeSettings>(initialSettings)
  const settingsRef = useRef<SmartHomeSettings>(initialSettings)
  const [snapshot, setSnapshot] = useState<SmartHomeSnapshot | null>(null)
  const [history, setHistory] = useState<HistoricalRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [errorKey, setErrorKey] = useState<'fetch' | 'settings' | 'backend' | null>(
    null,
  )

  const applyLocalSettings = useCallback((next: SmartHomeSettings) => {
    settingsRef.current = next
    setSettings(next)
  }, [])

  const refresh = useCallback(
    async (settingsOverride?: SmartHomeSettings) => {
      setLoading(true)
      setErrorKey(null)
      try {
        const activeSettings = settingsOverride ?? settingsRef.current
        const data = await fetchSmartHomeSnapshot(activeSettings)
        setSnapshot(data)
        if (data) {
          const logs = await syncHistoricalLogs(data)
          if (logs.length) {
            setHistory(logs)
          }
        }
      } catch (err) {
        console.error(err)
        if (err instanceof Error) {
          if (err.message === 'mock-data-disabled') {
            setErrorKey('backend')
          } else if (err.message === 'snapshot-not-found') {
            setSnapshot(null)
            setHistory([])
            setErrorKey(null)
          } else {
            setErrorKey('fetch')
          }
        } else {
          setErrorKey('fetch')
        }
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const updateSettings = useCallback(
    async (next: Partial<SmartHomeSettings>) => {
      const merged = { ...settingsRef.current, ...next }
      applyLocalSettings(merged)
      setLoading(true)
      setErrorKey(null)
      try {
        await applySettings(merged)
        await refresh(merged)
      } catch (err) {
        console.error(err)
        setErrorKey('settings')
      } finally {
        setLoading(false)
      }
    },
    [applyLocalSettings, refresh],
  )

  useEffect(() => {
    let cancelled = false

    getHistoricalLogs().then((logs) => {
      if (!cancelled && logs.length) {
        setHistory(logs)
      }
    })

    const bootstrap = async () => {
      const remoteSettings = await fetchSettingsFromBackend()
      if (cancelled) return

      if (remoteSettings && JSON.stringify(remoteSettings) !== JSON.stringify(settingsRef.current)) {
        applyLocalSettings(remoteSettings)
        await refresh(remoteSettings)
      } else {
        await refresh()
      }
    }

    bootstrap()

    return () => {
      cancelled = true
    }
  }, [applyLocalSettings, refresh])

  return {
    snapshot,
    history,
    settings,
    loading,
    error: errorKey,
    refresh,
    updateSettings,
  }
}
