// 主動助理系統 - 定期檢查並生成主動建議
import { getDb } from './db.js'
import type { SmartHomeSnapshot } from './types.js'

export type InsightPriority = 'low' | 'medium' | 'high' | 'critical'
export type InsightCategory = 'hydration' | 'nutrition' | 'environment' | 'activity' | 'health' | 'maintenance'

export interface ProactiveInsight {
  id: string
  category: InsightCategory
  priority: InsightPriority
  title: string
  message: string
  recommendation: string[]
  relatedData?: {
    current?: number
    normal?: number
    threshold?: number
    unit?: string
  }
  catId?: string
  createdAt: Date
  expiresAt?: Date  // 自動過期時間
  dismissed: boolean
}

export interface InsightCheckResult {
  insights: ProactiveInsight[]
  totalGenerated: number
  highPriorityCount: number
}

// 檢查配置
const CHECK_CONFIG = {
  // 飲水量閾值 (ml)
  WATER_INTAKE_MIN_PER_DAY: 200,      // 每天最低飲水量
  WATER_INTAKE_WARNING_RATIO: 0.6,   // 低於正常值的 60% 發出警告

  // 溫濕度閾值
  TEMPERATURE_MIN: 18,
  TEMPERATURE_MAX: 28,
  TEMPERATURE_OPTIMAL_MIN: 20,
  TEMPERATURE_OPTIMAL_MAX: 26,

  HUMIDITY_MIN: 40,
  HUMIDITY_MAX: 70,
  HUMIDITY_OPTIMAL_MIN: 50,
  HUMIDITY_OPTIMAL_MAX: 60,

  // 活動檢測 (分鐘)
  NO_ACTIVITY_WARNING_MINUTES: 360,   // 6 小時無活動
  NO_ACTIVITY_CRITICAL_MINUTES: 720,  // 12 小時無活動

  // 檢查間隔 (毫秒)
  CHECK_INTERVAL_MS: 15 * 60 * 1000,  // 15 分鐘
}

// 檢查所有主動洞察
export async function checkProactiveInsights(catId?: string): Promise<InsightCheckResult> {
  const insights: ProactiveInsight[] = []

  // 1. 檢查飲水量
  const hydrationInsights = await checkHydration(catId)
  insights.push(...hydrationInsights)

  // 2. 檢查環境
  const environmentInsights = await checkEnvironment(catId)
  insights.push(...environmentInsights)

  // 3. 檢查活動
  const activityInsights = await checkActivity(catId)
  insights.push(...activityInsights)

  // 4. 檢查維護
  const maintenanceInsights = await checkMaintenance(catId)
  insights.push(...maintenanceInsights)

  const highPriorityCount = insights.filter(i => i.priority === 'high' || i.priority === 'critical').length

  return {
    insights,
    totalGenerated: insights.length,
    highPriorityCount
  }
}

// 檢查飲水量
async function checkHydration(catId?: string): Promise<ProactiveInsight[]> {
  const db = getDb()
  const insights: ProactiveInsight[] = []

  // 獲取最近 24 小時的飲水數據
  const oneDayAgo = new Date()
  oneDayAgo.setHours(oneDayAgo.getHours() - 24)

  const snapshots = db.prepare(`
    SELECT snapshot_json FROM snapshots
    WHERE timestamp >= ?
    ORDER BY timestamp DESC
  `).all(oneDayAgo.toISOString()) as Array<{ snapshot_json: string }>

  if (snapshots.length === 0) return insights

  // 計算飲水量
  let totalWaterIntake = 0
  let validReadings = 0

  for (const row of snapshots) {
    try {
      const snapshot: SmartHomeSnapshot = JSON.parse(row.snapshot_json)
      if (snapshot.waterIntakeMl && snapshot.waterIntakeMl > 0) {
        totalWaterIntake += snapshot.waterIntakeMl
        validReadings++
      }
    } catch (e) {
      // 忽略解析錯誤
    }
  }

  if (validReadings > 0) {
    // 計算平均值
    const avgWaterIntake = totalWaterIntake / validReadings

    // 獲取歷史平均 (最近 7 天)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const historicalSnapshots = db.prepare(`
      SELECT snapshot_json FROM snapshots
      WHERE timestamp >= ? AND timestamp < ?
      ORDER BY timestamp DESC
      LIMIT 1000
    `).all(sevenDaysAgo.toISOString(), oneDayAgo.toISOString()) as Array<{ snapshot_json: string }>

    let historicalTotal = 0
    let historicalCount = 0

    for (const row of historicalSnapshots) {
      try {
        const snapshot: SmartHomeSnapshot = JSON.parse(row.snapshot_json)
        if (snapshot.waterIntakeMl && snapshot.waterIntakeMl > 0) {
          historicalTotal += snapshot.waterIntakeMl
          historicalCount++
        }
      } catch (e) {
        // 忽略
      }
    }

    const normalIntake = historicalCount > 0 ? historicalTotal / historicalCount : CONFIG_CONFIG.WATER_INTAKE_MIN_PER_DAY

    // 檢查是否過低
    if (avgWaterIntake < normalIntake * CHECK_CONFIG.WATER_INTAKE_WARNING_RATIO) {
      const priority = avgWaterIntake < CHECK_CONFIG.WATER_INTAKE_MIN_PER_DAY ? 'high' : 'medium'

      insights.push({
        id: generateInsightId(),
        category: 'hydration',
        priority,
        title: '飲水量偏低',
        message: `過去 24 小時的平均飲水量 (${avgWaterIntake.toFixed(1)} ml) 低於正常水平 (${normalIntake.toFixed(1)} ml)`,
        recommendation: [
          '檢查水碗是否有新鮮的水',
          '嘗試更換水的位置或容器',
          '考慮增加濕糧比例',
          '如果持續,建議諮詢獸醫'
        ],
        relatedData: {
          current: avgWaterIntake,
          normal: normalIntake,
          threshold: normalIntake * CHECK_CONFIG.WATER_INTAKE_WARNING_RATIO,
          unit: 'ml'
        },
        catId,
        createdAt: new Date(),
        expiresAt: addHours(new Date(), 6),
        dismissed: false
      })
    }
  }

  return insights
}

// 檢查環境
async function checkEnvironment(catId?: string): Promise<ProactiveInsight[]> {
  const db = getDb()
  const insights: ProactiveInsight[] = []

  // 獲取最新快照
  const latestRow = db.prepare(`
    SELECT snapshot_json FROM snapshots
    ORDER BY timestamp DESC
    LIMIT 1
  `).get() as { snapshot_json: string } | undefined

  if (!latestRow) return insights

  try {
    const snapshot: SmartHomeSnapshot = JSON.parse(latestRow.snapshot_json)

    // 檢查溫度
    if (snapshot.temperature !== undefined) {
      if (snapshot.temperature > CHECK_CONFIG.TEMPERATURE_MAX) {
        insights.push({
          id: generateInsightId(),
          category: 'environment',
          priority: 'high',
          title: '室溫過高',
          message: `當前溫度 ${snapshot.temperature.toFixed(1)}°C 超過建議範圍 (${CHECK_CONFIG.TEMPERATURE_MAX}°C)`,
          recommendation: [
            '開啟空調或風扇',
            '確保貓咪有陰涼的休息區域',
            '提供充足的飲水',
            '避免劇烈運動'
          ],
          relatedData: {
            current: snapshot.temperature,
            threshold: CHECK_CONFIG.TEMPERATURE_MAX,
            unit: '°C'
          },
          catId,
          createdAt: new Date(),
          expiresAt: addHours(new Date(), 2),
          dismissed: false
        })
      } else if (snapshot.temperature < CHECK_CONFIG.TEMPERATURE_MIN) {
        insights.push({
          id: generateInsightId(),
          category: 'environment',
          priority: 'medium',
          title: '室溫過低',
          message: `當前溫度 ${snapshot.temperature.toFixed(1)}°C 低於建議範圍 (${CHECK_CONFIG.TEMPERATURE_MIN}°C)`,
          recommendation: [
            '開啟暖氣或電暖器',
            '提供溫暖的睡墊或毯子',
            '確保貓咪不會待在冷風吹拂的地方'
          ],
          relatedData: {
            current: snapshot.temperature,
            threshold: CHECK_CONFIG.TEMPERATURE_MIN,
            unit: '°C'
          },
          catId,
          createdAt: new Date(),
          expiresAt: addHours(new Date(), 2),
          dismissed: false
        })
      }
    }

    // 檢查濕度
    if (snapshot.humidity !== undefined) {
      if (snapshot.humidity > CHECK_CONFIG.HUMIDITY_MAX) {
        insights.push({
          id: generateInsightId(),
          category: 'environment',
          priority: 'medium',
          title: '濕度過高',
          message: `當前濕度 ${snapshot.humidity.toFixed(0)}% 超過建議範圍 (${CHECK_CONFIG.HUMIDITY_MAX}%)`,
          recommendation: [
            '開啟除濕機',
            '增加通風',
            '注意防止黴菌滋生'
          ],
          relatedData: {
            current: snapshot.humidity,
            threshold: CHECK_CONFIG.HUMIDITY_MAX,
            unit: '%'
          },
          catId,
          createdAt: new Date(),
          expiresAt: addHours(new Date(), 3),
          dismissed: false
        })
      } else if (snapshot.humidity < CHECK_CONFIG.HUMIDITY_MIN) {
        insights.push({
          id: generateInsightId(),
          category: 'environment',
          priority: 'low',
          title: '濕度過低',
          message: `當前濕度 ${snapshot.humidity.toFixed(0)}% 低於建議範圍 (${CHECK_CONFIG.HUMIDITY_MIN}%)`,
          recommendation: [
            '使用加濕器',
            '在室內放置水盆',
            '乾燥環境可能影響貓咪呼吸道'
          ],
          relatedData: {
            current: snapshot.humidity,
            threshold: CHECK_CONFIG.HUMIDITY_MIN,
            unit: '%'
          },
          catId,
          createdAt: new Date(),
          expiresAt: addHours(new Date(), 3),
          dismissed: false
        })
      }
    }

    // 檢查水位
    if (snapshot.waterLevel !== undefined && snapshot.waterLevel < 20) {
      insights.push({
        id: generateInsightId(),
        category: 'maintenance',
        priority: snapshot.waterLevel < 10 ? 'high' : 'medium',
        title: '水位過低',
        message: `水碗水位僅剩 ${snapshot.waterLevel.toFixed(0)}%`,
        recommendation: [
          '立即添加新鮮的水',
          '清洗水碗',
          '考慮使用自動飲水機'
        ],
        relatedData: {
          current: snapshot.waterLevel,
          threshold: 20,
          unit: '%'
        },
        catId,
        createdAt: new Date(),
        expiresAt: addHours(new Date(), 1),
        dismissed: false
      })
    }
  } catch (e) {
    console.error('[proactive] Failed to parse snapshot:', e)
  }

  return insights
}

// 檢查活動
async function checkActivity(catId?: string): Promise<ProactiveInsight[]> {
  const db = getDb()
  const insights: ProactiveInsight[] = []

  // 獲取最近的貓咪存在記錄
  const recentSnapshots = db.prepare(`
    SELECT snapshot_json, timestamp FROM snapshots
    ORDER BY timestamp DESC
    LIMIT 100
  `).all() as Array<{ snapshot_json: string; timestamp: string }>

  let lastActivityTime: Date | null = null

  for (const row of recentSnapshots) {
    try {
      const snapshot: SmartHomeSnapshot = JSON.parse(row.snapshot_json)
      if (snapshot.catPresent) {
        lastActivityTime = new Date(row.timestamp)
        break
      }
    } catch (e) {
      // 忽略
    }
  }

  if (lastActivityTime) {
    const minutesSinceActivity = (Date.now() - lastActivityTime.getTime()) / (1000 * 60)

    if (minutesSinceActivity > CHECK_CONFIG.NO_ACTIVITY_CRITICAL_MINUTES) {
      insights.push({
        id: generateInsightId(),
        category: 'activity',
        priority: 'critical',
        title: '長時間無活動記錄',
        message: `已經超過 ${Math.floor(minutesSinceActivity / 60)} 小時沒有檢測到貓咪活動`,
        recommendation: [
          '立即檢查貓咪是否安全',
          '確認貓咪的位置',
          '檢查是否有受傷或生病跡象',
          '考慮聯繫獸醫'
        ],
        relatedData: {
          current: minutesSinceActivity,
          threshold: CHECK_CONFIG.NO_ACTIVITY_CRITICAL_MINUTES,
          unit: '分鐘'
        },
        catId,
        createdAt: new Date(),
        dismissed: false
      })
    } else if (minutesSinceActivity > CHECK_CONFIG.NO_ACTIVITY_WARNING_MINUTES) {
      insights.push({
        id: generateInsightId(),
        category: 'activity',
        priority: 'medium',
        title: '活動量減少',
        message: `已經 ${Math.floor(minutesSinceActivity / 60)} 小時沒有檢測到貓咪活動`,
        recommendation: [
          '檢查貓咪是否在睡覺',
          '確認貓咪的狀態',
          '如果異常嗜睡,可能需要關注'
        ],
        relatedData: {
          current: minutesSinceActivity,
          threshold: CHECK_CONFIG.NO_ACTIVITY_WARNING_MINUTES,
          unit: '分鐘'
        },
        catId,
        createdAt: new Date(),
        expiresAt: addHours(new Date(), 2),
        dismissed: false
      })
    }
  }

  return insights
}

// 檢查維護
async function checkMaintenance(catId?: string): Promise<ProactiveInsight[]> {
  const db = getDb()
  const insights: ProactiveInsight[] = []

  // 檢查校正歷史
  const lastCalibration = db.prepare(`
    SELECT created_at FROM calibration_history
    ORDER BY created_at DESC
    LIMIT 1
  `).get() as { created_at: string } | undefined

  if (lastCalibration) {
    const daysSinceCalibration = (Date.now() - new Date(lastCalibration.created_at).getTime()) / (1000 * 60 * 60 * 24)

    if (daysSinceCalibration > 30) {
      insights.push({
        id: generateInsightId(),
        category: 'maintenance',
        priority: 'low',
        title: '建議重新校正感測器',
        message: `上次校正是 ${Math.floor(daysSinceCalibration)} 天前`,
        recommendation: [
          '定期校正可確保數據準確',
          '在設定中進行感測器校正',
          '建議每月校正一次'
        ],
        catId,
        createdAt: new Date(),
        expiresAt: addDays(new Date(), 7),
        dismissed: false
      })
    }
  }

  return insights
}

// 儲存洞察到資料庫
export function saveInsight(insight: ProactiveInsight): void {
  const db = getDb()

  db.prepare(`
    INSERT INTO proactive_insights (
      id, category, priority, title, message, recommendation,
      related_data, cat_id, created_at, expires_at, dismissed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    insight.id,
    insight.category,
    insight.priority,
    insight.title,
    insight.message,
    JSON.stringify(insight.recommendation),
    insight.relatedData ? JSON.stringify(insight.relatedData) : null,
    insight.catId || null,
    insight.createdAt.toISOString(),
    insight.expiresAt ? insight.expiresAt.toISOString() : null,
    insight.dismissed ? 1 : 0
  )
}

// 取得活躍的洞察
export function getActiveInsights(catId?: string): ProactiveInsight[] {
  const db = getDb()

  let sql = `
    SELECT * FROM proactive_insights
    WHERE dismissed = 0
      AND (expires_at IS NULL OR expires_at > ?)
  `
  const params: any[] = [new Date().toISOString()]

  if (catId) {
    sql += ` AND (cat_id = ? OR cat_id IS NULL)`
    params.push(catId)
  }

  sql += ` ORDER BY
    CASE priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END,
    created_at DESC
  `

  const rows = db.prepare(sql).all(...params) as any[]

  return rows.map(parseInsightRow)
}

// 標記為已讀
export function dismissInsight(id: string): void {
  const db = getDb()
  db.prepare('UPDATE proactive_insights SET dismissed = 1 WHERE id = ?').run(id)
}

// 清理過期洞察
export function cleanupExpiredInsights(): number {
  const db = getDb()
  const result = db.prepare(`
    DELETE FROM proactive_insights
    WHERE expires_at IS NOT NULL AND expires_at < ?
  `).run(new Date().toISOString())

  return result.changes
}

// 輔助函數
function generateInsightId(): string {
  return `insight_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function addHours(date: Date, hours: number): Date {
  const result = new Date(date)
  result.setHours(result.getHours() + hours)
  return result
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function parseInsightRow(row: any): ProactiveInsight {
  return {
    id: row.id,
    category: row.category,
    priority: row.priority,
    title: row.title,
    message: row.message,
    recommendation: JSON.parse(row.recommendation),
    relatedData: row.related_data ? JSON.parse(row.related_data) : undefined,
    catId: row.cat_id,
    createdAt: new Date(row.created_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    dismissed: row.dismissed === 1
  }
}

// 定期檢查任務 (可在 index.ts 中啟動)
let checkInterval: NodeJS.Timeout | null = null

export function startProactiveAssistant(intervalMs: number = CHECK_CONFIG.CHECK_INTERVAL_MS): void {
  if (checkInterval) {
    console.log('[proactive] Assistant already running')
    return
  }

  console.log(`[proactive] Starting assistant (checking every ${intervalMs / 1000 / 60} minutes)`)

  // 立即執行一次
  runCheck()

  // 定期執行
  checkInterval = setInterval(runCheck, intervalMs)
}

export function stopProactiveAssistant(): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
    console.log('[proactive] Assistant stopped')
  }
}

async function runCheck(): Promise<void> {
  try {
    const result = await checkProactiveInsights()

    // 儲存新洞察
    for (const insight of result.insights) {
      // 檢查是否已存在類似的洞察 (去重)
      const existing = getActiveInsights(insight.catId).find(
        i => i.category === insight.category && i.title === insight.title
      )

      if (!existing) {
        saveInsight(insight)
        console.log(`[proactive] New insight: ${insight.title} (${insight.priority})`)
      }
    }

    // 清理過期
    const cleaned = cleanupExpiredInsights()
    if (cleaned > 0) {
      console.log(`[proactive] Cleaned ${cleaned} expired insights`)
    }

    if (result.highPriorityCount > 0) {
      console.log(`[proactive] ⚠️ ${result.highPriorityCount} high priority insights`)
    }
  } catch (error) {
    console.error('[proactive] Check failed:', error)
  }
}
