import { setTimeout as delay } from 'node:timers/promises'
import type { VisionInference, VisionStatus } from './types'

interface CameraConfig {
  baseUrl: string | null
  statusPath: string
  snapshotPath: string
  apiKey: string | null
  publicSnapshotUrl: string | null
  publicStreamUrl: string | null
}

export interface CameraRuntimeState extends VisionStatus {
  lastPollingAt?: string | null
}

export interface CameraEventPayload {
  deviceId?: string
  catDetected?: boolean
  probability?: number
  mean?: number
  stdDev?: number
  edgeDensity?: number
  timestampMs?: number
  timestampIso?: string
  modelId?: string
}

const DEFAULT_STATUS_PATH = '/status'
const DEFAULT_SNAPSHOT_PATH = '/snapshot.jpg'

const cameraConfig: CameraConfig = {
  baseUrl: null,
  statusPath: DEFAULT_STATUS_PATH,
  snapshotPath: DEFAULT_SNAPSHOT_PATH,
  apiKey: null,
  publicSnapshotUrl: null,
  publicStreamUrl: null,
}

const cameraState: CameraRuntimeState = {
  cameraOnline: false,
  inference: null,
  lastError: null,
  lastPollingAt: null,
}

function normalizePath(path: string, fallback: string): string {
  if (!path || typeof path !== 'string') {
    return fallback
  }
  const trimmed = path.trim()
  if (trimmed.length === 0) {
    return fallback
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

function cloneState(): CameraRuntimeState {
  return {
    ...cameraState,
    inference: cameraState.inference ? { ...cameraState.inference } : cameraState.inference ?? null,
  }
}

function nowIso() {
  return new Date().toISOString()
}

function markCameraOffline(errorMessage?: string) {
  cameraState.cameraOnline = false
  cameraState.inference = null
  cameraState.lastEventAt = undefined
  cameraState.lastHeartbeatAt = undefined
  cameraState.lastError = errorMessage ?? cameraState.lastError ?? null
}

export function configureCameraFromEnv(): CameraRuntimeState {
  const base = process.env.CAMERA_BASE_URL?.trim()
  cameraConfig.baseUrl = base && base.length > 0 ? base : null
  cameraConfig.statusPath = normalizePath(process.env.CAMERA_STATUS_PATH ?? DEFAULT_STATUS_PATH, DEFAULT_STATUS_PATH)
  cameraConfig.snapshotPath = normalizePath(process.env.CAMERA_SNAPSHOT_PATH ?? DEFAULT_SNAPSHOT_PATH, DEFAULT_SNAPSHOT_PATH)
  const apiKey = process.env.CAMERA_API_KEY?.trim()
  cameraConfig.apiKey = apiKey && apiKey.length > 0 ? apiKey : null
  const publicSnapshot = process.env.CAMERA_PUBLIC_SNAPSHOT_URL?.trim()
  const publicStream = process.env.CAMERA_PUBLIC_STREAM_URL?.trim()
  cameraConfig.publicSnapshotUrl = publicSnapshot && publicSnapshot.length > 0 ? publicSnapshot : null
  cameraConfig.publicStreamUrl = publicStream && publicStream.length > 0 ? publicStream : null

  if (cameraConfig.publicSnapshotUrl) {
    cameraState.snapshotUrl = cameraConfig.publicSnapshotUrl
  } else if (cameraConfig.baseUrl) {
    cameraState.snapshotUrl = joinUrl(cameraConfig.baseUrl, cameraConfig.snapshotPath)
  } else {
    delete cameraState.snapshotUrl
  }

  if (cameraConfig.publicStreamUrl) {
    cameraState.streamUrl = cameraConfig.publicStreamUrl
  } else if (cameraConfig.baseUrl) {
    cameraState.streamUrl = joinUrl(cameraConfig.baseUrl, '/stream')
  } else {
    delete cameraState.streamUrl
  }

  return cloneState()
}

export function getCameraRuntime(): CameraRuntimeState {
  return cloneState()
}

export function updateCameraRuntimeFromReading(vision?: VisionStatus) {
  if (!vision) {
    return
  }
  cameraState.cameraOnline = Boolean(vision.cameraOnline)
  if (typeof vision.deviceId === 'string' && vision.deviceId.length > 0) {
    cameraState.deviceId = vision.deviceId
  }
  if (!cameraConfig.publicSnapshotUrl && typeof vision.snapshotUrl === 'string' && vision.snapshotUrl.length > 0) {
    cameraState.snapshotUrl = vision.snapshotUrl
  }
  if (!cameraConfig.publicStreamUrl && typeof vision.streamUrl === 'string' && vision.streamUrl.length > 0) {
    cameraState.streamUrl = vision.streamUrl
  }
  if (typeof vision.lastHeartbeatAt === 'string') {
    cameraState.lastHeartbeatAt = vision.lastHeartbeatAt
  }
  if (typeof vision.lastEventAt === 'string') {
    cameraState.lastEventAt = vision.lastEventAt
  }
  if (typeof vision.lastError === 'string' || vision.lastError === null) {
    cameraState.lastError = vision.lastError
  }
  cameraState.inference = vision.inference ? { ...vision.inference } : vision.inference ?? null
}

function buildInferenceFromPayload(
  payload: CameraEventPayload,
  source: VisionInference['source'],
  timestamp: string,
): VisionInference {
  const inference: VisionInference = {
    modelId: payload.modelId ?? 'camera-event',
    updatedAt: timestamp,
    catDetected: Boolean(payload.catDetected),
    probability:
      typeof payload.probability === 'number' && Number.isFinite(payload.probability)
        ? Math.max(0, Math.min(1, payload.probability))
        : payload.catDetected
          ? 1
          : 0,
    source,
  }

  const mean = typeof payload.mean === 'number' && Number.isFinite(payload.mean) ? payload.mean : undefined
  if (mean !== undefined) {
    inference.mean = mean
  }

  const stdDev = typeof payload.stdDev === 'number' && Number.isFinite(payload.stdDev) ? payload.stdDev : undefined
  if (stdDev !== undefined) {
    inference.stdDev = stdDev
  }

  const edgeDensity =
    typeof payload.edgeDensity === 'number' && Number.isFinite(payload.edgeDensity) ? payload.edgeDensity : undefined
  if (edgeDensity !== undefined) {
    inference.edgeDensity = edgeDensity
  }

  return inference
}

export function ingestCameraEvent(payload: CameraEventPayload): CameraRuntimeState {
  const eventIso =
    typeof payload.timestampIso === 'string' && payload.timestampIso.length > 0
      ? payload.timestampIso
      : typeof payload.timestampMs === 'number' && Number.isFinite(payload.timestampMs)
        ? new Date(payload.timestampMs).toISOString()
        : nowIso()

  cameraState.cameraOnline = true
  if (typeof payload.deviceId === 'string' && payload.deviceId.length > 0) {
    cameraState.deviceId = payload.deviceId
  }
  cameraState.lastEventAt = eventIso
  cameraState.lastHeartbeatAt = eventIso
  cameraState.lastError = null
  cameraState.inference = buildInferenceFromPayload(payload, 'event', eventIso)

  return cloneState()
}

export async function pollCameraStatus(): Promise<CameraRuntimeState | null> {
  if (!cameraConfig.baseUrl) {
    return null
  }

  const statusUrl = joinUrl(cameraConfig.baseUrl, cameraConfig.statusPath)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const requestInit: RequestInit = {
      method: 'GET',
      signal: controller.signal,
    }
    if (cameraConfig.apiKey) {
      requestInit.headers = {
        Authorization: `Bearer ${cameraConfig.apiKey}`,
      }
    }
    const response = await fetch(statusUrl, requestInit)

    clearTimeout(timeout)

    if (!response.ok) {
      markCameraOffline(`status:${response.status}`)
      return null
    }

    const payload = (await response.json()) as Record<string, any>
    const heartbeatIso = nowIso()

    cameraState.cameraOnline = true
    cameraState.lastHeartbeatAt = heartbeatIso
    cameraState.lastError = null
    if (typeof payload.deviceId === 'string' && payload.deviceId.length > 0) {
      cameraState.deviceId = payload.deviceId
    }

    if (typeof payload.snapshotUrl === 'string') {
      cameraState.snapshotUrl = payload.snapshotUrl
    }
    if (typeof payload.streamUrl === 'string') {
      cameraState.streamUrl = payload.streamUrl
    }

    if (typeof payload.catDetected === 'boolean') {
      cameraState.lastEventAt =
        typeof payload.updatedAt === 'string'
          ? payload.updatedAt
          : typeof payload.timestamp === 'string'
            ? payload.timestamp
            : heartbeatIso
      const probability =
        typeof payload.probability === 'number' && Number.isFinite(payload.probability)
          ? Math.max(0, Math.min(1, payload.probability))
          : payload.catDetected
            ? 1
            : 0
      const inference: VisionInference = {
        modelId: typeof payload.model === 'string' ? payload.model : 'camera-status',
        updatedAt: cameraState.lastEventAt,
        catDetected: payload.catDetected,
        probability,
        source: 'poll',
      }

      const mean = typeof payload.mean === 'number' && Number.isFinite(payload.mean) ? payload.mean : undefined
      if (mean !== undefined) {
        inference.mean = mean
      }
      const stdDev = typeof payload.stdDev === 'number' && Number.isFinite(payload.stdDev) ? payload.stdDev : undefined
      if (stdDev !== undefined) {
        inference.stdDev = stdDev
      }
      const edgeDensity =
        typeof payload.edgeDensity === 'number' && Number.isFinite(payload.edgeDensity) ? payload.edgeDensity : undefined
      if (edgeDensity !== undefined) {
        inference.edgeDensity = edgeDensity
      }

      cameraState.inference = inference
    }

    cameraState.lastPollingAt = heartbeatIso
    return cloneState()
  } catch (error) {
    clearTimeout(timeout)
    markCameraOffline(error instanceof Error ? error.message : String(error))
    return null
  }
}

export async function fetchCameraSnapshotBuffer(): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!cameraConfig.baseUrl) {
    return null
  }
  const snapshotUrl = joinUrl(cameraConfig.baseUrl, cameraConfig.snapshotPath)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const requestInit: RequestInit = {
      method: 'GET',
      signal: controller.signal,
    }
    if (cameraConfig.apiKey) {
      requestInit.headers = {
        Authorization: `Bearer ${cameraConfig.apiKey}`,
      }
    }
    const response = await fetch(snapshotUrl, requestInit)

    clearTimeout(timeout)

    if (!response.ok) {
      markCameraOffline(`snapshot:${response.status}`)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') ?? 'image/jpeg'
    cameraState.lastHeartbeatAt = nowIso()
    cameraState.cameraOnline = true
    return { buffer: Buffer.from(arrayBuffer), contentType }
  } catch (error) {
    clearTimeout(timeout)
    markCameraOffline(error instanceof Error ? error.message : String(error))
    return null
  }
}

export function getCameraProxyTargets(): { snapshotUrl: string | null; streamUrl: string | null; apiKey: string | null } {
  return {
    snapshotUrl: cameraConfig.baseUrl ? joinUrl(cameraConfig.baseUrl, cameraConfig.snapshotPath) : null,
    streamUrl: cameraConfig.baseUrl ? joinUrl(cameraConfig.baseUrl, '/stream') : null,
    apiKey: cameraConfig.apiKey,
  }
}

export async function waitForCameraWarmup(timeoutMs = 4000) {
  if (!cameraConfig.baseUrl) {
    return
  }
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const status = await pollCameraStatus()
    if (status?.cameraOnline) {
      return
    }
    await delay(500)
  }
}
