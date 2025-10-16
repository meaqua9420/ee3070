import { API_BASE_URL, getJson, postJson } from '../utils/backendClient'
import type { SmartHomeSnapshot, SmartHomeSettings } from '../types/smartHome'

const BASELINE = {
  temperatureC: 25,
  humidityPercent: 50,
  waterIntakeMl: 180,
  airQualityIndex: 25,
  catWeightKg: 4.1,
  lastFeedingMinutesAgo: 120,
}

const storage = typeof localStorage === 'undefined' ? undefined : localStorage

const getRandomDrift = (scale: number) => (Math.random() * 2 - 1) * scale

const FALLBACK_SETTINGS: SmartHomeSettings = {
  autoMode: true,
  targetTemperatureC: 24,
  targetHumidityPercent: 55,
  waterBowlLevelTargetMl: 200,
  feederSchedule: '08:00, 13:00, 20:00',
  purifierIntensity: 'medium',
}

function deriveStatus(reading: SmartHomeSnapshot['reading'], settings: SmartHomeSettings) {
  return {
    heaterOn: reading.temperatureC < settings.targetTemperatureC - 1,
    humidifierOn: reading.humidityPercent < settings.targetHumidityPercent - 3,
    waterPumpOn: reading.waterIntakeMl < settings.waterBowlLevelTargetMl - 20,
    feederActive: reading.lastFeedingMinutesAgo > 180,
    purifierOn: settings.purifierIntensity !== 'low',
  }
}

function buildMockSnapshot(settings?: SmartHomeSettings): SmartHomeSnapshot {
  const now = new Date()
  const reading = {
    temperatureC: +(BASELINE.temperatureC + getRandomDrift(2)).toFixed(1),
    humidityPercent: Math.round(BASELINE.humidityPercent + getRandomDrift(8)),
    waterIntakeMl: Math.max(
      0,
      Math.round(BASELINE.waterIntakeMl + getRandomDrift(40)),
    ),
    airQualityIndex: Math.max(
      0,
      Math.round(BASELINE.airQualityIndex + getRandomDrift(5)),
    ),
    catWeightKg: +(BASELINE.catWeightKg + getRandomDrift(0.2)).toFixed(2),
    lastFeedingMinutesAgo: Math.max(
      0,
      Math.round(BASELINE.lastFeedingMinutesAgo + getRandomDrift(30)),
    ),
    timestamp: now.toISOString(),
  }

  const activeSettings = settings ?? loadSettings() ?? FALLBACK_SETTINGS
  return {
    reading,
    settings: activeSettings,
    status: deriveStatus(reading, activeSettings),
  }
}

export async function fetchSmartHomeSnapshot(
  settings?: SmartHomeSettings,
): Promise<SmartHomeSnapshot> {
  const enableMocks =
    (import.meta.env.VITE_ENABLE_MOCKS ?? 'false').toString().toLowerCase() === 'true'

  if (API_BASE_URL) {
    const response = await getJson<SmartHomeSnapshot>('/api/snapshot/latest')
    if (response.ok && response.data) {
      const snapshot = response.data
      const activeSettings = snapshot.settings ?? settings ?? loadSettings() ?? FALLBACK_SETTINGS
      return {
        reading: snapshot.reading,
        settings: activeSettings,
        status: snapshot.status ?? deriveStatus(snapshot.reading, activeSettings),
      }
    }

    if (response.status === 404) {
      throw new Error('snapshot-not-found')
    }
  }

  if (!enableMocks) {
    throw new Error('mock-data-disabled')
  }

  await new Promise((resolve) => setTimeout(resolve, 200))
  return buildMockSnapshot(settings)
}

export async function applySettings(newSettings: SmartHomeSettings) {
  if (API_BASE_URL) {
    const response = await postJson('/api/settings', newSettings)
    if (!response.ok) {
      console.warn('[settings] Failed to persist settings to backend', response)
    }
  }

  storage?.setItem('smartCatHomeSettings', JSON.stringify(newSettings))
  return { ok: true }
}

export function loadSettings(): SmartHomeSettings | undefined {
  if (storage) {
    const stored = storage.getItem('smartCatHomeSettings')
    if (stored) {
      try {
        return JSON.parse(stored) as SmartHomeSettings
      } catch (error) {
        console.warn('Failed to parse stored settings', error)
      }
    }
  }

  return undefined
}

export async function fetchSettingsFromBackend() {
  if (!API_BASE_URL) return undefined
  const response = await getJson<SmartHomeSettings>('/api/settings')
  if (response.ok && response.data) {
    return response.data
  }
  return undefined
}
