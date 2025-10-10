import { useCallback, useEffect, useMemo, useState } from 'react'
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
  const [snapshot, setSnapshot] = useState<SmartHomeSnapshot | null>(null)
  const [history, setHistory] = useState<HistoricalRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [errorKey, setErrorKey] = useState<'fetch' | 'settings' | null>(null)

  const refresh = useCallback(
    async (settingsOverride?: SmartHomeSettings) => {
      setLoading(true)
      setErrorKey(null)
      try {
        const activeSettings = settingsOverride ?? settings
        const data = await fetchSmartHomeSnapshot(activeSettings)
        setSnapshot(data)
        const logs = await syncHistoricalLogs(data)
        if (logs.length) {
          setHistory(logs)
        }
      } catch (err) {
        console.error(err)
        setErrorKey('fetch')
      } finally {
        setLoading(false)
      }
    },
    [settings],
  )

  const updateSettings = useCallback(
    async (next: Partial<SmartHomeSettings>) => {
      const merged = { ...settings, ...next }
      setSettings(merged)
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
    [refresh, settings],
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

      if (remoteSettings) {
        setSettings(remoteSettings)
        await refresh(remoteSettings)
      } else {
        await refresh()
      }
    }

    bootstrap()

    return () => {
      cancelled = true
    }
  }, [refresh])

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
