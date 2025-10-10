export interface SmartHomeReading {
  temperatureC: number
  humidityPercent: number
  waterIntakeMl: number
  airQualityIndex: number
  catWeightKg: number
  lastFeedingMinutesAgo: number
  timestamp: string
}

export interface SmartHomeSettings {
  autoMode: boolean
  targetTemperatureC: number
  targetHumidityPercent: number
  waterBowlLevelTargetMl: number
  feederSchedule: string
  purifierIntensity: 'low' | 'medium' | 'high'
}

export interface DeviceStatus {
  heaterOn: boolean
  humidifierOn: boolean
  waterPumpOn: boolean
  feederActive: boolean
  purifierOn: boolean
}

export interface SmartHomeSnapshot {
  reading: SmartHomeReading
  settings: SmartHomeSettings
  status: DeviceStatus
}

export interface AIInsight {
  title: string
  description: string
  severity: 'info' | 'warning' | 'critical'
}
