import fs from 'node:fs'
import path from 'node:path'
import apn from 'apn'
import { getApp, getApps, initializeApp, cert } from 'firebase-admin/app'
import { getMessaging, type Messaging } from 'firebase-admin/messaging'
import type { AutomationAlert } from './types'
import { listNativePushDevices, removeNativePushDevice, type NativePushDeviceRecord } from './db'
import { logger } from './logger'
import type { NativePushTransport } from './db'

export interface ApnsOptions {
  keyPath?: string
  keyBase64?: string
  keyId: string
  teamId: string
  bundleId: string
  production?: boolean
}

export interface FcmOptions {
  serviceAccountPath?: string
  serviceAccountBase64?: string
}

export interface NativePushServiceOptions {
  apns?: ApnsOptions | null
  fcm?: FcmOptions | null
}

export interface NativePushPayload {
  body: string
  severity: AutomationAlert['severity']
  fallbackTitle: string
  data: Record<string, string>
}

function decodeBase64File(input: string): string {
  return Buffer.from(input, 'base64').toString('utf-8')
}

function readFileIfExists(filePath: string): string {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
  return fs.readFileSync(resolved, 'utf-8')
}

export class NativePushService {
  private apnsProvider?: apn.Provider
  private messaging?: Messaging
  private readonly apnsBundleId?: string

  constructor(private readonly options: NativePushServiceOptions = {}) {
    this.configureApns(options.apns ?? null)
    this.configureFcm(options.fcm ?? null)
  }

  private configureApns(options: ApnsOptions | null) {
    if (!options) {
      logger.info('[native-push] APNs configuration not provided; iOS native push disabled.')
      return
    }

    const hasKeyPayload = Boolean(options.keyPath || options.keyBase64)
    if (!hasKeyPayload || !options.keyId || !options.teamId || !options.bundleId) {
      logger.warn('[native-push] Incomplete APNs configuration; skipping provider initialization.')
      return
    }

    try {
      const keyContent = options.keyBase64
        ? decodeBase64File(options.keyBase64)
        : readFileIfExists(options.keyPath!)

      this.apnsProvider = new apn.Provider({
        token: {
          key: keyContent,
          keyId: options.keyId,
          teamId: options.teamId,
        },
        production: Boolean(options.production),
      })
      this.apnsBundleId = options.bundleId
      logger.info('[native-push] APNs provider initialized.')
    } catch (error) {
      logger.error('[native-push] Failed to initialize APNs provider:', error)
    }
  }

  private configureFcm(options: FcmOptions | null) {
    if (!options) {
      logger.info('[native-push] FCM configuration not provided; Android native push disabled.')
      return
    }

    const payloadSource = options.serviceAccountBase64
      ? decodeBase64File(options.serviceAccountBase64)
      : options.serviceAccountPath
        ? readFileIfExists(options.serviceAccountPath)
        : null

    if (!payloadSource) {
      logger.warn('[native-push] FCM service account missing; skipping FCM initialization.')
      return
    }

    try {
      const credentials = JSON.parse(payloadSource)
      const appName = 'smart-cat-native-push'
      const app = getApps().find((candidate) => candidate.name === appName)
        ? getApp(appName)
        : initializeApp({ credential: cert(credentials) }, appName)
      this.messaging = getMessaging(app)
      logger.info('[native-push] FCM messaging initialized.')
    } catch (error) {
      logger.error('[native-push] Failed to initialize FCM messaging:', error)
    }
  }

  async send(
    payload: NativePushPayload,
  ): Promise<{
    apns: { targeted: number; sent: number }
    fcm: { targeted: number; sent: number }
    error?: string | null
  }> {
    const devices = listNativePushDevices()
    if (devices.length === 0) {
      return {
        apns: { targeted: 0, sent: 0 },
        fcm: { targeted: 0, sent: 0 },
      }
    }

    const apnsTokens = devices.filter((device) => device.transport === 'apns')
    const fcmTokens = devices.filter((device) => device.transport === 'fcm')

    const [apnsResult, fcmResult] = await Promise.all([
      this.sendApnsNotifications(payload, apnsTokens),
      this.sendFcmNotifications(payload, fcmTokens),
    ])

    return {
      apns: apnsResult,
      fcm: fcmResult,
      error: apnsResult.error ?? fcmResult.error ?? null,
    }
  }

  private async sendApnsNotifications(
    payload: NativePushPayload,
    devices: NativePushDeviceRecord[],
  ): Promise<{ targeted: number; sent: number; error?: string | null }> {
    if (!this.apnsProvider || !this.apnsBundleId || devices.length === 0) {
      return { targeted: devices.length, sent: 0 }
    }

    const notification = new apn.Notification()
    notification.topic = this.apnsBundleId
    notification.sound = 'default'
    notification.alert = {
      title: payload.fallbackTitle,
      body: payload.body,
    }
    notification.payload = { ...payload.data }

    try {
      const response = await this.apnsProvider.send(
        notification,
        devices.map((device) => device.token),
      )

      if (response.failed && response.failed.length > 0) {
        for (const failure of response.failed) {
          if (failure.device) {
            removeNativePushDevice(failure.device)
          }
        }
      }

      return {
        targeted: devices.length,
        sent: response.sent?.length ?? 0,
      }
    } catch (error) {
      logger.error('[native-push] Failed to send APNs notifications:', error)
      return {
        targeted: devices.length,
        sent: 0,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private async sendFcmNotifications(
    payload: NativePushPayload,
    devices: NativePushDeviceRecord[],
  ): Promise<{ targeted: number; sent: number; error?: string | null }> {
    if (!this.messaging || devices.length === 0) {
      return { targeted: devices.length, sent: 0 }
    }

    const tokens = devices.map((device) => device.token)
    const maxBatch = 500
    let sentCount = 0
    let lastError: string | null = null

    for (let i = 0; i < tokens.length; i += maxBatch) {
      const chunk = tokens.slice(i, i + maxBatch)
      try {
        const response = await this.messaging.sendEachForMulticast({
          tokens: chunk,
          notification: {
            title: payload.fallbackTitle,
            body: payload.body,
          },
          data: payload.data,
        })

        sentCount += response.successCount

        response.responses.forEach((result, index) => {
          if (!result.success) {
            const token = chunk[index]
            this.handleFcmError(token, result.error)
          }
        })
      } catch (error) {
        logger.error('[native-push] Failed to send FCM notifications:', error)
        lastError = error instanceof Error ? error.message : String(error)
      }
    }

    return {
      targeted: devices.length,
      sent: sentCount,
      error: lastError,
    }
  }

  private handleFcmError(token: string, error: unknown) {
    const err = error as { code?: string }
    if (!err?.code) return

    const invalidCodes = new Set([
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
      'messaging/invalid-argument',
    ])

    if (invalidCodes.has(err.code)) {
      logger.warn(`[native-push] Removing invalid FCM token (${err.code}): ${token}`)
      removeNativePushDevice(token)
    }
  }
}
