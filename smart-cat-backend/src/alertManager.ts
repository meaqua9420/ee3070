/**
 * alertManager.ts
 *
 * Multi-channel alert distribution system for Smart Cat Home
 *
 * Features:
 * - PWA push notifications (web-push)
 * - Database persistence (automation_alerts)
 * - Automatic task creation for critical alerts
 * - Deduplication mechanism (time-based caching)
 * - Multi-language support (zh/en)
 * - Severity-based routing (info/warning/critical)
 */

import webpush from 'web-push'
import type { AutomationAlert, LanguageCode } from './types'
import {
  saveAutomationAlert,
  listPushSubscriptions,
  createCareTask,
  removePushSubscription,
} from './db'
import { NativePushService, type NativePushPayload } from './nativePushService'

// ========== Types ==========

export interface AlertConfig {
  message: string
  severity: 'info' | 'warning' | 'critical'
  messageKey?: string | undefined
  messageVariables?: Record<string, string | number | boolean> | undefined

  // Metadata for frontend
  audioAlert?: boolean | undefined
  showBanner?: boolean | undefined

  // Auto task creation
  autoCreateTask?: {
    category: 'hydration' | 'nutrition' | 'behavior' | 'wellness' | 'safety' | 'maintenance'
    priority: 'low' | 'medium' | 'high'
    dueInHours?: number
  } | undefined
}

export interface AlertManagerConfig {
  vapidPublicKey?: string | undefined
  vapidPrivateKey?: string | undefined
  vapidSubject?: string | undefined
  deduplicationWindowMs?: number | undefined
  alertHistoryLimit?: number | undefined
  nativePushService?: NativePushService | null
}

interface DeduplicationEntry {
  timestamp: number
  severity: string
}

// ========== Deduplication Cache ==========

const deduplicationCache = new Map<string, DeduplicationEntry>()

const SEVERITY_TITLES: Record<
  AutomationAlert['severity'],
  Record<LanguageCode, string>
> = {
  info: { zh: '📢 系统通知', en: '📢 System Notification' },
  warning: { zh: '⚠️ 警告', en: '⚠️ Warning' },
  critical: { zh: '🚨 紧急警报', en: '🚨 Critical Alert' },
}

function getDeduplicationKey(config: AlertConfig): string {
  // Use messageKey if available, otherwise hash the message
  return config.messageKey || `msg_${config.message.substring(0, 50)}`
}

function isDuplicate(
  config: AlertConfig,
  windowMs: number,
): boolean {
  const key = getDeduplicationKey(config)
  const cached = deduplicationCache.get(key)

  if (!cached) return false

  const now = Date.now()
  const elapsed = now - cached.timestamp

  // Allow more frequent alerts if severity increased
  if (cached.severity === 'info' && config.severity !== 'info') {
    return false
  }
  if (cached.severity === 'warning' && config.severity === 'critical') {
    return false
  }

  return elapsed < windowMs
}

function recordAlert(config: AlertConfig): void {
  const key = getDeduplicationKey(config)
  deduplicationCache.set(key, {
    timestamp: Date.now(),
    severity: config.severity,
  })

  // Clean up old entries (older than 1 hour)
  const oneHourAgo = Date.now() - 60 * 60 * 1000
  for (const [k, v] of deduplicationCache.entries()) {
    if (v.timestamp < oneHourAgo) {
      deduplicationCache.delete(k)
    }
  }
}

// ========== Alert Manager Class ==========

export class AlertManager {
  private config: {
    vapidPublicKey: string
    vapidPrivateKey: string
    vapidSubject: string
    deduplicationWindowMs: number
    alertHistoryLimit: number
  }
  private pushEnabled: boolean
  private nativePushService: NativePushService | null

  constructor(config: AlertManagerConfig = {}) {
    this.config = {
      vapidPublicKey: config.vapidPublicKey || '',
      vapidPrivateKey: config.vapidPrivateKey || '',
      vapidSubject: config.vapidSubject || 'mailto:admin@smartcat.local',
      deduplicationWindowMs: config.deduplicationWindowMs ?? 5 * 60 * 1000, // 5 minutes
      alertHistoryLimit: config.alertHistoryLimit ?? 100,
    }

    this.nativePushService = config.nativePushService ?? null
    this.pushEnabled = Boolean(this.config.vapidPublicKey && this.config.vapidPrivateKey)

    if (this.pushEnabled) {
      webpush.setVapidDetails(
        this.config.vapidSubject,
        this.config.vapidPublicKey,
        this.config.vapidPrivateKey,
      )
      console.log('[alert-manager] PWA push notifications enabled')
    } else {
      console.warn('[alert-manager] PWA push notifications disabled (VAPID keys not configured)')
    }
  }

  /**
   * Dispatch alert across all configured channels
   */
  async dispatch(config: AlertConfig): Promise<{
    database: boolean
    pushSent: number
    taskCreated: boolean
    deduplicated: boolean
    nativePushSent: number
  }> {
    // Check deduplication
      if (isDuplicate(config, this.config.deduplicationWindowMs)) {
        console.log(`[alert-manager] Alert deduplicated: ${getDeduplicationKey(config)}`)
        return {
          database: false,
          pushSent: 0,
          taskCreated: false,
          deduplicated: true,
          nativePushSent: 0,
        }
      }

    recordAlert(config)

    const timestamp = new Date().toISOString()
    const results = {
      database: false,
      pushSent: 0,
      taskCreated: false,
      deduplicated: false,
      nativePushSent: 0,
    }

    // 1. Save to database (always)
    try {
      const alert = buildAutomationAlertPayload({
        timestamp,
        message: config.message,
        severity: config.severity,
        messageKey: config.messageKey,
        messageVariables: config.messageVariables,
      })

      saveAutomationAlert(alert, this.config.alertHistoryLimit)
      results.database = true
      console.log(`[alert-manager] Saved to database: ${config.severity}`)
    } catch (error) {
      console.error('[alert-manager] Failed to save to database:', error)
    }

    // 2. Send PWA push notifications (warning & critical only)
    if (this.pushEnabled && (config.severity === 'warning' || config.severity === 'critical')) {
      const pushCount = await this.sendPushNotifications(config)
      results.pushSent = pushCount
    }

    // 3. Native push (optional, requires APNs/FCM configuration)
    if (this.nativePushService && (config.severity === 'warning' || config.severity === 'critical')) {
      try {
        const nativePayload = this.buildNativePayload(config, timestamp)
        const nativeResult = await this.nativePushService.send(nativePayload)
        results.nativePushSent = (nativeResult.apns?.sent ?? 0) + (nativeResult.fcm?.sent ?? 0)
      } catch (error) {
        console.error('[alert-manager] Failed to send native push notifications:', error)
      }
    }

    // 4. Create care task (critical alerts only, if configured)
    if (config.severity === 'critical' && config.autoCreateTask) {
      const autoTask = config.autoCreateTask
      try {
        const dueAt = autoTask.dueInHours
            ? new Date(Date.now() + autoTask.dueInHours * 60 * 60 * 1000).toISOString()
            : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        const metadata = {
          autoPriority: autoTask.priority,
          autoCategory: autoTask.category,
          alertSeverity: config.severity,
        }
        const [firstLine = config.message] = config.message.split('\n')
        createCareTask({
          category: autoTask.category,
          title: firstLine.substring(0, 100), // First line only
          description: config.message,
          source: 'system',
          metadata,
          dueAt,
        })
        results.taskCreated = true
        console.log(`[alert-manager] Created care task: ${autoTask.category}`)
      } catch (error) {
        console.error('[alert-manager] Failed to create care task:', error)
      }
    }

    return results
  }

  /**
   * Send push notifications to all subscribed clients
   */
  private async sendPushNotifications(config: AlertConfig): Promise<number> {
    if (!this.pushEnabled) return 0

    try {
      const subscriptions = listPushSubscriptions()
      if (subscriptions.length === 0) {
        console.log('[alert-manager] No push subscriptions found')
        return 0
      }

      let successCount = 0
      const promises = subscriptions.map(async (sub) => {
        try {
          // Translate message if needed (basic support)
          const localizedMessage = this.localizeMessage(config, sub.language)

          const payload = JSON.stringify({
            title: this.getSeverityTitle(config.severity, sub.language),
            body: localizedMessage,
            icon: '/cat-icon-192.png',
            badge: '/cat-badge-96.png',
            tag: config.messageKey || 'alert',
            data: {
              severity: config.severity,
              timestamp: new Date().toISOString(),
              audioAlert: config.audioAlert,
              showBanner: config.showBanner,
            },
          })

          await webpush.sendNotification(sub.subscription, payload)
          successCount++
        } catch (error: unknown) {
          const err = error as { statusCode?: number }
          console.error(`[alert-manager] Push failed for ${sub.endpoint}:`, err)

          // Remove invalid subscriptions (410 Gone, 404 Not Found)
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`[alert-manager] Removing invalid subscription: ${sub.endpoint}`)
            removePushSubscription(sub.endpoint)
          }
        }
      })

      await Promise.all(promises)
      console.log(`[alert-manager] Sent push notifications: ${successCount}/${subscriptions.length}`)
      return successCount
    } catch (error) {
      console.error('[alert-manager] Failed to send push notifications:', error)
      return 0
    }
  }

  /**
   * Basic message localization
   */
  private localizeMessage(config: AlertConfig, language: LanguageCode): string {
    // If messageKey and variables are provided, we could look up translations
    // For now, just return the message as-is (it should already be localized by caller)
    return config.message
  }

  /**
   * Get severity title in user's language
   */
  private getSeverityTitle(severity: AutomationAlert['severity'], language: LanguageCode): string {
    const fallback = SEVERITY_TITLES.info[language] ?? 'System Notification'
    const entry = SEVERITY_TITLES[severity]
    return entry[language] ?? fallback
  }

  private buildNativePayload(config: AlertConfig, timestamp: string): NativePushPayload {
    const fallbackTitle =
      this.getSeverityTitle(config.severity, 'en') ||
      this.getSeverityTitle(config.severity, 'zh') ||
      'Smart Cat Home'

    const data: Record<string, string> = {
      severity: config.severity,
      messageKey: config.messageKey ?? '',
      timestamp,
      audioAlert: String(config.audioAlert ?? false),
      showBanner: String(config.showBanner ?? true),
    }

    return {
      body: config.message,
      severity: config.severity,
      fallbackTitle,
      data,
    }
  }
}

// ========== Singleton Instance ==========

let alertManagerInstance: AlertManager | null = null

export function initializeAlertManager(config: AlertManagerConfig): AlertManager {
  alertManagerInstance = new AlertManager(config)
  return alertManagerInstance
}

export function getAlertManager(): AlertManager {
  if (!alertManagerInstance) {
    throw new Error('[alert-manager] AlertManager not initialized. Call initializeAlertManager() first.')
  }
  return alertManagerInstance
}

// ========== Convenience Functions ==========

/**
 * Quick dispatch for database-only alerts (e.g., from vision risk analyzer)
 */
export function dispatchDatabaseAlert(alert: AutomationAlert): void {
  try {
    saveAutomationAlert(alert, 100)
  } catch (error) {
    console.error('[alert-manager] Failed to dispatch database alert:', error)
  }
}

/**
 * High-level alert dispatcher with auto-configuration
 */
export async function dispatchAlert(
  message: string,
  severity: 'info' | 'warning' | 'critical',
  options: {
    messageKey?: string
    messageVariables?: Record<string, string | number | boolean>
    audioAlert?: boolean
    showBanner?: boolean
    autoTask?: {
      category: 'hydration' | 'nutrition' | 'behavior' | 'wellness' | 'safety' | 'maintenance'
      priority: 'low' | 'medium' | 'high'
      dueInHours?: number
    }
  } = {},
): Promise<void> {
  const manager = alertManagerInstance

  if (!manager) {
    // Fallback to database-only if manager not initialized
    dispatchDatabaseAlert(
      buildAutomationAlertPayload({
        timestamp: new Date().toISOString(),
        message,
        severity,
        messageKey: options.messageKey,
        messageVariables: options.messageVariables,
      }),
    )
    return
  }

  const dispatchConfig: AlertConfig = {
    message,
    severity,
    audioAlert: options.audioAlert ?? (severity === 'critical'),
    showBanner: options.showBanner ?? (severity !== 'info'),
  }
  if (options.messageKey) {
    dispatchConfig.messageKey = options.messageKey
  }
  if (options.messageVariables) {
    dispatchConfig.messageVariables = options.messageVariables
  }
  if (options.autoTask) {
    dispatchConfig.autoCreateTask = options.autoTask
  }

  await manager.dispatch(dispatchConfig)
}

/**
 * Example usage for vision risk alerts
 */
export async function dispatchVisionRiskAlert(
  riskLevel: 'low' | 'medium' | 'high' | 'critical',
  score: number,
  description: string,
  language: LanguageCode = 'zh',
): Promise<void> {
  const severity: 'info' | 'warning' | 'critical' =
    riskLevel === 'critical' || riskLevel === 'high' ? 'critical' : 'warning'

  const title = language === 'zh'
    ? `⚠️ 视觉风险警报：${riskLevel === 'critical' ? '危急' : '高风险'} (${score}/10)`
    : `⚠️ Vision Risk Alert: ${riskLevel === 'critical' ? 'Critical' : 'High Risk'} (${score}/10)`

  const options: NonNullable<Parameters<typeof dispatchAlert>[2]> = {
    messageKey: 'visionRisk',
    messageVariables: { riskLevel, score },
    audioAlert: riskLevel === 'critical',
    showBanner: true,
  }

  if (riskLevel === 'critical') {
    options.autoTask = {
      category: 'safety',
      priority: 'high',
      dueInHours: 1,
    }
  }

  await dispatchAlert(`${title}\n${description}`, severity, options)
}

function buildAutomationAlertPayload(input: {
  timestamp?: string | undefined
  message: string
  severity: AutomationAlert['severity']
  messageKey?: string | undefined
  messageVariables?: Record<string, string | number | boolean> | undefined
}): AutomationAlert {
  const payload: AutomationAlert = {
    timestamp: input.timestamp ?? new Date().toISOString(),
    message: input.message,
    severity: input.severity,
  }
  if (input.messageKey) {
    payload.messageKey = input.messageKey
  }
  if (input.messageVariables) {
    payload.messageVariables = input.messageVariables
  }
  return payload
}
