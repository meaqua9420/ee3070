const FALLBACK_LANGUAGE = 'zh'
const ALERT_TAG = 'smart-cat-home-alert'

const BASE_SCOPE = (() => {
  const scope = (self.registration && self.registration.scope) || '/'
  return scope.endsWith('/') ? scope : `${scope}/`
})()

function resolveAssetPath(asset) {
  try {
    return new URL(asset, BASE_SCOPE).toString()
  } catch (error) {
    console.warn('[sw] failed to resolve asset path', asset, error)
    return asset
  }
}

const DEFAULT_ICON = resolveAssetPath('purrfect-icon.png')
const DEFAULT_BADGE = resolveAssetPath('purrfect-icon.png')
let lastAlertId = null
let languagePreference = FALLBACK_LANGUAGE

const SW_TRANSLATIONS = {
  zh: {
    'alerts.title': 'Smart Cat Home 警示',
    'alerts.temperatureHigh': '環境溫度 {{value}}°C，請檢查降溫。',
    'alerts.temperatureLow': '環境溫度僅 {{value}}°C，請留意保暖。',
    'alerts.waterLow': '喝水量僅 {{value}}ml，需提醒貓咪補充水份。',
    'alerts.aqiHigh': '空氣品質 AQI {{value}} 偏高。',
    'alerts.humidityHigh': '濕度 {{value}}% 過高，記得除濕。',
    'alerts.humidityLow': '濕度 {{value}}% 過低，建議加濕。',
  },
  en: {
    'alerts.title': 'Smart Cat Home Alert',
    'alerts.temperatureHigh': 'Temperature is {{value}}°C — please cool the habitat.',
    'alerts.temperatureLow': 'Temperature is only {{value}}°C — keep your cat warm.',
    'alerts.waterLow': 'Water intake is {{value}} ml — encourage drinking.',
    'alerts.aqiHigh': 'Air quality index {{value}} is high.',
    'alerts.humidityHigh': 'Humidity {{value}}% is too high — consider dehumidifying.',
    'alerts.humidityLow': 'Humidity {{value}}% is too low — add moisture.',
  },
}

const SUPPORTED_LANGUAGES = Object.keys(SW_TRANSLATIONS)

function resolveLanguage(input) {
  if (typeof input !== 'string') return languagePreference
  if (SUPPORTED_LANGUAGES.includes(input)) return input
  if (input.toLowerCase().startsWith('en')) return 'en'
  return FALLBACK_LANGUAGE
}

function swTranslate(language, key, variables) {
  const bundle = SW_TRANSLATIONS[language] || SW_TRANSLATIONS[FALLBACK_LANGUAGE]
  const template = bundle[key] ?? SW_TRANSLATIONS[FALLBACK_LANGUAGE][key] ?? ''
  if (!variables) return template
  return template.replace(/\{\{(.*?)\}\}/g, (_, token) => {
    const value = variables[token.trim()]
    return value !== undefined ? String(value) : ''
  })
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function buildAlertsFromReading(reading, language) {
  if (!reading) return []
  const alerts = []

  if (reading.temperatureC >= 31) {
    alerts.push(swTranslate(language, 'alerts.temperatureHigh', { value: reading.temperatureC }))
  } else if (reading.temperatureC <= 18) {
    alerts.push(swTranslate(language, 'alerts.temperatureLow', { value: reading.temperatureC }))
  }

  if (reading.waterIntakeMl < 150) {
    alerts.push(swTranslate(language, 'alerts.waterLow', { value: reading.waterIntakeMl }))
  }

  if (reading.airQualityIndex > 60) {
    alerts.push(swTranslate(language, 'alerts.aqiHigh', { value: reading.airQualityIndex }))
  }

  if (reading.humidityPercent >= 70) {
    alerts.push(swTranslate(language, 'alerts.humidityHigh', { value: reading.humidityPercent }))
  } else if (reading.humidityPercent <= 30) {
    alerts.push(swTranslate(language, 'alerts.humidityLow', { value: reading.humidityPercent }))
  }

  return alerts
}

function normalisePayload(rawData) {
  if (!rawData) return null
  if (typeof rawData.json === 'function') {
    try {
      return rawData.json()
    } catch (error) {
      console.warn('[sw] failed to parse push json()', error)
    }
  }

  if (typeof rawData.text === 'function') {
    let text = ''
    try {
      text = rawData.text()
    } catch (error) {
      console.warn('[sw] failed to read push text()', error)
      return null
    }

    if (!text) return null

    try {
      return JSON.parse(text)
    } catch (error) {
      console.warn('[sw] failed to parse push text()', error)
      return {
        body: text,
      }
    }
  }

  return null
}

async function dispatchNotification(payload) {
  if (!payload) return

  const requestedLanguage = resolveLanguage(payload.language)
  const alertId =
    payload.alertId ||
    payload.timestamp ||
    (payload.reading && payload.reading.timestamp) ||
    Date.now().toString()

  if (alertId && alertId === lastAlertId) {
    return
  }

  const explicitAlerts = Array.isArray(payload.alerts) ? payload.alerts : []
  const computedAlerts = payload.reading
    ? buildAlertsFromReading(payload.reading, requestedLanguage)
    : []

  const lines = payload.body
    ? [payload.body]
    : [...explicitAlerts, ...computedAlerts]

  if (!lines.length) {
    return
  }

  lastAlertId = alertId
  languagePreference = requestedLanguage

  const title = payload.title || swTranslate(requestedLanguage, 'alerts.title') || 'Smart Cat Home'
  const notificationOptions = {
    body: lines.join('\n'),
    tag: payload.tag || ALERT_TAG,
    renotify: payload.renotify ?? true,
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_BADGE,
    data: {
      ...payload.data,
      url: payload.url,
      alertId,
      language: requestedLanguage,
      reading: payload.reading,
    },
  }

  await self.registration.showNotification(title, notificationOptions)
}

self.addEventListener('push', (event) => {
  const payload = normalisePayload(event.data)
  event.waitUntil(dispatchNotification(payload))
})

self.addEventListener('message', (event) => {
  if (!event.data) return

  if (event.data.type === 'SMART_CAT_SNAPSHOT' && event.data.payload) {
    event.waitUntil(
      dispatchNotification({
        alertId: event.data.payload.reading?.timestamp,
        reading: event.data.payload.reading,
        language: languagePreference,
      }),
    )
    return
  }

  if (event.data.type === 'SMART_CAT_ALERT' && event.data.payload) {
    event.waitUntil(
      dispatchNotification({
        ...event.data.payload,
        language: event.data.payload.language || languagePreference,
      }),
    )
    return
  }

  if (event.data.type === 'SMART_CAT_LANGUAGE' && event.data.payload) {
    languagePreference = resolveLanguage(event.data.payload)
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl)
          }
          return
        }
      }

      if (self.clients.openWindow && targetUrl) {
        return self.clients.openWindow(targetUrl)
      }
      return undefined
    }),
  )
})
