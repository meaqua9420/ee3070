import type { TranslationKey } from '../i18n/translations'
import type { AIInsight, SmartHomeSnapshot } from '../types/smartHome'

const HEALTHY_RANGES = {
  temperature: { min: 20, max: 28 },
  humidity: { min: 35, max: 60 },
  waterIntakeMl: 150,
  airQualityMax: 60,
  feedingIntervalMinutes: 240,
}

type Translator = (
  key: TranslationKey,
  variables?: Record<string, string | number>,
) => string

export function generateInsights(
  snapshot: SmartHomeSnapshot | null,
  t: Translator,
): AIInsight[] {
  if (!snapshot) return []
  const { reading, settings } = snapshot
  const insights: AIInsight[] = []

  if (reading.temperatureC > HEALTHY_RANGES.temperature.max) {
    insights.push({
      title: t('ai.insight.hot.title'),
      description: t('ai.insight.hot.body', { value: reading.temperatureC }),
      severity: reading.temperatureC > 32 ? 'critical' : 'warning',
    })
  } else if (reading.temperatureC < HEALTHY_RANGES.temperature.min) {
    insights.push({
      title: t('ai.insight.cold.title'),
      description: t('ai.insight.cold.body', { value: reading.temperatureC }),
      severity: 'warning',
    })
  }

  if (reading.humidityPercent > HEALTHY_RANGES.humidity.max) {
    insights.push({
      title: t('ai.insight.humidHigh.title'),
      description: t('ai.insight.humidHigh.body', { value: reading.humidityPercent }),
      severity: 'warning',
    })
  } else if (reading.humidityPercent < HEALTHY_RANGES.humidity.min) {
    insights.push({
      title: t('ai.insight.humidLow.title'),
      description: t('ai.insight.humidLow.body', { value: reading.humidityPercent }),
      severity: 'warning',
    })
  }

  if (reading.waterIntakeMl < HEALTHY_RANGES.waterIntakeMl) {
    insights.push({
      title: t('ai.insight.waterLow.title'),
      description: t('ai.insight.waterLow.body', { value: reading.waterIntakeMl }),
      severity: 'critical',
    })
  }

  if (reading.airQualityIndex > HEALTHY_RANGES.airQualityMax) {
    insights.push({
      title: t('ai.insight.aqi.title'),
      description: t('ai.insight.aqi.body', { value: reading.airQualityIndex }),
      severity: 'warning',
    })
  }

  if (reading.lastFeedingMinutesAgo > HEALTHY_RANGES.feedingIntervalMinutes) {
    insights.push({
      title: t('ai.insight.feeding.title'),
      description: t('ai.insight.feeding.body', {
        value: reading.lastFeedingMinutesAgo,
      }),
      severity: 'info',
    })
  }

  const temperatureGap = settings.targetTemperatureC - reading.temperatureC
  if (Math.abs(temperatureGap) >= 2 && !settings.autoMode) {
    insights.push({
      title: t('ai.insight.autoset.title'),
      description: t('ai.insight.autoset.body'),
      severity: 'info',
    })
  }

  if (insights.length === 0) {
    insights.push({
      title: t('ai.insight.good.title'),
      description: t('ai.insight.good.body'),
      severity: 'info',
    })
  }

  return insights
}
