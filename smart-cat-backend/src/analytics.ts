import { DEFAULT_SETTINGS } from './constants'
import type {
  BehaviorForecast,
  BehaviorForecastSegment,
  BehaviorConfidence,
  CareInsight,
  CareInsightCategory,
  CareInsightSeverity,
  CareInsightEvidence,
  CareTaskSuggestion,
  CalibrationProfile,
  LanguageCode,
  SmartHomeSnapshot,
  SmartHomeSettings,
} from './types'

type MetricKey =
  | keyof SmartHomeSnapshot['reading']
  | 'hydrationTrend'

interface MetricStats {
  latest: number | null
  previous: number | null
  average: number | null
  delta: number | null
  direction: 'up' | 'down' | 'stable'
  samples: number
}

const HOUR = 60 * 60 * 1000

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * HOUR).toISOString()
}

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function computeMetricStats(
  history: SmartHomeSnapshot[],
  key: MetricKey,
  lookbackHours = 24,
): MetricStats {
  const cutoff = Date.now() - lookbackHours * HOUR
  const samples: number[] = []

  for (const snapshot of history) {
    const timestamp = new Date(snapshot.reading.timestamp).getTime()
    if (!Number.isFinite(timestamp) || timestamp < cutoff) continue
    if (key === 'hydrationTrend') {
      const water = safeNumber(snapshot.reading.waterIntakeMl)
      if (water !== null) samples.push(water)
      continue
    }
    const value = safeNumber(snapshot.reading[key as keyof SmartHomeSnapshot['reading']])
    if (value !== null) samples.push(value)
  }

  const latestSnapshot = history[0] ?? null
  const previousSnapshot = history[1] ?? null
  const latest =
    key === 'hydrationTrend'
      ? safeNumber(latestSnapshot?.reading.waterIntakeMl)
      : safeNumber(latestSnapshot?.reading[key as keyof SmartHomeSnapshot['reading']])
  const previous =
    key === 'hydrationTrend'
      ? safeNumber(previousSnapshot?.reading.waterIntakeMl)
      : safeNumber(previousSnapshot?.reading[key as keyof SmartHomeSnapshot['reading']])

  const average = samples.length
    ? samples.reduce((sum, value) => sum + value, 0) / samples.length
    : null
  const delta =
    latest !== null && previous !== null
      ? Number((latest - previous).toFixed(2))
      : null

  let direction: 'up' | 'down' | 'stable' = 'stable'
  if (delta !== null) {
    if (Math.abs(delta) < 0.01) {
      direction = 'stable'
    } else {
      direction = delta > 0 ? 'up' : 'down'
    }
  }

  return {
    latest,
    previous,
    average,
    delta,
    direction,
    samples: samples.length,
  }
}

function buildEvidence(
  metric: string,
  stats: MetricStats,
  unit = '',
  note?: string,
): CareInsightEvidence {
  let current: CareInsightEvidence['current'] = '—'
  if (stats.latest !== null) {
    current = unit ? `${stats.latest}${unit}` : stats.latest
  }

  let baseline: CareInsightEvidence['baseline']
  if (stats.average !== null) {
    baseline = unit ? `${stats.average.toFixed(1)}${unit}` : Number(stats.average.toFixed(2))
  }

  const evidence: CareInsightEvidence = {
    metric,
    current,
  }

  if (baseline !== undefined) {
    evidence.baseline = baseline
  }
  if (unit) {
    evidence.unit = unit
  }
  if (note) {
    evidence.note = note
  }

  return evidence
}

function classifySeverity(value: number | null, thresholds: { warning: number; critical: number }): CareInsightSeverity {
  if (value === null) return 'info'
  if (Math.abs(value) >= thresholds.critical) return 'critical'
  if (Math.abs(value) >= thresholds.warning) return 'warning'
  return 'info'
}

function defaultSettings(settings?: SmartHomeSettings | null): SmartHomeSettings {
  return settings ?? DEFAULT_SETTINGS
}

function createInsightId(category: CareInsightCategory, suffix: string): string {
  return `${category}:${suffix}`
}

function createInsight(
  category: CareInsightCategory,
  severity: CareInsightSeverity,
  title: string,
  summary: string,
  evidence: CareInsightEvidence[],
  recommendations: string[],
  followUpTask?: CareTaskSuggestion,
): CareInsight {
  return {
    id: createInsightId(category, title.replace(/\s+/g, '-').toLowerCase()),
    title,
    summary,
    severity,
    category,
    recommendations,
    evidence,
    createdAt: new Date().toISOString(),
    followUpTask,
  }
}

function describeVariance(value: number | null, target: number, tolerance: number) {
  if (value === null) return null
  const diff = Number((value - target).toFixed(2))
  if (Math.abs(diff) < tolerance) return null
  return diff
}

function localised(language: LanguageCode, options: { zh: string; en: string }) {
  return language === 'zh' ? options.zh : options.en
}

function computePresenceTrend(history: SmartHomeSnapshot[], windowHours = 12) {
  const cutoff = Date.now() - windowHours * HOUR
  let presentMinutes = 0
  let totalMinutes = 0
  let longestAway = 0
  let currentAway = 0
  let lastTimestamp: number | null = null

  for (const snapshot of [...history].reverse()) {
    const ts = new Date(snapshot.reading.timestamp).getTime()
    if (!Number.isFinite(ts) || ts < cutoff) continue
    if (lastTimestamp !== null) {
      const diffMinutes = Math.max(1, Math.round((ts - lastTimestamp) / (60 * 1000)))
      totalMinutes += diffMinutes
      if (snapshot.reading.catPresent ?? snapshot.reading.catWeightKg >= 1) {
        presentMinutes += diffMinutes
        currentAway = 0
      } else {
        currentAway += diffMinutes
        longestAway = Math.max(longestAway, currentAway)
      }
    }
    lastTimestamp = ts
  }

  const presencePercent = totalMinutes > 0 ? Math.round((presentMinutes / totalMinutes) * 100) : null
  return {
    presencePercent,
    longestAwayMinutes: longestAway,
  }
}

export function deriveCareInsights(
  language: LanguageCode,
  snapshot: SmartHomeSnapshot | null,
  history: SmartHomeSnapshot[],
  settings?: SmartHomeSettings | null,
): CareInsight[] {
  const insights: CareInsight[] = []
  const referenceSettings = defaultSettings(settings ?? snapshot?.settings ?? null)

  const temperatureStats = computeMetricStats(history, 'temperatureC')
  const temperatureVariance = describeVariance(
    temperatureStats.latest,
    referenceSettings.targetTemperatureC,
    0.6,
  )
  if (temperatureVariance !== null) {
    const severity = classifySeverity(temperatureVariance, { warning: 1.2, critical: 2.2 })
    const title = localised(language, {
      zh: temperatureVariance > 0 ? '室內溫度偏高' : '室內溫度偏低',
      en: temperatureVariance > 0 ? 'Room temperature is running high' : 'Room temperature is running low',
    })
    const summary = localised(language, {
      zh: `溫度與目標 ${referenceSettings.targetTemperatureC.toFixed(1)}°C 相差 ${temperatureVariance > 0 ? '+' : ''}${temperatureVariance.toFixed(1)}°C，請留意環境舒適度。`,
      en: `Temperature deviates ${temperatureVariance > 0 ? '+' : ''}${temperatureVariance.toFixed(1)}°C from the target ${referenceSettings.targetTemperatureC.toFixed(1)}°C. Keep the room comfortable.`,
    })
    const evidence = [
      buildEvidence(localised(language, { zh: '目前溫度', en: 'Current temperature' }), temperatureStats, '°C'),
    ]
    const recommendations: string[] = []
    if (temperatureVariance > 0) {
      recommendations.push(
        localised(language, {
          zh: '啟動冷氣或加強通風，並避免直射陽光。', en: 'Use cooling or improve airflow; block direct sunlight.',
        }),
      )
    } else {
      recommendations.push(
        localised(language, {
          zh: '補強保暖設備，避免冷風直吹休息區。', en: 'Add warmth and stop drafts near the resting spot.',
        }),
      )
    }
    const followUpTask: CareTaskSuggestion | undefined =
      severity === 'info'
        ? undefined
        : {
            title: localised(language, { zh: '調整室內溫控', en: 'Adjust climate settings' }),
            description: localised(language, {
              zh: `調整冷暖氣或開啟風扇，讓室溫回到約 ${referenceSettings.targetTemperatureC.toFixed(1)}°C，並持續觀察 1 小時。`,
              en: `Tweak heating/cooling so the room nears ${referenceSettings.targetTemperatureC.toFixed(1)}°C and monitor for the next hour.`,
            }),
            category: 'environment',
            metadata: {
              variance: temperatureVariance,
              latest: temperatureStats.latest,
              target: referenceSettings.targetTemperatureC,
            },
            dueAt: hoursFromNow(severity === 'critical' ? 1 : 2),
            urgency: severity === 'critical' ? 'high' : 'medium',
          }
    insights.push(
      createInsight('environment', severity, title, summary, evidence, recommendations, followUpTask),
    )
  }

  const humidityStats = computeMetricStats(history, 'humidityPercent')
  const humidityVariance = describeVariance(
    humidityStats.latest,
    referenceSettings.targetHumidityPercent,
    4,
  )
  if (humidityVariance !== null) {
    const severity = classifySeverity(humidityVariance / 10, { warning: 0.6, critical: 1.2 })
    const title = localised(language, {
      zh: humidityVariance > 0 ? '濕度偏高' : '濕度偏低',
      en: humidityVariance > 0 ? 'Humidity trending high' : 'Humidity trending low',
    })
    const summary = localised(language, {
      zh: `目前濕度 ${humidityStats.latest ?? '—'}%，與目標 ${referenceSettings.targetHumidityPercent}% 差距 ${humidityVariance > 0 ? '+' : ''}${Math.abs(humidityVariance).toFixed(0)}%。`,
      en: `Humidity ${humidityStats.latest ?? '—'}% differs ${humidityVariance > 0 ? '+' : ''}${Math.abs(humidityVariance).toFixed(0)}% from the target ${referenceSettings.targetHumidityPercent}%.`,
    })
    const evidence = [
      buildEvidence(localised(language, { zh: '目前濕度', en: 'Current humidity' }), humidityStats, '%'),
    ]
    const recommendations = [
      localised(language, {
        zh: humidityVariance > 0 ? '啟動除濕、保持空氣流通，避免霉味。' : '開啟加濕器或放置濕毛巾，幫助改善乾燥。',
        en: humidityVariance > 0
          ? 'Run a dehumidifier and increase circulation to discourage mustiness.'
          : 'Add humidity with a humidifier or water bowls to ease dryness.',
      }),
    ]
    const followUpTask: CareTaskSuggestion | undefined =
      severity === 'info'
        ? undefined
        : {
            title: localised(language, { zh: '調整濕度', en: 'Balance humidity' }),
            description: localised(language, {
              zh: humidityVariance > 0
                ? '檢查除濕／空調設定，並短暫開窗換氣，觀察濕度是否回落。'
                : '補上加濕設備或放置兩碗溫水，半小時後再確認濕度。'
              ,
              en: humidityVariance > 0
                ? 'Review dehumidifier/AC settings and air out the room briefly, then recheck humidity.'
                : 'Run a humidifier or place two bowls of warm water and revisit levels in 30 minutes.',
            }),
            category: 'environment',
            metadata: {
              variance: humidityVariance,
              latest: humidityStats.latest,
              target: referenceSettings.targetHumidityPercent,
            },
            dueAt: hoursFromNow(severity === 'critical' ? 0.5 : 1),
            urgency: severity === 'critical' ? 'high' : 'medium',
          }
    insights.push(
      createInsight('environment', severity, title, summary, evidence, recommendations, followUpTask),
    )
  }

  const hydrationStats = computeMetricStats(history, 'hydrationTrend', 48)
  const weight = safeNumber(snapshot?.reading.catWeightKg)
  const suggestedMin = weight !== null ? Number((weight * 50).toFixed(0)) : null
  const suggestedMax = weight !== null ? Number((weight * 60).toFixed(0)) : null
  const hydrationLatest = hydrationStats.latest
  const hydrationLow =
    hydrationLatest !== null &&
    suggestedMin !== null &&
    hydrationLatest < suggestedMin * 0.75
  if (hydrationLow) {
    const severity: CareInsightSeverity =
      hydrationLatest <= suggestedMin * 0.5 ? 'critical' : 'warning'
    const title = localised(language, { zh: '飲水量顯著偏低', en: 'Water intake is trending low' })
    const summary = localised(language, {
      zh: `今日喝水 ${hydrationLatest}ml，低於建議下限 ${suggestedMin}ml。留意水碗是否清潔、易於接近。`,
      en: `Today’s water intake ${hydrationLatest} ml falls below the suggested minimum ${suggestedMin} ml. Ensure fresh, accessible water.`,
    })
    const evidence = [
      buildEvidence(
        localised(language, { zh: '今日飲水量', en: 'Today hydration' }),
        hydrationStats,
        'ml',
        suggestedMax
          ? localised(language, {
              zh: `建議範圍約 ${suggestedMin}-${suggestedMax}ml`,
              en: `Suggested range ~${suggestedMin}-${suggestedMax} ml`,
            })
          : undefined,
      ),
    ]
    const recommendations = [
      localised(language, {
        zh: '添滿乾淨的溫水，並在玩耍後溫柔引導牠喝水。', en: 'Offer fresh lukewarm water and gently encourage a sip after playtime.',
      }),
    ]
    const followUpTask: CareTaskSuggestion = {
      title: localised(language, { zh: '補水行程', en: 'Hydration routine' }),
      description: localised(language, {
        zh: '準備新鮮溫水，觀察牠在 30 分鐘內是否主動飲水，必要時以玩具引導。',
        en: 'Refresh the water bowl and check within 30 minutes if your cat drinks; encourage gently with play if needed.',
      }),
      category: 'hydration',
      metadata: {
        latest: hydrationLatest,
        suggestedMin,
      },
      dueAt: hoursFromNow(0.5),
      urgency: severity === 'critical' ? 'high' : 'medium',
    }
    insights.push(createInsight('hydration', severity, title, summary, evidence, recommendations, followUpTask))
  }

  const presenceTrend = computePresenceTrend(history, 12)
  if (presenceTrend.presencePercent !== null && presenceTrend.presencePercent < 45) {
    const severity: CareInsightSeverity =
      presenceTrend.longestAwayMinutes >= 240 ? 'warning' : 'info'
    const title = localised(language, { zh: '貓咪外出偏久', en: 'Cat has been away for long stretches' })
    const summary = localised(language, {
      zh: `最近 12 小時有 ${100 - presenceTrend.presencePercent}% 的時間不在家，最長連續外出 ${presenceTrend.longestAwayMinutes} 分鐘。`,
      en: `In the past 12 hours the cat was away ${100 - presenceTrend.presencePercent}% of the time, with the longest stretch reaching ${presenceTrend.longestAwayMinutes} minutes.`,
    })
    const evidence = [
      {
        metric: localised(language, { zh: '屋內停留比', en: 'Presence ratio' }),
        current: `${presenceTrend.presencePercent}%`,
        note: localised(language, {
          zh: `最長外出 ${presenceTrend.longestAwayMinutes} 分鐘`,
          en: `Longest away block ${presenceTrend.longestAwayMinutes} minutes`,
        }),
      },
    ]
    const recommendations = [
      localised(language, {
        zh: '預留舒適的返回路徑，並檢查是否有壓力來源。', en: 'Ensure a safe path home and check for potential stressors.',
      }),
    ]
    const followUpTask: CareTaskSuggestion | undefined =
      severity === 'info'
        ? undefined
        : {
            title: localised(language, { zh: '安排陪伴時段', en: 'Plan bonding check-in' }),
            description: localised(language, {
              zh: '安排 15 分鐘陪伴與逗貓，並在日誌記錄回家時間，觀察是否改善。', 
              en: 'Spend 15 minutes bonding/playing and note the return time to see if the pattern improves.',
            }),
            category: 'behavior',
            metadata: {
              presencePercent: presenceTrend.presencePercent,
              longestAwayMinutes: presenceTrend.longestAwayMinutes,
            },
            dueAt: hoursFromNow(4),
            urgency: severity === 'warning' ? 'medium' : 'low',
          }
    insights.push(createInsight('behavior', severity, title, summary, evidence, recommendations, followUpTask))
  }

  const brightnessStats = computeMetricStats(history, 'ambientLightPercent')
  if (brightnessStats.latest !== null && brightnessStats.latest < 20) {
    const title = localised(language, { zh: '光線不足', en: 'Low ambient light detected' })
    const summary = localised(language, {
      zh: `亮度 ${brightnessStats.latest}% 偏暗，建議在清潔或餵食時補足柔和光源。`,
      en: `Ambient light is at ${brightnessStats.latest}%—consider soft lighting for care routines.`,
    })
    const evidence = [
      buildEvidence(localised(language, { zh: '亮度', en: 'Brightness' }), brightnessStats, '%'),
    ]
    const recommendations = [
      localised(language, {
        zh: '開啟間接照明或拉開窗簾，讓環境更舒適。', en: 'Open curtains or add indirect lighting to keep the space inviting.',
      }),
    ]
    insights.push(createInsight('wellness', 'info', title, summary, evidence, recommendations))
  }

  const weightStats = computeMetricStats(history, 'catWeightKg', 72)
  const weightLatest = weightStats.latest
  const weightAverage = weightStats.average
  const weightDrop =
    weightLatest !== null &&
    weightAverage !== null &&
    weightLatest < weightAverage * 0.95 &&
    weightStats.samples >= 4
  if (weightDrop) {
    const severity: CareInsightSeverity = weightLatest < weightAverage * 0.9 ? 'critical' : 'warning'
    const title = localised(language, { zh: '體重有下降趨勢', en: 'Weight trending downward' })
    const summary = localised(language, {
      zh: `體重目前 ${weightLatest}kg，低於過去平均 ${weightAverage.toFixed(2)}kg，建議留意食慾。`,
      en: `Weight is ${weightLatest} kg, below the recent average ${weightAverage.toFixed(2)} kg. Monitor appetite.`,
    })
    const evidence = [
      buildEvidence(localised(language, { zh: '最新體重', en: 'Latest weight' }), weightStats, 'kg'),
    ]
    const recommendations = [
      localised(language, {
        zh: '觀察飲食與活動量，如持續下降建議諮詢獸醫。', en: 'Watch meals and activity; consult a vet if the drop continues.',
      }),
    ]
    const followUpTask: CareTaskSuggestion = {
      title: localised(language, { zh: '飲食紀錄追蹤', en: 'Log meals and weight' }),
      description: localised(language, {
        zh: '連續三餐記錄食量與進餐時間，必要時增添高水分零食，隔天再量體重。',
        en: 'Track the next three meals and mealtimes; add a hydrating treat if needed, then reweigh tomorrow.',
      }),
      category: 'nutrition',
      metadata: {
        latest: weightLatest,
        average: weightAverage,
        delta: weightStats.delta,
      },
      dueAt: hoursFromNow(24),
      urgency: severity === 'critical' ? 'high' : 'medium',
    }
    insights.push(createInsight('behavior', severity, title, summary, evidence, recommendations, followUpTask))
  }

  return insights
}

function segmentLabel(language: LanguageCode, period: BehaviorForecastSegment['period']): string {
  switch (period) {
    case 'morning':
      return localised(language, { zh: '早晨', en: 'Morning' })
    case 'afternoon':
      return localised(language, { zh: '午後', en: 'Afternoon' })
    case 'evening':
      return localised(language, { zh: '夜間', en: 'Evening' })
    case 'overnight':
      return localised(language, { zh: '深夜', en: 'Overnight' })
    default:
      return period
  }
}

function deriveSegmentFocus(
  language: LanguageCode,
  period: BehaviorForecastSegment['period'],
  summary: {
    presence: number | null
    hydration: number | null
  },
): { focus: string; tips: string[]; highlights: string[] } {
  const focusPieces: string[] = []
  const tips: string[] = []
  const highlights: string[] = []

  if (summary.presence !== null) {
    if (summary.presence < 40) {
      focusPieces.push(
        localised(language, {
          zh: '外出時間偏多', en: 'More time spent away',
        }),
      )
      tips.push(
        localised(language, {
          zh: '記得確認門窗安全，並保留誘導回家的聲音或氣味。',
          en: 'Double-check windows and leave a familiar scent/sound to guide them home.',
        }),
      )
    } else if (summary.presence > 70) {
      focusPieces.push(
        localised(language, {
          zh: '多在室內活動', en: 'Mostly indoor time',
        }),
      )
      tips.push(
        localised(language, {
          zh: '安排逗玩或跳台活動，舒展筋骨。', en: 'Schedule play or climbing time to keep them limber.',
        }),
      )
    }
    highlights.push(
      localised(language, {
        zh: `停留比約 ${summary.presence}%`, en: `Presence ~${summary.presence}%`,
      }),
    )
  }

  if (summary.hydration !== null) {
    highlights.push(
      localised(language, {
        zh: `近段飲水 ${summary.hydration}ml`, en: `Hydration ${summary.hydration} ml`,
      }),
    )
  }

  if (!focusPieces.length) {
    focusPieces.push(
      localised(language, {
        zh: '維持日常節奏', en: 'Keep the routine steady',
      }),
    )
  }

  if (!tips.length) {
    tips.push(
      localised(language, {
        zh: '保持穩定作息，完成餵食與清潔任務。', en: 'Keep routines consistent: meals, litter care, light play.',
      }),
    )
  }

  return {
    focus: focusPieces.join('、'),
    tips,
    highlights,
  }
}

export function deriveBehaviorForecast(
  language: LanguageCode,
  history: SmartHomeSnapshot[],
): BehaviorForecast {
  const now = new Date()
  const segments: Array<BehaviorForecastSegment['period']> = [
    'morning',
    'afternoon',
    'evening',
    'overnight',
  ]

  const metricsBySegment = new Map<
    BehaviorForecastSegment['period'],
    { presenceSamples: number[]; hydrationSamples: number[] }
  >()

  for (const period of segments) {
    metricsBySegment.set(period, { presenceSamples: [], hydrationSamples: [] })
  }

  for (const snapshot of history) {
    const ts = new Date(snapshot.reading.timestamp)
    if (!Number.isFinite(ts.getTime())) continue
    const hours = ts.getHours()
    let period: BehaviorForecastSegment['period']
    if (hours >= 5 && hours < 11) period = 'morning'
    else if (hours >= 11 && hours < 17) period = 'afternoon'
    else if (hours >= 17 && hours < 22) period = 'evening'
    else period = 'overnight'

    const bucket = metricsBySegment.get(period)
    if (!bucket) continue
    const present = snapshot.reading.catPresent ?? snapshot.reading.catWeightKg >= 1
    bucket.presenceSamples.push(present ? 1 : 0)
    const hydration = safeNumber(snapshot.reading.waterIntakeMl)
    if (hydration !== null) bucket.hydrationSamples.push(hydration)
  }

  const segmentSummaries = new Map<
    BehaviorForecastSegment['period'],
    { presence: number | null; hydration: number | null }
  >()
  for (const [period, bucket] of metricsBySegment.entries()) {
    const presence =
      bucket.presenceSamples.length > 0
        ? Math.round(
            (bucket.presenceSamples.reduce((sum, value) => sum + value, 0) / bucket.presenceSamples.length) * 100,
          )
        : null
    const hydration =
      bucket.hydrationSamples.length > 0
        ? Math.round(
            bucket.hydrationSamples.reduce((sum, value) => sum + value, 0) /
              bucket.hydrationSamples.length,
          )
        : null
    segmentSummaries.set(period, { presence, hydration })
  }

  const segmentsOutput: BehaviorForecastSegment[] = []
  let totalPresenceConfidence = 0

  for (const period of segments) {
    const summary = segmentSummaries.get(period) ?? { presence: null, hydration: null }
    const { focus, tips, highlights } = deriveSegmentFocus(language, period, summary)
    const samples = metricsBySegment.get(period)
    const confidence: BehaviorConfidence =
      samples && samples.presenceSamples.length >= 6 ? 'medium' : 'low'
    if (confidence === 'medium') totalPresenceConfidence += 1
    segmentsOutput.push({
      id: `segment-${period}`,
      period,
      label: segmentLabel(language, period),
      focus,
      tips,
      metricHighlights: highlights,
      confidence,
    })
  }

  const totalSegmentsWithConfidence = segmentsOutput.filter((segment) => segment.confidence !== 'low').length
  const overallConfidence: BehaviorConfidence =
    totalSegmentsWithConfidence >= 3 ? 'high' : totalSegmentsWithConfidence >= 2 ? 'medium' : 'low'

  const anomalies: string[] = []
  const recommendations: string[] = []

  const overnight = segmentSummaries.get('overnight')
  if (overnight && overnight.presence !== null && overnight.presence < 30) {
    anomalies.push(
      localised(language, {
        zh: '深夜回家比例偏低，記得確認門窗安全。', en: 'Overnight home presence is low—double-check entry points.',
      }),
    )
    recommendations.push(
      localised(language, {
        zh: '可在入睡前再次確認貓咪所在位置，並預留誘導聲音。', en: 'Before bedtime, locate the cat and leave familiar cues in case they roam.',
      }),
    )
  }

  const evening = segmentSummaries.get('evening')
  if (evening && evening.hydration !== null && evening.hydration < 120) {
    anomalies.push(
      localised(language, {
        zh: '夜間飲水偏少，可在玩耍後提供新鮮水。', en: 'Evening hydration is low—offer fresh water after play.',
      }),
    )
  }

  if (!anomalies.length) {
    anomalies.push(
      localised(language, {
        zh: '目前趨勢平穩，維持既有作息即可。', en: 'No anomalies detected—keep routines steady.',
      }),
    )
  }

  if (!recommendations.length) {
    recommendations.push(
      localised(language, {
        zh: '保持固定餵食與陪伴時段，完成玩耍與梳理任務。', en: 'Maintain consistent feeding, play, and grooming windows.',
      }),
    )
  }

  const summary = localised(language, {
    zh: `今天 ${now.getMonth() + 1}/${now.getDate()} 預期 ${segmentsOutput
      .map((segment) => `${segment.label}${segment.focus.includes('、') ? '：' : '：'}${segment.focus}`)
      .join('；')}。`,
    en: `For today (${now.getMonth() + 1}/${now.getDate()}), expect ${segmentsOutput
      .map((segment) => `${segment.label} focuses on ${segment.focus}`)
      .join('; ')}.`,
  })

  return {
    generatedAt: new Date().toISOString(),
    confidence: overallConfidence,
    summary,
    segments: segmentsOutput,
    anomalies,
    recommendations,
  }
}

export function suggestCareTasks(
  language: LanguageCode,
  snapshot: SmartHomeSnapshot | null,
  history: SmartHomeSnapshot[],
): CareTaskSuggestion[] {
  const suggestions: CareTaskSuggestion[] = []
  if (!snapshot) return suggestions

  const hydrationStats = computeMetricStats(history, 'hydrationTrend', 48)
  if (hydrationStats.latest !== null && hydrationStats.latest < 150) {
    suggestions.push({
      title: localised(language, { zh: '補水提醒', en: 'Hydration boost' }),
      description: localised(language, {
        zh: '添滿新鮮溫水，並在玩耍後陪牠喝一口。',
        en: 'Refresh lukewarm water and invite a sip after playtime.',
      }),
      category: 'hydration',
      metadata: {
        hydration: hydrationStats.latest,
      },
      dueAt: hoursFromNow(0.5),
      urgency: hydrationStats.latest < 100 ? 'high' : 'medium',
    })
  }

  const weightStats = computeMetricStats(history, 'catWeightKg', 72)
  if (weightStats.delta !== null && weightStats.delta < -0.15) {
    suggestions.push({
      title: localised(language, { zh: '記錄飲食狀況', en: 'Track appetite check-in' }),
      description: localised(language, {
        zh: '觀察最近幾餐的食量與進餐速度，必要時補餵小餐。',
        en: 'Log recent meals and pace; consider a small top-up feeding.',
      }),
      category: 'nutrition',
      metadata: { latestDeltaKg: weightStats.delta },
      dueAt: hoursFromNow(24),
      urgency: weightStats.delta < -0.3 ? 'high' : 'medium',
    })
  }

  const presenceTrend = computePresenceTrend(history, 12)
  if (presenceTrend.presencePercent !== null && presenceTrend.presencePercent < 50) {
    suggestions.push({
      title: localised(language, { zh: '安排陪伴時段', en: 'Plan bonding time' }),
      description: localised(language, {
        zh: '預留 15 分鐘輕鬆互動，幫助牠安心回家。',
        en: 'Block 15 minutes of gentle interaction to encourage coming home.',
      }),
      category: 'behavior',
      metadata: { presencePercent: presenceTrend.presencePercent },
      dueAt: hoursFromNow(6),
      urgency: presenceTrend.presencePercent < 30 ? 'high' : 'medium',
    })
  }

  if (!suggestions.length) {
    suggestions.push({
      title: localised(language, { zh: '日常巡檢', en: 'Daily routine check' }),
      description: localised(language, {
        zh: '確認水碗、飼料與貓砂盆乾淨，保持舒適空氣。',
        en: 'Confirm water, food, and litter freshness; keep air comfortable.',
      }),
      category: 'maintenance',
      dueAt: hoursFromNow(12),
      urgency: 'low',
    })
  }

  return suggestions
}

export function summarizeCalibrationAdjustment(
  language: LanguageCode,
  previous: CalibrationProfile | null,
  next: CalibrationProfile | null,
): string | null {
  if (!next) return null
  const changed: string[] = []
  const fields: Array<keyof CalibrationProfile> = [
    'fsrZero',
    'fsrScale',
    'waterLevelFullCm',
    'waterLevelEmptyCm',
    'ldrDark',
    'ldrBright',
    'catPresenceThresholdKg',
  ]

  for (const key of fields) {
    const before = previous?.[key]
    const after = next?.[key]
    if (typeof before === 'number' && typeof after === 'number') {
      if (Math.abs(before - after) < 0.0001) continue
      changed.push(
        localised(language, {
          zh: `${key} 從 ${before.toFixed(2)} 調整為 ${after.toFixed(2)}`,
          en: `${key} adjusted ${before.toFixed(2)} → ${after.toFixed(2)}`,
        }),
      )
    } else if (typeof after === 'number' && before === undefined) {
      changed.push(
        localised(language, {
          zh: `${key} 新增為 ${after.toFixed(2)}`,
          en: `${key} set to ${after.toFixed(2)}`,
        }),
      )
    } else if (before !== undefined && typeof after === 'undefined') {
      changed.push(
        localised(language, {
          zh: `${key} 移除（原值 ${before}）`,
          en: `${key} cleared (was ${before})`,
        }),
      )
    }
  }

  if (!changed.length) {
    return localised(language, {
      zh: '校正值與上次相同，維持原有感測對應。',
      en: 'Calibration remains the same; sensors keep previous mapping.',
    })
  }

  return localised(language, {
    zh: `校正更新完成：${changed.join('；')}。稍後感測資料會自動套用新參數。`,
    en: `Calibration refreshed: ${changed.join('; ')}. Upcoming readings will use the new factors.`,
  })
}
