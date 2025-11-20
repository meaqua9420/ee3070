import { DEFAULT_SETTINGS } from './constants'
import type {
  DeviceStatus,
  AudioStatus,
  UvFanStatus,
  SmartHomeReading,
  SmartHomeSettings,
  SmartHomeSnapshot,
  VisionInference,
  VisionStatus,
  FeederStatus,
  HydrationStatus,
  FeederScheduleSlot,
} from './types'

export function deriveStatus(reading: SmartHomeReading, settings: SmartHomeSettings): DeviceStatus {
  const remainingWaterMl = Math.max(
    0,
    settings.waterBowlLevelTargetMl - reading.waterIntakeMl,
  )
  const hydrationPumpActive =
    reading.hydration && typeof reading.hydration.pumpActive === 'boolean'
      ? reading.hydration.pumpActive
      : remainingWaterMl < settings.waterBowlLevelTargetMl - 20
  const feederActive =
    reading.feeder && typeof reading.feeder.feedingActive === 'boolean'
      ? reading.feeder.feedingActive
      : reading.lastFeedingMinutesAgo > 180
  return {
    heaterOn: reading.temperatureC < settings.targetTemperatureC - 1,
    humidifierOn: reading.humidityPercent < settings.targetHumidityPercent - 3,
    waterPumpOn: hydrationPumpActive,
    feederActive,
    purifierOn: settings.purifierIntensity !== 'low',
  }
}

export function buildSnapshot(
  reading: SmartHomeReading,
  settings?: SmartHomeSettings,
): SmartHomeSnapshot {
  const activeSettings = settings ?? DEFAULT_SETTINGS
  return {
    reading,
    settings: activeSettings,
    status: deriveStatus(reading, activeSettings),
  }
}

export function isSmartHomeReading(input: unknown): input is SmartHomeReading {
  if (!input || typeof input !== 'object') return false
  const data = input as Record<string, unknown>
  const requiredNumericFields: Array<keyof SmartHomeReading> = [
    'temperatureC',
    'humidityPercent',
    'waterIntakeMl',
    'airQualityIndex',
    'catWeightKg',
    'lastFeedingMinutesAgo',
  ]

  if (
    !requiredNumericFields.every(
      (key) => typeof data[key] === 'number' && Number.isFinite(data[key]),
    )
  ) {
    return false
  }

  if ('waterLevelPercent' in data) {
    if (typeof data.waterLevelPercent !== 'number' || !Number.isFinite(data.waterLevelPercent)) {
      return false
    }
    if (data.waterLevelPercent < 0 || data.waterLevelPercent > 100) {
      return false
    }
  }

  if ('ambientLightPercent' in data) {
    if (
      typeof data.ambientLightPercent !== 'number' ||
      !Number.isFinite(data.ambientLightPercent)
    ) {
      return false
    }
    if (data.ambientLightPercent < 0 || data.ambientLightPercent > 100) {
      return false
    }
  }

  if ('catPresent' in data) {
    if (typeof data.catPresent === 'number') {
      data.catPresent = data.catPresent > 0
    } else if (typeof data.catPresent !== 'boolean') {
      return false
    }
  }

  if ('foodWeightGrams' in data) {
    const rawWeight =
      typeof data.foodWeightGrams === 'number'
        ? data.foodWeightGrams
        : typeof data.foodWeightGrams === 'string'
          ? Number.parseFloat(data.foodWeightGrams)
          : Number.NaN
    if (!Number.isFinite(rawWeight)) {
      return false
    }
    data.foodWeightGrams = Math.max(0, rawWeight)
  }

  if (typeof data.timestamp !== 'string') {
    data.timestamp = new Date().toISOString()
  }

  if ('audio' in data && typeof data.audio !== 'undefined') {
    const audio = data.audio as Record<string, unknown>
    if (!audio || typeof audio !== 'object') {
      return false
    }

    const normalized: AudioStatus = {
      amplifierOnline: Boolean(audio.amplifierOnline),
      muted: Boolean(audio.muted),
      volumePercent: 0,
      activePattern: typeof audio.activePattern === 'string' ? audio.activePattern : String(audio.activePattern ?? ''),
      playing: Boolean(audio.playing),
      lastPattern:
        typeof audio.lastPattern === 'string'
          ? audio.lastPattern
          : audio.lastPattern === null || typeof audio.lastPattern === 'undefined'
            ? null
            : String(audio.lastPattern),
      lastTriggeredAtMs: undefined,
    }

    const volumeRaw =
      typeof audio.volumePercent === 'number'
        ? audio.volumePercent
        : typeof audio.volumePercent === 'string'
          ? Number.parseFloat(audio.volumePercent)
          : 0
    normalized.volumePercent = Number.isFinite(volumeRaw)
      ? Math.max(0, Math.min(100, volumeRaw))
      : 0

    if (typeof audio.lastTriggeredAtMs === 'number') {
      normalized.lastTriggeredAtMs = Number.isFinite(audio.lastTriggeredAtMs) ? Math.max(0, audio.lastTriggeredAtMs) : undefined
    } else if (typeof audio.lastTriggeredAtMs === 'string') {
      const parsed = Number.parseFloat(audio.lastTriggeredAtMs)
      normalized.lastTriggeredAtMs = Number.isFinite(parsed) ? Math.max(0, parsed) : undefined
    }

    data.audio = normalized
  }

  if ('uvFan' in data && typeof data.uvFan !== 'undefined') {
    const uv = data.uvFan as Record<string, unknown>
    if (!uv || typeof uv !== 'object') {
      return false
    }

    const normalized: UvFanStatus = {
      uvOn: Boolean(uv.uvOn),
      fanOn: Boolean(uv.fanOn),
      autoMode:
        typeof uv.autoMode === 'boolean'
          ? uv.autoMode
          : typeof uv.autoMode === 'string'
            ? uv.autoMode.toLowerCase() === 'true'
            : true,
      cleaningActive: Boolean(uv.cleaningActive),
    }

    if (typeof uv.cleaningDurationMs === 'number' && Number.isFinite(uv.cleaningDurationMs)) {
      normalized.cleaningDurationMs = Math.max(0, uv.cleaningDurationMs)
    }
    if (typeof uv.cleaningRemainingMs === 'number' && Number.isFinite(uv.cleaningRemainingMs)) {
      normalized.cleaningRemainingMs = Math.max(0, uv.cleaningRemainingMs)
    }
    if (typeof uv.lastRunUnix === 'number' && Number.isFinite(uv.lastRunUnix)) {
      normalized.lastRunUnix = Math.max(0, uv.lastRunUnix)
    }
    if (typeof uv.lastRunIso === 'string') {
      normalized.lastRunIso = uv.lastRunIso
    }
    if (typeof uv.nextAutoUnix === 'number' && Number.isFinite(uv.nextAutoUnix)) {
      normalized.nextAutoUnix = Math.max(0, uv.nextAutoUnix)
    }
    if (typeof uv.nextAutoIso === 'string') {
      normalized.nextAutoIso = uv.nextAutoIso
    }
    if (typeof uv.nextAutoInMs === 'number' && Number.isFinite(uv.nextAutoInMs)) {
      normalized.nextAutoInMs = Math.max(0, uv.nextAutoInMs)
    }

    data.uvFan = normalized
  }

  if ('feeder' in data && typeof data.feeder !== 'undefined') {
    const feeder = data.feeder as Record<string, unknown>
    if (!feeder || typeof feeder !== 'object') {
      return false
    }
    const normalized: FeederStatus = {
      feedingActive: Boolean(feeder.feedingActive),
      calibrationMode: Boolean(feeder.calibrationMode),
      targetWeightGrams:
        typeof feeder.targetWeightGrams === 'number' && Number.isFinite(feeder.targetWeightGrams)
          ? feeder.targetWeightGrams
          : 0,
      minWeightGrams:
        typeof feeder.minWeightGrams === 'number' && Number.isFinite(feeder.minWeightGrams)
          ? feeder.minWeightGrams
          : 0,
      gateOpen: Boolean(feeder.gateOpen),
      manualButtonLatched:
        typeof feeder.manualButtonLatched === 'boolean'
          ? feeder.manualButtonLatched
          : undefined,
      lastStartUnix:
        typeof feeder.lastStartUnix === 'number' && Number.isFinite(feeder.lastStartUnix)
          ? Math.max(0, feeder.lastStartUnix)
          : undefined,
      schedule: undefined,
    }
    if (Array.isArray(feeder.schedule)) {
      const slots: FeederScheduleSlot[] = []
      for (const slot of feeder.schedule as unknown[]) {
        if (!slot || typeof slot !== 'object') {
          continue
        }
        const slotRecord = slot as { hour?: unknown; minute?: unknown; completed?: unknown }
        const hour =
          typeof slotRecord.hour === 'number' && Number.isFinite(slotRecord.hour)
            ? slotRecord.hour
            : typeof slotRecord.hour === 'string'
              ? Number.parseInt(slotRecord.hour, 10)
              : Number.NaN
        const minute =
          typeof slotRecord.minute === 'number' && Number.isFinite(slotRecord.minute)
            ? slotRecord.minute
            : typeof slotRecord.minute === 'string'
              ? Number.parseInt(slotRecord.minute, 10)
              : Number.NaN
        if (!Number.isFinite(hour) || hour < 0 || hour > 23 || !Number.isFinite(minute) || minute < 0 || minute > 59) {
          continue
        }
        slots.push({
          hour,
          minute,
          completed: Boolean(slotRecord.completed),
        })
      }
      if (slots.length > 0) {
        normalized.schedule = slots
      }
    }
    data.feeder = normalized
  }

  if ('hydration' in data && typeof data.hydration !== 'undefined') {
    const hydration = data.hydration as Record<string, unknown>
    if (!hydration || typeof hydration !== 'object') {
      return false
    }
    const sensorRaw =
      typeof hydration.sensorRaw === 'number' && Number.isFinite(hydration.sensorRaw)
        ? hydration.sensorRaw
        : typeof hydration.sensorRaw === 'string'
          ? Number.parseFloat(hydration.sensorRaw)
          : Number.NaN
    const threshold =
      typeof hydration.threshold === 'number' && Number.isFinite(hydration.threshold)
        ? hydration.threshold
        : typeof hydration.threshold === 'string'
          ? Number.parseFloat(hydration.threshold)
          : Number.NaN
    const normalized: HydrationStatus = {
      sensorRaw: Number.isFinite(sensorRaw) ? sensorRaw : 0,
      pumpActive: Boolean(hydration.pumpActive),
      manualOverride: Boolean(hydration.manualOverride),
      threshold: Number.isFinite(threshold) ? threshold : 0,
      hasPumpedMorning:
        typeof hydration.hasPumpedMorning === 'boolean'
          ? hydration.hasPumpedMorning
          : undefined,
      hasPumpedNoon:
        typeof hydration.hasPumpedNoon === 'boolean'
          ? hydration.hasPumpedNoon
          : undefined,
      hasPumpedAfternoon:
        typeof hydration.hasPumpedAfternoon === 'boolean'
          ? hydration.hasPumpedAfternoon
          : undefined,
      hasPumpedEvening:
        typeof hydration.hasPumpedEvening === 'boolean'
          ? hydration.hasPumpedEvening
          : undefined,
      lastRefillMs:
        typeof hydration.lastRefillMs === 'number' && Number.isFinite(hydration.lastRefillMs)
          ? Math.max(0, hydration.lastRefillMs)
          : undefined,
      lastRefillUnix:
        typeof hydration.lastRefillUnix === 'number' && Number.isFinite(hydration.lastRefillUnix)
          ? Math.max(0, hydration.lastRefillUnix)
          : undefined,
    }
    data.hydration = normalized
  }

  if ('vision' in data && typeof data.vision !== 'undefined') {
    const vision = data.vision as Record<string, unknown>
    if (!vision || typeof vision !== 'object') {
      return false
    }

    const normalized: VisionStatus = {
      cameraOnline: Boolean(vision.cameraOnline),
      deviceId: typeof vision.deviceId === 'string' ? vision.deviceId : undefined,
      snapshotUrl: typeof vision.snapshotUrl === 'string' ? vision.snapshotUrl : undefined,
      streamUrl: typeof vision.streamUrl === 'string' ? vision.streamUrl : undefined,
      lastHeartbeatAt: typeof vision.lastHeartbeatAt === 'string' ? vision.lastHeartbeatAt : undefined,
      lastEventAt: typeof vision.lastEventAt === 'string' ? vision.lastEventAt : undefined,
      lastError: typeof vision.lastError === 'string' ? vision.lastError : vision.lastError === null ? null : undefined,
      inference: undefined,
    }

    if (vision.inference && typeof vision.inference === 'object') {
      const inference = vision.inference as Record<string, unknown>
      if (
        typeof inference.catDetected === 'boolean' &&
        typeof inference.probability === 'number' &&
        Number.isFinite(inference.probability)
      ) {
        const source =
          typeof inference.source === 'string' && ['event', 'poll', 'telemetry'].includes(inference.source)
            ? (inference.source as VisionInference['source'])
            : undefined

        const updatedAt =
          typeof inference.updatedAt === 'string'
            ? inference.updatedAt
            : typeof inference.timestamp === 'string'
              ? inference.timestamp
              : new Date().toISOString()

        const modelId =
          typeof inference.modelId === 'string'
            ? inference.modelId
            : typeof inference.model === 'string'
              ? inference.model
              : 'unknown'

        const visionInference: VisionInference = {
          modelId,
          updatedAt,
          catDetected: inference.catDetected,
          probability: Math.max(0, Math.min(1, inference.probability)),
          source,
        }

        if (typeof inference.mean === 'number' && Number.isFinite(inference.mean)) {
          visionInference.mean = inference.mean
        }
        if (typeof inference.stdDev === 'number' && Number.isFinite(inference.stdDev)) {
          visionInference.stdDev = inference.stdDev
        }
        if (typeof inference.edgeDensity === 'number' && Number.isFinite(inference.edgeDensity)) {
          visionInference.edgeDensity = inference.edgeDensity
        }

        normalized.inference = visionInference
      }
    } else if (vision.inference === null) {
      normalized.inference = null
    }

    data.vision = normalized
  }

  return true
}

export function isSmartHomeSettings(input: unknown): input is SmartHomeSettings {
  if (!input || typeof input !== 'object') return false
  const data = input as Record<string, unknown>

  return (
    typeof data.autoMode === 'boolean' &&
    typeof data.targetTemperatureC === 'number' &&
    typeof data.targetHumidityPercent === 'number' &&
    typeof data.waterBowlLevelTargetMl === 'number' &&
    typeof data.feederSchedule === 'string' &&
    (data.purifierIntensity === 'low' ||
      data.purifierIntensity === 'medium' ||
      data.purifierIntensity === 'high')
  )
}
