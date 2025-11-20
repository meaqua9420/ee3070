import type { SmartHomeSettings } from './types'

export const DEFAULT_SETTINGS: SmartHomeSettings = {
  autoMode: true,
  targetTemperatureC: 24,
  targetHumidityPercent: 55,
  waterBowlLevelTargetMl: 200,
  feederSchedule: '08:00, 13:00, 20:00',
  purifierIntensity: 'medium',
}

export const DEFAULT_HISTORY_LIMIT = 24
