import type { Language, TranslationKey } from '../i18n/translations'
import type { SmartHomeSnapshot } from '../types/smartHome'
import { registerPushSubscription } from './backendClient'

export interface PushWorkerResult {
  ok: boolean
  permission: NotificationPermission
  registration?: ServiceWorkerRegistration
  messageKey?: TranslationKey
  message?: string
}

export interface PushSubscriptionResult {
  ok: boolean
  messageKey?: TranslationKey
  message?: string
}

const SW_PATH = '/smart-cat-home-sw.js'
const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

/**
 * Registers the Smart Cat Home service worker and requests notification permission.
 * Backend push payloads are handled in `public/smart-cat-home-sw.js` via the `push` event.
 */
export async function pushNotificationWorker(language?: Language): Promise<PushWorkerResult> {
  if (typeof window === 'undefined') {
    return {
      ok: false,
      permission: 'denied',
      messageKey: 'notifications.unsupported',
    }
  }

  if (!('Notification' in window)) {
    return {
      ok: false,
      permission: 'denied',
      messageKey: 'notifications.unsupported',
    }
  }

  if (!('serviceWorker' in navigator)) {
    return {
      ok: false,
      permission: Notification.permission,
      messageKey: 'notifications.swUnsupported',
    }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return {
      ok: false,
      permission,
      messageKey: 'notifications.permissionRequired',
    }
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_PATH, {
      type: 'module',
      scope: '/',
    })

    if (language) {
      registration.active?.postMessage({
        type: 'SMART_CAT_LANGUAGE',
        payload: language,
      })
    }

    return {
      ok: true,
      permission,
      registration,
    }
  } catch (error) {
    return {
      ok: false,
      permission,
      messageKey: 'notifications.error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Utility for local/manual testing: forwards a snapshot to the service worker so
 * it can mimic push-driven alerts without contacting the backend.
 */
export async function emitSnapshotToWorker(snapshot: SmartHomeSnapshot) {
  if (!('serviceWorker' in navigator)) {
    return
  }

  const registration = await navigator.serviceWorker.ready
  registration.active?.postMessage({
    type: 'SMART_CAT_SNAPSHOT',
    payload: snapshot,
  })
}

export async function syncServiceWorkerLanguage(language: Language) {
  if (!('serviceWorker' in navigator)) {
    return
  }

  try {
    const registration = await navigator.serviceWorker.ready
    registration.active?.postMessage({
      type: 'SMART_CAT_LANGUAGE',
      payload: language,
    })
  } catch (error) {
    console.warn('[push] Failed to sync language', error)
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export async function ensurePushSubscription(language: Language): Promise<PushSubscriptionResult> {
  if (!('serviceWorker' in navigator)) {
    return { ok: false, messageKey: 'notifications.swUnsupported' }
  }

  if (!('PushManager' in window)) {
    return { ok: false, messageKey: 'notifications.unsupported' }
  }

  try {
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      if (!VAPID_KEY) {
        return { ok: false, messageKey: 'notifications.vapidMissing' }
      }

      const applicationServerKey = urlBase64ToUint8Array(VAPID_KEY)
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      })
    }

    const backendResult = await registerPushSubscription(subscription, language)
    if (!backendResult.ok) {
      return {
        ok: false,
        messageKey: 'notifications.error',
        message: backendResult.message,
      }
    }

    return { ok: true }
  } catch (error) {
    console.warn('[push] Subscription failed', error)
    return {
      ok: false,
      messageKey: 'notifications.error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
