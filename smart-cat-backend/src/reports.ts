import { DEFAULT_SETTINGS } from './constants'
import type {
  AutomationAlert,
  LanguageCode,
  ProfessionalCareAction,
  ProfessionalCareReport,
  ProfessionalCareVital,
  SmartHomeSnapshot,
  SmartHomeSettings,
} from './types'

interface BuildReportParams {
  snapshot: SmartHomeSnapshot | null
  history: SmartHomeSnapshot[]
  alerts: AutomationAlert[]
  settings?: SmartHomeSettings | null
  language?: LanguageCode
}

type MetricKey =
  | 'temperatureC'
  | 'humidityPercent'
  | 'waterIntakeMl'
  | 'catWeightKg'
  | 'waterLevelPercent'
  | 'ambientLightPercent'

const TEMPERATURE_TOLERANCE = 1.5
const TEMPERATURE_ALERT = 3
const HUMIDITY_TOLERANCE = 5
const HUMIDITY_ALERT = 12

const HYDRATION_GOAL_ML = 180
const HYDRATION_LOW = 120
const HYDRATION_CRITICAL = 80

const WEIGHT_ALERT_KG = 0.3

function formatNumber(value: number, fractionDigits = 1): string {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : '—'
}

function localised<T>(language: LanguageCode, values: { zh: T; en: T }): T {
  return language === 'en' ? values.en : values.zh
}

function classifyVariance(
  value: number,
  target: number,
  comfort: number,
  alert: number,
): { status: 'optimal' | 'watch' | 'critical'; deviation: number } {
  const diff = value - target
  const absDiff = Math.abs(diff)
  if (absDiff <= comfort) {
    return { status: 'optimal', deviation: diff }
  }
  if (absDiff <= alert) {
    return { status: 'watch', deviation: diff }
  }
  return { status: 'critical', deviation: diff }
}

function computeTrend(
  history: SmartHomeSnapshot[],
  metric: MetricKey,
): { trend: 'up' | 'down' | 'stable' | 'unknown'; delta: number } {
  if (history.length < 2) {
    return { trend: 'unknown', delta: 0 }
  }
  const ascending = [...history].sort(
    (a, b) =>
      new Date(a.reading.timestamp).getTime() - new Date(b.reading.timestamp).getTime(),
  )
  if (ascending.length < 2) {
    return { trend: 'unknown', delta: 0 }
  }
  const latestEntry = ascending[ascending.length - 1]
  const baselineIndex = Math.max(0, ascending.length - 6)
  const baselineEntry = ascending[baselineIndex]
  if (!latestEntry || !baselineEntry) {
    return { trend: 'unknown', delta: 0 }
  }
  const latestValue = latestEntry.reading[metric]
  const baselineValue = baselineEntry.reading[metric]
  if (typeof latestValue !== 'number' || typeof baselineValue !== 'number') {
    return { trend: 'unknown', delta: 0 }
  }
  const delta = latestValue - baselineValue
  if (Math.abs(delta) < 0.01) {
    return { trend: 'stable', delta }
  }
  return { trend: delta > 0 ? 'up' : 'down', delta }
}

function describeTrend(
  language: LanguageCode,
  labels: { zh: string; en: string },
  trend: ReturnType<typeof computeTrend>,
  unit: string,
): string | null {
  if (trend.trend === 'unknown' || Math.abs(trend.delta) < 0.1) {
    return null
  }
  const absDelta = Math.abs(trend.delta).toFixed(1)
  const directionText = localised(language, {
    zh: trend.trend === 'up' ? '上升' : '下降',
    en: trend.trend === 'up' ? 'rising' : 'falling',
  })
  const label = localised(language, labels)
  if (language === 'en') {
    return `${label} ${directionText} by ${absDelta}${unit}`
  }
  return `${label} ${directionText} ${absDelta}${unit}`
}

function deriveHistoryWindowHours(history: SmartHomeSnapshot[]): number {
  if (history.length < 2) return 0
  const ascending = [...history].sort(
    (a, b) =>
      new Date(a.reading.timestamp).getTime() - new Date(b.reading.timestamp).getTime(),
  )
  if (ascending.length < 2) return 0
  const first = ascending[0]
  const last = ascending[ascending.length - 1]
  if (!first || !last) return 0
  const start = new Date(first.reading.timestamp).getTime()
  const end = new Date(last.reading.timestamp).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0
  }
  return Math.round((end - start) / (1000 * 60 * 60))
}

export function buildProfessionalCareReport({
  snapshot,
  history,
  alerts,
  settings,
  language = 'zh',
}: BuildReportParams): ProfessionalCareReport {
  const referenceSettings = settings ?? DEFAULT_SETTINGS
  const generatedAt = new Date().toISOString()
  const latestSnapshot =
    snapshot ?? history?.[0] ?? {
      reading: {
        temperatureC: 0,
        humidityPercent: 0,
        waterIntakeMl: 0,
        airQualityIndex: 0,
        catWeightKg: 0,
        lastFeedingMinutesAgo: 0,
        timestamp: generatedAt,
      },
      settings: referenceSettings,
      status: {
        heaterOn: false,
        humidifierOn: false,
        waterPumpOn: false,
        feederActive: false,
        purifierOn: false,
      },
    }

  const reading = latestSnapshot.reading
  const vitals: ProfessionalCareVital[] = []
  const trendNotes: string[] = []
  const actionItems: ProfessionalCareAction[] = []
  const followUps: ProfessionalCareAction[] = []

  // Temperature
  const temperatureVariance = classifyVariance(
    reading.temperatureC,
    referenceSettings.targetTemperatureC,
    TEMPERATURE_TOLERANCE,
    TEMPERATURE_ALERT,
  )
  const temperatureTrend = computeTrend(history, 'temperatureC')
  const temperatureTarget = referenceSettings.targetTemperatureC.toFixed(1)
  const temperatureDeviationFormatted = `${temperatureVariance.deviation >= 0 ? '+' : ''}${temperatureVariance.deviation.toFixed(1)}`
  const temperatureDetails = localised(language, {
    zh: `目標 ${temperatureTarget}°C，偏差 ${temperatureDeviationFormatted}°C`,
    en: `Target ${temperatureTarget}°C; deviation ${temperatureDeviationFormatted}°C`,
  })
  const temperatureVital: ProfessionalCareVital = {
    id: 'temperature',
    label: localised(language, { zh: '環境溫度', en: 'Temperature' }),
    value: `${formatNumber(reading.temperatureC, 1)}°C`,
    status: temperatureVariance.status,
    details: temperatureDetails,
    trend: temperatureTrend.trend,
  }
  if (temperatureVariance.status === 'critical') {
    temperatureVital.recommendations = [
      localised(language, {
        zh: '立即調整暖氣/冷氣或移動貓咪至舒適空間。',
        en: 'Adjust heating/cooling immediately or move your cat to a comfortable area.',
      }),
      localised(language, {
        zh: '持續監測 30 分鐘，溫度未改善時考慮啟用自動化。',
        en: 'Monitor for 30 minutes; enable automation if the temperature does not improve.',
      }),
    ]
  } else if (temperatureVariance.status === 'watch') {
    temperatureVital.recommendations = [
      localised(language, {
        zh: '建議微調暖氣或冷氣以貼近設定值。',
        en: 'Fine-tune heating or cooling to stay near the target temperature.',
      }),
    ]
  }
  vitals.push(temperatureVital)
  const temperatureTrendText = describeTrend(language, { zh: '溫度', en: 'Temperature' }, temperatureTrend, '°C')
  if (temperatureTrendText) trendNotes.push(temperatureTrendText)
  if (temperatureVariance.status === 'critical') {
    actionItems.push({
      id: 'temperature-corrective',
      title: localised(language, {
        zh: '立即調整環境溫度',
        en: 'Stabilize the temperature now',
      }),
      description: localised(language, {
        zh: '偵測到溫度已超出安全範圍，請立即調整暖氣/冷氣或將貓咪移至舒適環境。',
        en: 'Temperature is outside the safe range. Adjust heating/cooling or move your cat to a comfortable space right away.',
      }),
      urgency: 'high',
    })
  }

  // Humidity
  const humidityVariance = classifyVariance(
    reading.humidityPercent,
    referenceSettings.targetHumidityPercent,
    HUMIDITY_TOLERANCE,
    HUMIDITY_ALERT,
  )
  const humidityTrend = computeTrend(history, 'humidityPercent')
  const humidityTarget = referenceSettings.targetHumidityPercent.toFixed(0)
  const humidityDeviationFormatted = `${humidityVariance.deviation >= 0 ? '+' : ''}${humidityVariance.deviation.toFixed(0)}`
  const humidityDetails = localised(language, {
    zh: `目標 ${humidityTarget}% ，偏差 ${humidityDeviationFormatted}%`,
    en: `Target ${humidityTarget}%; deviation ${humidityDeviationFormatted}%`,
  })
  const humidityVital: ProfessionalCareVital = {
    id: 'humidity',
    label: localised(language, { zh: '相對濕度', en: 'Humidity' }),
    value: `${formatNumber(reading.humidityPercent, 0)}%`,
    status: humidityVariance.status,
    details: humidityDetails,
    trend: humidityTrend.trend,
  }
  if (humidityVariance.status === 'critical') {
    humidityVital.recommendations = [
      localised(language, {
        zh: '請立即啟用除濕或加濕設備，避免呼吸道問題。',
        en: 'Enable a dehumidifier or humidifier right away to protect respiratory health.',
      }),
      localised(language, {
        zh: '若環境潮濕，檢查是否有漏水或通風不良。',
        en: 'Check for ventilation issues or leaks if the space feels damp.',
      }),
    ]
  } else if (humidityVariance.status === 'watch') {
    humidityVital.recommendations = [
      localised(language, {
        zh: '建議微調除濕/加濕設備，維持在 45-60% 之間。',
        en: 'Fine-tune humidity controls to stay between 45% and 60%.',
      }),
    ]
  }
  vitals.push(humidityVital)
  const humidityTrendText = describeTrend(language, { zh: '濕度', en: 'Humidity' }, humidityTrend, '%')
  if (humidityTrendText) trendNotes.push(humidityTrendText)
  if (humidityVariance.status === 'critical') {
    actionItems.push({
      id: 'humidity-corrective',
      title: localised(language, {
        zh: '調整濕度設備',
        en: 'Stabilize humidity',
      }),
      description: localised(language, {
        zh: '濕度偏離理想範圍，請檢查加濕/除濕機的設定並觀察貓咪是否有咳嗽或流淚現象。',
        en: 'Humidity is outside the preferred range. Adjust humidifier/dehumidifier settings and watch for coughing or watery eyes.',
      }),
      urgency: 'moderate',
    })
  }

  // Hydration
  const hydration = reading.waterIntakeMl
  let hydrationStatus: ProfessionalCareVital['status'] = 'optimal'
  let hydrationRecommendations: string[] | undefined
  if (hydration < HYDRATION_CRITICAL) {
    hydrationStatus = 'critical'
    hydrationRecommendations = [
      localised(language, {
        zh: '貓咪今日喝水量過低，請立即提供新鮮水源或添加飲水誘因。',
        en: 'Today’s water intake is very low—offer fresh water or add hydration boosters immediately.',
      }),
      localised(language, {
        zh: '必要時考慮提供濕食或皮下補液（請先諮詢獸醫）。',
        en: 'If needed, switch to wet food or discuss subcutaneous fluids with your vet.',
      }),
    ]
    actionItems.push({
      id: 'hydration-urgent',
      title: localised(language, {
        zh: '補水緊急措施',
        en: 'Emergency hydration plan',
      }),
      description: localised(language, {
        zh: '今日喝水量極低，請立即補水並觀察尿量，如持續偏低需安排獸醫評估。',
        en: 'Water intake is critically low. Hydrate now and monitor urine output—contact your vet if it stays low.',
      }),
      urgency: 'high',
    })
  } else if (hydration < HYDRATION_LOW) {
    hydrationStatus = 'watch'
    hydrationRecommendations = [
      localised(language, {
        zh: '建議增加飲水誘因，如加入循環水機或添加少量鮮食湯汁。',
        en: 'Boost hydration with a fountain or add a bit of broth to meals.',
      }),
      localised(language, {
        zh: '持續監測 24 小時，若仍低於標準則升級為緊急處置。',
        en: 'Monitor for the next 24 hours; escalate if intake stays below goal.',
      }),
    ]
    actionItems.push({
      id: 'hydration-plan',
      title: localised(language, {
        zh: '制定補水計畫',
        en: 'Create a hydration plan',
      }),
      description: localised(language, {
        zh: '喝水量略低，請安排定時餵水/濕食，並記錄接下來 24hr 飲水狀況。',
        en: 'Water intake is slightly low. Schedule wet food or syringe feeds and log the next 24 hours.',
      }),
      urgency: 'moderate',
    })
  }
  const hydrationTrend = computeTrend(history, 'waterIntakeMl')
  const hydrationTrendText = describeTrend(language, { zh: '飲水量', en: 'Hydration' }, hydrationTrend, ' ml')
  if (hydrationTrendText) trendNotes.push(hydrationTrendText)
  const hydrationVital: ProfessionalCareVital = {
    id: 'hydration',
    label: localised(language, { zh: '今日飲水量', en: 'Hydration today' }),
    value: `${formatNumber(hydration, 0)} ml`,
    status: hydrationStatus,
    details: localised(language, {
      zh: `建議每日至少 ${HYDRATION_GOAL_ML} ml`,
      en: `Aim for at least ${HYDRATION_GOAL_ML} ml per day`,
    }),
    trend: hydrationTrend.trend,
  }
  if (hydrationRecommendations && hydrationRecommendations.length > 0) {
    hydrationVital.recommendations = hydrationRecommendations
  }
  vitals.push(hydrationVital)

  // Feeding interval
  const feedingMinutes = reading.lastFeedingMinutesAgo
  let feedingStatus: ProfessionalCareVital['status'] = 'optimal'
  const feedingRecommendations: string[] = []
  if (feedingMinutes > 720) {
    feedingStatus = 'critical'
    feedingRecommendations.push(
      localised(language, {
        zh: '距離上次進食超過 12 小時，請立即安排進食並觀察胃口。',
        en: 'It has been over 12 hours since the last meal—feed now and monitor appetite closely.',
      }),
    )
    actionItems.push({
      id: 'feeding-critical',
      title: localised(language, {
        zh: '即時餵食',
        en: 'Feed immediately',
      }),
      description: localised(language, {
        zh: '已超過 12 小時未進食，需立即提供食物並觀察是否有拒食跡象。',
        en: 'It has been more than 12 hours without food. Offer a meal now and check for signs of refusal.',
      }),
      urgency: 'high',
    })
  } else if (feedingMinutes > 480) {
    feedingStatus = 'watch'
    feedingRecommendations.push(
      localised(language, {
        zh: '距離上次進食超過 8 小時，建議準備下一餐並觀察食慾。',
        en: 'It has been over 8 hours since the last meal—prepare the next feeding and observe appetite.',
      }),
    )
  }
  const feedingVital: ProfessionalCareVital = {
    id: 'feeding',
    label: localised(language, { zh: '距離上次餵食', en: 'Feeding interval' }),
    value: localised(language, { zh: `${feedingMinutes} 分鐘`, en: `${feedingMinutes} min` }),
    status: feedingStatus,
    details: localised(language, {
      zh: '建議每 6-8 小時提供一次餐食或點心。',
      en: 'Offer meals or snacks roughly every 6–8 hours.',
    }),
  }
  if (feedingRecommendations.length > 0) {
    feedingVital.recommendations = feedingRecommendations
  }
  vitals.push(feedingVital)

  // Alerts integration
  const alertSummaries = alerts.slice(0, 5).map((alert) => {
    const when = new Date(alert.timestamp).toLocaleString()
    const severityLabel = localised(language, {
      zh: alert.severity === 'critical' ? '緊急' : alert.severity === 'warning' ? '警告' : '資訊',
      en: alert.severity === 'critical' ? 'CRITICAL' : alert.severity === 'warning' ? 'WARNING' : 'INFO',
    })
    return `${when} · [${severityLabel}] ${alert.message}`
  })
  if (alertSummaries.length > 0) {
    trendNotes.push(...alertSummaries)
  }

  const criticalExists = vitals.some((vital) => vital.status === 'critical')
  const watchExists = vitals.some((vital) => vital.status === 'watch')

  if (criticalExists) {
    followUps.push({
      id: 'veterinary-consult',
      title: localised(language, {
        zh: '聯絡獸醫或照護專員',
        en: 'Contact your vet or care specialist',
      }),
      description: localised(language, {
        zh: '報告中有高風險指標，建議在 24 小時內聯絡獸醫或照護專員協助評估。',
        en: 'High-risk indicators detected—consult your veterinarian or care specialist within 24 hours.',
      }),
      urgency: 'high',
    })
  } else if (watchExists) {
    followUps.push({
      id: 'monitoring',
      title: localised(language, {
        zh: '安排後續追蹤',
        en: 'Plan a follow-up check',
      }),
      description: localised(language, {
        zh: '部分指標需要持續追蹤，建議 3 日後再次檢視趨勢並更新照護紀錄。',
        en: 'Some metrics need monitoring—review trends again in about 3 days and log any changes.',
      }),
      urgency: 'moderate',
    })
  } else {
    followUps.push({
      id: 'routine-check',
      title: localised(language, {
        zh: '維持例行檢查',
        en: 'Maintain routine checks',
      }),
      description: localised(language, {
        zh: '目前指標良好，建議持續紀錄飲水、體重與活動情況，每週整理一次。',
        en: 'Metrics look healthy. Keep logging hydration, weight, and activity each week.',
      }),
      urgency: 'low',
    })
  }

  const notes: string[] = []
  if (alerts.length === 0 && !criticalExists && !watchExists) {
    notes.push(
      localised(language, {
        zh: '最近未觸發任何警報，請持續維持目前的照護方式。',
        en: 'No recent alerts—keep up the current care routine.',
      }),
    )
  } else if (alerts.length > 0) {
    notes.push(
      localised(language, {
        zh: '系統近期偵測到警報，請逐一確認已採取對應措施。',
        en: 'Recent system alerts detected—double-check that each one has been addressed.',
      }),
    )
  }

  const historyWindowHours = deriveHistoryWindowHours(history)
  const riskLevel = criticalExists ? 'high' : watchExists ? 'medium' : 'low'

  const summary =
    riskLevel === 'high'
      ? localised(language, {
        zh: '偵測到高風險指標，需要立即採取行動並聯絡專業人員。',
        en: 'High-risk indicators detected. Act now and contact a veterinary professional.',
      })
      : riskLevel === 'medium'
        ? localised(language, {
            zh: '部分指標需密切追蹤，建議制定短期照護計畫。',
            en: 'Some metrics need closer tracking—set a short-term care plan.',
          })
        : localised(language, {
            zh: '整體狀態穩定，請維持例行照護與紀錄。',
            en: 'Overall status is stable. Continue routine care and logging.',
          })

  const headline =
    riskLevel === 'high'
      ? localised(language, {
          zh: '⚠️ 優先處理：貓咪狀態存在高風險項目',
          en: '⚠️ High priority: Your cat is showing high-risk indicators',
        })
      : riskLevel === 'medium'
        ? localised(language, {
            zh: '⚠ 需留意：部分照護指標偏離範圍',
            en: '⚠ Keep watch: Some care metrics drifted out of range',
          })
        : localised(language, {
            zh: '✅ 狀態穩定：維持目前照護方式',
            en: '✅ Stable: Continue the current care routine',
          })

  return {
    generatedAt,
    headline,
    summary,
    riskLevel,
    vitals,
    trendHighlights: trendNotes.slice(0, 6),
    actionItems,
    followUps,
    notes,
    metadata: {
      historyWindowHours,
      sampleCount: history.length,
    },
  }
}
