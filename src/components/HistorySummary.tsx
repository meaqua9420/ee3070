import { useLanguage } from '../i18n/LanguageProvider'
import type { HistoricalRecord } from '../utils/history'

interface HistorySummaryProps {
  history: HistoricalRecord[]
}

function toFixed(value: number, fractionDigits = 1) {
  return value.toFixed(fractionDigits)
}

export function HistorySummary({ history }: HistorySummaryProps) {
  const { t } = useLanguage()

  if (!history.length) {
    return null
  }

  const temperatures = history.map((item) => item.reading.temperatureC)
  const humidity = history.map((item) => item.reading.humidityPercent)
  const water = history.map((item) => item.reading.waterIntakeMl)

  const avgTemperature =
    temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length
  const avgHumidity = humidity.reduce((sum, value) => sum + value, 0) / humidity.length
  const totalWater = Math.max(...water)

  const highestTemperature = Math.max(...temperatures)
  const lowestTemperature = Math.min(...temperatures)

  const latestTimestamp = new Date(history[0].timestamp).toLocaleString()

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>{t('history.title')}</h2>
        <p>{t('history.subtitle', { count: history.length })}</p>
      </header>
      <div className="history-grid">
        <div className="history-card">
          <span className="history-card__label">{t('history.avgTemperature')}</span>
          <strong>{toFixed(avgTemperature)}°C</strong>
          <small>
            {t('history.range', {
              min: toFixed(lowestTemperature),
              max: toFixed(highestTemperature),
            })}
          </small>
        </div>
        <div className="history-card">
          <span className="history-card__label">{t('history.avgHumidity')}</span>
          <strong>{toFixed(avgHumidity)}%</strong>
          <small>{t('history.samples', { count: humidity.length })}</small>
        </div>
        <div className="history-card">
          <span className="history-card__label">{t('history.totalWater')}</span>
          <strong>{totalWater}ml</strong>
          <small>{t('history.totalWaterNote')}</small>
        </div>
        <div className="history-card">
          <span className="history-card__label">{t('history.lastSync')}</span>
          <strong>{latestTimestamp}</strong>
          <small>{t('history.lastSyncNote')}</small>
        </div>
      </div>
    </section>
  )
}
