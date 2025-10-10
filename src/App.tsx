import { useMemo, useState } from 'react'
import { AIAdvisor } from './components/AIAdvisor'
import { ControlPanel } from './components/ControlPanel'
import { DataCard } from './components/DataCard'
import { DeviceStatusList } from './components/DeviceStatusList'
import { UsageGuide } from './components/UsageGuide'
import { HistorySummary } from './components/HistorySummary'
import { EquipmentDiagnostics } from './components/EquipmentDiagnostics'
import { AiChatPanel } from './components/AiChatPanel'
import { useSmartHomeData } from './hooks/useSmartHomeData'
import './App.css'
import { ensurePushSubscription, pushNotificationWorker } from './utils/pushNotifications'
import { useLanguage } from './i18n/LanguageProvider'
import type { Language, TranslationKey } from './i18n/translations'

function App() {
  const {
    snapshot,
    history,
    settings,
    loading,
    error,
    refresh,
    updateSettings,
  } = useSmartHomeData()

  const { t, language, setLanguage, options } = useLanguage()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [notificationStatus, setNotificationStatus] = useState<
    'idle' | 'enabled' | 'denied' | 'error'
  >(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied'
    }
    const permission = window.Notification.permission
    if (permission === 'granted') {
      return 'enabled'
    }
    if (permission === 'denied') {
      return 'denied'
    }
    return 'idle'
  })

  const [notificationKey, setNotificationKey] = useState<TranslationKey | null>(
    null,
  )
  const [notificationFallback, setNotificationFallback] = useState<string | null>(
    null,
  )

  const lastUpdatedValue = snapshot
    ? new Date(snapshot.reading.timestamp).toLocaleString()
    : t('app.noUpdate')
  const lastUpdatedLabel = useMemo(
    () => t('app.lastUpdated', { time: lastUpdatedValue }),
    [lastUpdatedValue, t],
  )

  const enableNotifications = async () => {
    const workerResult = await pushNotificationWorker(language)
    if (!workerResult.ok) {
      if (workerResult.permission === 'denied') {
        setNotificationStatus('denied')
      } else {
        setNotificationStatus('error')
      }

      if (workerResult.messageKey) {
        setNotificationKey(workerResult.messageKey)
        setNotificationFallback(null)
      } else if (workerResult.message) {
        setNotificationKey(null)
        setNotificationFallback(workerResult.message)
      } else if (workerResult.permission === 'denied') {
        setNotificationKey('notifications.denied')
        setNotificationFallback(null)
      } else {
        setNotificationKey('notifications.error')
        setNotificationFallback(null)
      }
      return
    }

    const subscriptionResult = await ensurePushSubscription(language)
    if (!subscriptionResult.ok) {
      setNotificationStatus('error')
      if (subscriptionResult.messageKey) {
        setNotificationKey(subscriptionResult.messageKey)
        setNotificationFallback(subscriptionResult.message ?? null)
      } else if (subscriptionResult.message) {
        setNotificationKey(null)
        setNotificationFallback(subscriptionResult.message)
      } else {
        setNotificationKey('notifications.error')
        setNotificationFallback(null)
      }
      return
    }

    setNotificationStatus('enabled')
    setNotificationKey('notifications.success')
    setNotificationFallback(null)
  }

  const updateLanguage = (next: Language) => {
    setLanguage(next)
    setSettingsOpen(false)
  }

  const notificationMessage = notificationKey
    ? t(notificationKey)
    : notificationFallback

  const temperatureHighlight = snapshot
    ? snapshot.reading.temperatureC >= 31
      ? 'critical'
      : snapshot.reading.temperatureC >= 28
        ? 'warning'
        : 'normal'
    : 'normal'

  const humidityHighlight = snapshot
    ? snapshot.reading.humidityPercent <= 30 || snapshot.reading.humidityPercent >= 65
      ? 'warning'
      : 'normal'
    : 'normal'

  const waterHighlight = snapshot
    ? snapshot.reading.waterIntakeMl < 150
      ? 'critical'
      : 'normal'
    : 'normal'

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>{t('app.title')}</h1>
          <p>{t('app.subtitle')}</p>
          <small>{lastUpdatedLabel}</small>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="action-button"
            onClick={() => refresh()}
            disabled={loading}
          >
            {loading ? t('app.refreshLoading') : t('app.refresh')}
          </button>
          <button
            type="button"
            className="action-button action-button--secondary"
            onClick={enableNotifications}
            disabled={notificationStatus === 'enabled'}
          >
            {notificationStatus === 'enabled'
              ? t('app.notifications.enabled')
              : t('app.notifications.enable')}
          </button>
          <button
            type="button"
            className="action-button action-button--ghost"
            onClick={() => setSettingsOpen((prev) => !prev)}
          >
            {t('settings.button')}
          </button>
          {settingsOpen ? (
            <div className="settings-popover" role="dialog" aria-label={t('settings.language')}>
              <p>{t('settings.language')}</p>
              {options.map((option) => (
                <label key={option.code} className="settings-option">
                  <input
                    type="radio"
                    name="language"
                    value={option.code}
                    checked={language === option.code}
                    onChange={() => updateLanguage(option.code)}
                  />
                  <span>{t(option.labelKey)}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="error-banner">
          {error === 'fetch' ? t('errors.fetch') : t('errors.settings')}
        </div>
      ) : null}
      {notificationMessage ? (
        <div className="info-banner">{notificationMessage}</div>
      ) : null}

      <main className="content-grid">
        <section className="panel wide">
          <header className="panel__header">
            <h2>{t('panel.realtime.title')}</h2>
            <p>{t('panel.realtime.subtitle')}</p>
          </header>
          <div className="data-grid">
            <DataCard
              title={t('data.temperature.title')}
              value={snapshot ? snapshot.reading.temperatureC.toString() : '--'}
              unit="°C"
              highlight={temperatureHighlight}
              footer={t('data.temperature.footer', {
                value: settings.targetTemperatureC,
              })}
            />
            <DataCard
              title={t('data.humidity.title')}
              value={snapshot ? snapshot.reading.humidityPercent.toString() : '--'}
              unit="%"
              highlight={humidityHighlight}
              footer={t('data.humidity.footer', {
                value: settings.targetHumidityPercent,
              })}
            />
            <DataCard
              title={t('data.water.title')}
              value={snapshot ? snapshot.reading.waterIntakeMl.toString() : '--'}
              unit="ml"
              highlight={waterHighlight}
              footer={t('data.water.footer')}
            />
            <DataCard
              title={t('data.weight.title')}
              value={snapshot ? snapshot.reading.catWeightKg.toString() : '--'}
              unit="kg"
              footer={t('data.weight.footer')}
            />
            <DataCard
              title={t('data.aqi.title')}
              value={snapshot ? snapshot.reading.airQualityIndex.toString() : '--'}
              footer={t('data.aqi.footer')}
            />
            <DataCard
              title={t('data.feeding.title')}
              value={snapshot ? snapshot.reading.lastFeedingMinutesAgo.toString() : '--'}
              unit={language === 'zh' ? '分鐘' : 'min'}
              footer={t('data.feeding.footer', {
                schedule: settings.feederSchedule,
              })}
            />
          </div>
        </section>

        <ControlPanel
          settings={settings}
          onUpdate={updateSettings}
          disabled={loading}
        />

        {snapshot ? <DeviceStatusList status={snapshot.status} /> : null}

        <EquipmentDiagnostics />

        <HistorySummary history={history} />

        <AIAdvisor snapshot={snapshot} />

        <AiChatPanel />

        <UsageGuide />
      </main>
    </div>
  )
}

export default App
