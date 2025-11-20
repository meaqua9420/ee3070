import { loadHistorySince, loadBehaviorProfile as loadBehaviorProfileFromDb, saveBehaviorProfile } from './db'
import type { BehaviorProfile, BehaviorProfilePeriodSummary, BehaviorTrendDirection, LanguageCode, SmartHomeSnapshot } from './types'

const HOUR_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

export const BEHAVIOR_PROFILE_WINDOW_HOURS = 168 // 7 days
const PROFILE_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000 // refresh every 2 hours at most

type PeriodKey = BehaviorProfilePeriodSummary['period']

const PERIOD_LABELS: Record<PeriodKey, { zh: string; en: string; start: number; end: number }> = {
  morning: { zh: '早晨', en: 'Morning', start: 5, end: 11 },
  afternoon: { zh: '午後', en: 'Afternoon', start: 11, end: 17 },
  evening: { zh: '黃昏', en: 'Evening', start: 17, end: 22 },
  overnight: { zh: '深夜', en: 'Overnight', start: 22, end: 30 }, // 30 -> wrap to 6
}

const DEFAULT_ACTIVITY_NOTES = {
  zh: ['尚未累積足夠行為資料，請保持裝置連線以建立基準。'],
  en: ['Not enough behavior data yet—keep the device online to build a baseline.'],
}

const DEFAULT_RECOMMENDATIONS = {
  zh: ['維持固定餵食與玩耍節奏，有更多資料後會提供專屬建議。'],
  en: ['Maintain consistent feeding and play routines—we will tailor guidance once more data arrives.'],
}

interface AggregatedPeriod {
  period: PeriodKey
  totalSamples: number
  presentSamples: number
  hydrationSamples: number[]
  presentHourSum: number
  presentHourCount: number
}

interface HourStat {
  total: number
  present: number
}

function normaliseHours(hour: number): number {
  if (hour < 0) return ((hour % 24) + 24) % 24
  return hour % 24
}

function determinePeriod(hour: number): PeriodKey {
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'overnight'
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  const sum = values.reduce((acc, value) => acc + value, 0)
  return Number.isFinite(sum) ? Math.round((sum / values.length) * 100) / 100 : null
}

function computeHydrationTrend(history: SmartHomeSnapshot[], now: Date): {
  average: number | null
  change: number | null
  trend: BehaviorTrendDirection
} {
  const hydrationValues = history
    .map((snapshot) => {
      const value = snapshot.reading.waterIntakeMl
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
    })
    .filter((value): value is number => value !== null)

  const average = mean(hydrationValues) ?? null
  if (!hydrationValues.length) {
    return { average, change: null, trend: 'stable' }
  }

  const recentCutoff = now.getTime() - 24 * HOUR_MS
  const previousCutoff = now.getTime() - 48 * HOUR_MS
  const recentValues: number[] = []
  const previousValues: number[] = []

  for (const snapshot of history) {
    const ts = new Date(snapshot.reading.timestamp).getTime()
    if (!Number.isFinite(ts)) continue
    const value = snapshot.reading.waterIntakeMl
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue
    if (ts >= recentCutoff) {
      recentValues.push(value)
    } else if (ts >= previousCutoff) {
      previousValues.push(value)
    }
  }

  const recentAverage = mean(recentValues)
  const previousAverage = mean(previousValues)

  if (recentAverage === null || previousAverage === null) {
    return { average, change: null, trend: 'stable' }
  }

  const change = Number((recentAverage - previousAverage).toFixed(2))
  if (Math.abs(change) < 10) {
    return { average, change, trend: 'stable' }
  }
  return { average, change, trend: change > 0 ? 'rising' : 'falling' }
}

function computeStreaks(sortedHistory: SmartHomeSnapshot[]): { longestHome: number | null; longestAway: number | null } {
  if (sortedHistory.length === 0) {
    return { longestHome: null, longestAway: null }
  }
  let prevTimestamp: number | null = null
  let prevPresent: boolean | null = null
  let currentHome = 0
  let currentAway = 0
  let longestHome = 0
  let longestAway = 0

  for (const snapshot of sortedHistory) {
    const timestamp = new Date(snapshot.reading.timestamp).getTime()
    if (!Number.isFinite(timestamp)) continue
    const present = snapshot.reading.catPresent ?? snapshot.reading.catWeightKg >= 1

    if (prevTimestamp !== null && prevPresent !== null) {
      const diffMinutes = Math.max(1, Math.round((timestamp - prevTimestamp) / MINUTE_MS))
      if (prevPresent) {
        currentHome += diffMinutes
        longestHome = Math.max(longestHome, currentHome)
        currentAway = 0
      } else {
        currentAway += diffMinutes
        longestAway = Math.max(longestAway, currentAway)
        currentHome = 0
      }
    }

    prevTimestamp = timestamp
    prevPresent = present
  }

  return {
    longestHome: longestHome > 0 ? longestHome : null,
    longestAway: longestAway > 0 ? longestAway : null,
  }
}

function computeHourStats(history: SmartHomeSnapshot[]): HourStat[] {
  const hours: HourStat[] = Array.from({ length: 24 }, () => ({ total: 0, present: 0 }))
  for (const snapshot of history) {
    const timestamp = new Date(snapshot.reading.timestamp)
    if (Number.isNaN(timestamp.getTime())) continue
    const hour = timestamp.getHours()
    const bucket = hours[hour]
    if (!bucket) {
      continue
    }
    bucket.total += 1
    const present = snapshot.reading.catPresent ?? snapshot.reading.catWeightKg >= 1
    if (present) {
      bucket.present += 1
    }
  }
  return hours
}

function computeQuietRanges(hourStats: HourStat[]): Array<{ startHour: number; endHour: number }> {
  const quietRanges: Array<{ startHour: number; endHour: number }> = []
  let rangeStart: number | null = null

  for (let hour = 0; hour < hourStats.length; hour += 1) {
    const stats = hourStats[hour]
    if (!stats) {
      continue
    }
    const presenceRatio = stats.total > 0 ? stats.present / stats.total : 0
    if (presenceRatio <= 0.2 && stats.total >= 3) {
      if (rangeStart === null) {
        rangeStart = hour
      }
    } else if (rangeStart !== null) {
      quietRanges.push({ startHour: rangeStart, endHour: hour })
      rangeStart = null
    }
  }

  if (rangeStart !== null) {
    quietRanges.push({ startHour: rangeStart, endHour: 24 })
  }

  return quietRanges
}

function computePeriodBuckets(history: SmartHomeSnapshot[]): Map<PeriodKey, AggregatedPeriod> {
  const buckets = new Map<PeriodKey, AggregatedPeriod>()
  ;(['morning', 'afternoon', 'evening', 'overnight'] as PeriodKey[]).forEach((period) => {
    buckets.set(period, {
      period,
      totalSamples: 0,
      presentSamples: 0,
      hydrationSamples: [],
      presentHourSum: 0,
      presentHourCount: 0,
    })
  })

  for (const snapshot of history) {
    const timestamp = new Date(snapshot.reading.timestamp)
    if (Number.isNaN(timestamp.getTime())) continue
    const hour = timestamp.getHours()
    const minute = timestamp.getMinutes()
    const fractionalHour = hour + minute / 60
    const period = determinePeriod(hour)
    const bucket = buckets.get(period)
    if (!bucket) continue
    bucket.totalSamples += 1
    const present = snapshot.reading.catPresent ?? snapshot.reading.catWeightKg >= 1
    if (present) {
      bucket.presentSamples += 1
      bucket.presentHourSum += fractionalHour
      bucket.presentHourCount += 1
    }
    const hydration = snapshot.reading.waterIntakeMl
    if (typeof hydration === 'number' && Number.isFinite(hydration) && hydration >= 0) {
      bucket.hydrationSamples.push(hydration)
    }
  }

  return buckets
}

function pickPeakPeriods(buckets: Map<PeriodKey, AggregatedPeriod>): BehaviorProfilePeriodSummary[] {
  const summaries: BehaviorProfilePeriodSummary[] = []
  for (const bucket of buckets.values()) {
    const presencePercent =
      bucket.totalSamples > 0 ? Math.round((bucket.presentSamples / bucket.totalSamples) * 100) : null
    const hydrationMl = mean(bucket.hydrationSamples)
    const averageHour =
      bucket.presentHourCount > 0 ? Math.round((bucket.presentHourSum / bucket.presentHourCount) * 10) / 10 : null
    summaries.push({
      period: bucket.period,
      presencePercent,
      hydrationMl,
      sampleCount: bucket.totalSamples,
      averageStartHour: averageHour,
      averageEndHour: averageHour !== null ? normaliseHours(Math.round((averageHour + 1.5) * 10) / 10) : null,
    })
  }

  summaries.sort((a, b) => {
    const scoreA = a.presencePercent ?? -1
    const scoreB = b.presencePercent ?? -1
    return scoreB - scoreA
  })

  return summaries
}

function computeConfidence(sampleCount: number): BehaviorProfile['confidence'] {
  if (sampleCount >= 220) return 'high'
  if (sampleCount >= 120) return 'medium'
  return 'low'
}

function buildNotes(profile: BehaviorProfile, windowHours: number) {
  const days = Math.round(windowHours / 24)
  const notes = {
    zh: [] as string[],
    en: [] as string[],
  }
  const tips = {
    zh: [] as string[],
    en: [] as string[],
  }

  if (profile.presencePercent !== null) {
    notes.zh.push(`近 ${days} 天在家停留率約 ${profile.presencePercent}%`)
    notes.en.push(`Indoor presence over the last ${days} days sits around ${profile.presencePercent}%.`)
  }

  if (profile.longestAwayMinutes !== null && profile.longestAwayMinutes >= 60) {
    const hours = Math.round(profile.longestAwayMinutes / 60)
    notes.zh.push(`曾連續外出約 ${hours} 小時`)
    notes.en.push(`Observed a continuous away stretch of roughly ${hours} hours.`)
  }

  const topPeriod = profile.peakPeriods[0]
  if (topPeriod && topPeriod.presencePercent !== null) {
    const label = PERIOD_LABELS[topPeriod.period]
    notes.zh.push(`${label.zh} 停留率最高（約 ${topPeriod.presencePercent}%）`)
    notes.en.push(`${label.en} shows the highest indoor presence (~${topPeriod.presencePercent}%).`)
    tips.zh.push(`可在${label.zh}安排陪玩或餵食儀式，強化安全感。`)
    tips.en.push(`Schedule bonding or feeding rituals in the ${label.en.toLowerCase()} to reinforce security.`)
  }

  if (profile.hydrationAverageMl !== null) {
    const hydrationTextZh = `平均每日飲水約 ${Math.round(profile.hydrationAverageMl)} ml`
    const hydrationTextEn = `Average daily hydration sits near ${Math.round(profile.hydrationAverageMl)} ml.`
    notes.zh.push(hydrationTextZh)
    notes.en.push(hydrationTextEn)
  }

  if (profile.hydrationTrend === 'falling' && profile.hydrationChangeMl !== null) {
    const delta = Math.abs(Math.round(profile.hydrationChangeMl))
    tips.zh.push(`飲水量下降約 ${delta} ml，可於遊戲後提供溫水增添誘因。`)
    tips.en.push(`Hydration dipped by ~${delta} ml; offer lukewarm water after play to encourage drinking.`)
  } else if (profile.hydrationTrend === 'rising' && profile.hydrationChangeMl !== null) {
    const delta = Math.abs(Math.round(profile.hydrationChangeMl))
    notes.zh.push(`飲水量上升約 ${delta} ml，維持目前的補水節奏。`)
    notes.en.push(`Hydration increased about ${delta} ml—keep up the current routine.`)
  }

  if (profile.quietHours.length > 0) {
    const quiet = profile.quietHours
      .map((range) => {
        const start = range.startHour
        const end = range.endHour === 24 ? 0 : range.endHour
        return start === end
          ? `${start}:00`
          : `${start}:00-${end === 0 ? '24' : end}:00`
      })
      .join('、')
    notes.zh.push(`相對安靜時段：${quiet}`)
    notes.en.push(`Quiet hours cluster around: ${quiet.replace(/、/g, ', ')}.`)
  }

  if (!tips.zh.length && !tips.en.length) {
    tips.zh.push('維持固定陪伴時段，適度提供解謎玩具與抓板。')
    tips.en.push('Maintain consistent bonding sessions and offer enrichment toys regularly.')
  }

  return { notes, tips }
}

function computeBehaviorProfileFromHistory(catId: string, history: SmartHomeSnapshot[], windowHours: number, now: Date): BehaviorProfile {
  const sortedHistory = [...history].sort((a, b) => {
    const t1 = new Date(a.reading.timestamp).getTime()
    const t2 = new Date(b.reading.timestamp).getTime()
    return t1 - t2
  })
  const totalSamples = history.length
  const presentSamples = history.filter((snapshot) => snapshot.reading.catPresent ?? snapshot.reading.catWeightKg >= 1).length

  const presencePercent =
    totalSamples > 0 ? Math.round((presentSamples / totalSamples) * 100) : null

  const streaks = computeStreaks(sortedHistory)
  const { average: hydrationAverage, change: hydrationChange, trend: hydrationTrend } = computeHydrationTrend(history, now)
  const periodBuckets = computePeriodBuckets(history)
  const peakPeriods = pickPeakPeriods(periodBuckets)
  const hourStats = computeHourStats(history)
  const quietHours = computeQuietRanges(hourStats)
  const confidence = computeConfidence(totalSamples)
  const { notes, tips } = buildNotes(
    {
      catId,
      windowHours,
      sampleCount: totalSamples,
      updatedAt: now.toISOString(),
      confidence,
      presencePercent,
      longestHomeMinutes: streaks.longestHome,
      longestAwayMinutes: streaks.longestAway,
      hydrationAverageMl: hydrationAverage,
      hydrationTrend,
      hydrationChangeMl: hydrationChange,
      peakPeriods,
      quietHours,
      activityNotes: DEFAULT_ACTIVITY_NOTES,
      careRecommendations: DEFAULT_RECOMMENDATIONS,
    },
    windowHours,
  )

  const activityNotes = {
    zh: notes.zh.length ? notes.zh : [...DEFAULT_ACTIVITY_NOTES.zh],
    en: notes.en.length ? notes.en : [...DEFAULT_ACTIVITY_NOTES.en],
  }
  const careRecommendations = {
    zh: tips.zh.length ? tips.zh : [...DEFAULT_RECOMMENDATIONS.zh],
    en: tips.en.length ? tips.en : [...DEFAULT_RECOMMENDATIONS.en],
  }

  return {
    catId,
    windowHours,
    sampleCount: totalSamples,
    updatedAt: now.toISOString(),
    confidence,
    presencePercent,
    longestHomeMinutes: streaks.longestHome,
    longestAwayMinutes: streaks.longestAway,
    hydrationAverageMl: hydrationAverage,
    hydrationTrend,
    hydrationChangeMl: hydrationChange,
    peakPeriods,
    quietHours,
    activityNotes,
    careRecommendations,
  }
}

export function refreshBehaviorProfile(catId: string, now: Date = new Date()): BehaviorProfile | null {
  const since = new Date(now.getTime() - BEHAVIOR_PROFILE_WINDOW_HOURS * HOUR_MS).toISOString()
  const history = loadHistorySince(since, catId)
  if (history.length === 0) {
    return null
  }
  const profile = computeBehaviorProfileFromHistory(catId, history, BEHAVIOR_PROFILE_WINDOW_HOURS, now)
  saveBehaviorProfile(profile)
  return profile
}

export function loadBehaviorProfile(catId: string): BehaviorProfile | null {
  return loadBehaviorProfileFromDb(catId)
}

export function ensureBehaviorProfile(catId: string, now: Date = new Date()): BehaviorProfile | null {
  const existing = loadBehaviorProfile(catId)
  if (!existing) {
    return refreshBehaviorProfile(catId, now)
  }
  const updatedAt = new Date(existing.updatedAt).getTime()
  if (!Number.isFinite(updatedAt)) {
    return refreshBehaviorProfile(catId, now) ?? existing
  }
  const age = now.getTime() - updatedAt
  if (age > PROFILE_REFRESH_INTERVAL_MS) {
    return refreshBehaviorProfile(catId, now) ?? existing
  }
  return existing
}

export function formatBehaviorProfileForPrompt(profile: BehaviorProfile, language: LanguageCode): string {
  const isZh = language === 'zh'
  const days = Math.round(profile.windowHours / 24)
  const presenceText =
    profile.presencePercent !== null
      ? isZh
        ? `近 ${days} 天在家停留率約 ${profile.presencePercent}%`
        : `Indoor presence over ${days} days is about ${profile.presencePercent}%.`
      : isZh
        ? `近 ${days} 天缺少足夠的室內/外活動資料`
        : `Limited presence data in the last ${days} days.`

  const topPeriod = profile.peakPeriods[0]
  const periodText =
    topPeriod && topPeriod.presencePercent !== null
      ? (() => {
          const label = PERIOD_LABELS[topPeriod.period]
          if (isZh) {
            return `${label.zh} 最常在家（約 ${topPeriod.presencePercent}%），樣本 ${topPeriod.sampleCount} 筆`
          }
          return `${label.en} shows the highest indoor rate (~${topPeriod.presencePercent}% across ${topPeriod.sampleCount} samples).`
        })()
      : isZh
        ? '尚未辨識出明顯的活躍時段'
        : 'No dominant active period detected yet.'

  let hydrationText: string
  if (profile.hydrationAverageMl !== null) {
    const avg = Math.round(profile.hydrationAverageMl)
    const trend =
      profile.hydrationTrend === 'rising'
        ? isZh
          ? '、飲水略為上升'
          : ', trending upward'
        : profile.hydrationTrend === 'falling'
          ? isZh
            ? '、飲水略為下降'
            : ', trending downward'
          : ''
    hydrationText = isZh ? `平均每日飲水約 ${avg} ml${trend}` : `Average hydration roughly ${avg} ml${trend}.`
  } else {
    hydrationText = isZh ? '飲水資料不足' : 'Hydration data is limited.'
  }

  const quietSegments = profile.quietHours
    .map((segment) => {
      const start = segment.startHour
      const end = segment.endHour === 24 ? 0 : segment.endHour
      const formatted = end === 0 ? `${start}:00-24:00` : `${start}:00-${end}:00`
      return formatted
    })
    .slice(0, 2)
  const quietText =
    quietSegments.length > 0
      ? isZh
        ? `安靜時段多在 ${quietSegments.join('、')}`
        : `Quiet windows cluster around ${quietSegments.join(', ')}.`
      : ''

  return [presenceText, periodText, hydrationText, quietText].filter(Boolean).join(isZh ? '；' : ' ')
}
