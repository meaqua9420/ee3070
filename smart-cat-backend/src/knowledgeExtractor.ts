// 智能知識提取器 - 從對話中自動提取關鍵資訊
import { getDb } from './db.js'

export type KnowledgeType = 'fact' | 'habit' | 'health' | 'preference' | 'event'

export interface ExtractedKnowledge {
  id: string
  type: KnowledgeType
  content: string
  source: 'conversation' | 'user_input' | 'sensor_data' | 'ai_inference'
  confidence: number  // 0-1
  catId?: string
  relatedDate?: string
  tags: string[]
  createdAt: Date
  importance: 'low' | 'medium' | 'high'
}

export interface KnowledgeExtractionResult {
  knowledge: ExtractedKnowledge[]
  totalExtracted: number
  summary: string
}

// 知識提取的啟發式模式
const KNOWLEDGE_PATTERNS = {
  // 事實模式
  fact: [
    /(.+)(?:是|為|叫做|名字是|品種是)(.+)/,
    /(.+)(?:有|擁有|具有)(.+)/,
    /(.+)(?:過敏|不能吃|禁忌)(.+)/,
  ],

  // 習慣模式
  habit: [
    /(?:通常|習慣|總是|經常|每天|每週)(.+)/,
    /(.+)(?:喜歡|愛|偏好)(.+)/,
    /(.+)(?:在|會在)(.+)(?:吃飯|睡覺|玩耍|喝水)/,
  ],

  // 健康模式
  health: [
    /(?:體重|重量)(?:是|為|有)?(.+)(?:kg|公斤|克)/,
    /(?:生病|不舒服|症狀|診斷|治療)(.+)/,
    /(?:藥物|用藥|服用|吃藥)(.+)/,
    /(?:疫苗|打針|接種)(.+)/,
  ],

  // 偏好模式
  preference: [
    /(?:喜歡|愛|討厭|不喜歡)(.+)/,
    /(?:最喜歡|最愛|最討厭)(.+)/,
  ],
}

// 使用 AI 提取知識
export async function extractKnowledgeWithAI(
  conversation: Array<{ role: string; content: string }>,
  catId: string,
  generateFn: (prompt: string) => Promise<string>
): Promise<KnowledgeExtractionResult> {
  // 構建提示詞
  const conversationText = conversation
    .map(msg => `${msg.role === 'user' ? '使用者' : 'AI'}: ${msg.content}`)
    .join('\n')

  const prompt = `請從以下對話中提取關於貓咪的關鍵知識點,以 JSON 格式回覆:

對話記錄:
${conversationText}

請提取以下類型的知識:
1. **事實** (fact): 確定的資訊,如名字、品種、年齡、過敏等
2. **習慣** (habit): 日常行為模式,如進食時間、睡眠習慣等
3. **健康** (health): 健康相關資訊,如體重、症狀、用藥等
4. **偏好** (preference): 喜好,如食物偏好、玩具偏好等
5. **事件** (event): 重要事件,如看獸醫、絕育手術等

每個知識點應包含:
- type: 類型 (fact/habit/health/preference/event)
- content: 簡潔的描述 (一句話)
- confidence: 信心度 (0-1)
- importance: 重要性 (low/medium/high)
- tags: 相關標籤 (陣列)
- relatedDate: 相關日期 (如果有)

只提取明確且有價值的資訊,避免推測。

回覆格式:
{
  "knowledge": [
    {
      "type": "fact",
      "content": "Mimi 是一隻橘貓",
      "confidence": 0.95,
      "importance": "medium",
      "tags": ["品種", "外觀"],
      "relatedDate": null
    },
    {
      "type": "health",
      "content": "Mimi 體重 4.2kg",
      "confidence": 0.9,
      "importance": "high",
      "tags": ["體重", "健康指標"],
      "relatedDate": "2025-11-10"
    }
  ],
  "summary": "提取了 2 個知識點: Mimi 的品種和當前體重。"
}`

  try {
    const aiResponse = await generateFn(prompt)

    // 解析 AI 回覆
    let parsed: any
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      }
    } catch (e) {
      console.error('[knowledge] Failed to parse AI response:', e)
      return {
        knowledge: [],
        totalExtracted: 0,
        summary: '無法提取知識點'
      }
    }

    // 轉換為 ExtractedKnowledge 格式
    const knowledge: ExtractedKnowledge[] = (parsed.knowledge || []).map((k: any) => ({
      id: generateKnowledgeId(),
      type: k.type || 'fact',
      content: k.content || '',
      source: 'ai_inference' as const,
      confidence: k.confidence || 0.5,
      catId,
      relatedDate: k.relatedDate || undefined,
      tags: k.tags || [],
      createdAt: new Date(),
      importance: k.importance || 'medium'
    }))

    return {
      knowledge,
      totalExtracted: knowledge.length,
      summary: parsed.summary || `提取了 ${knowledge.length} 個知識點`
    }
  } catch (error) {
    console.error('[knowledge] AI extraction error:', error)
    return {
      knowledge: [],
      totalExtracted: 0,
      summary: '知識提取失敗'
    }
  }
}

// 啟發式知識提取 (快速,不需要 AI)
export function extractKnowledgeHeuristic(
  messages: Array<{ role: string; content: string }>,
  catId: string
): ExtractedKnowledge[] {
  const knowledge: ExtractedKnowledge[] = []

  for (const msg of messages) {
    if (msg.role !== 'user') continue

    const content = msg.content

    // 檢查各種模式
    for (const [type, patterns] of Object.entries(KNOWLEDGE_PATTERNS)) {
      for (const pattern of patterns) {
        const match = content.match(pattern)
        if (match) {
          knowledge.push({
            id: generateKnowledgeId(),
            type: type as KnowledgeType,
            content: content.trim(),
            source: 'conversation',
            confidence: 0.7,
            catId,
            tags: [type],
            createdAt: new Date(),
            importance: 'medium'
          })
          break // 只取第一個匹配
        }
      }
    }
  }

  return knowledge
}

// 儲存知識到資料庫
export function saveKnowledge(knowledge: ExtractedKnowledge): void {
  const db = getDb()

  db.prepare(`
    INSERT INTO extracted_knowledge (
      id, type, content, source, confidence, cat_id,
      related_date, tags, created_at, importance
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    knowledge.id,
    knowledge.type,
    knowledge.content,
    knowledge.source,
    knowledge.confidence,
    knowledge.catId || null,
    knowledge.relatedDate || null,
    JSON.stringify(knowledge.tags),
    knowledge.createdAt.toISOString(),
    knowledge.importance
  )
}

// 取得貓咪的所有知識
export function getCatKnowledge(catId: string, limit: number = 50): ExtractedKnowledge[] {
  const db = getDb()

  const rows = db.prepare(`
    SELECT * FROM extracted_knowledge
    WHERE cat_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(catId, limit) as any[]

  return rows.map(row => ({
    id: row.id,
    type: row.type,
    content: row.content,
    source: row.source,
    confidence: row.confidence,
    catId: row.cat_id,
    relatedDate: row.related_date,
    tags: JSON.parse(row.tags || '[]'),
    createdAt: new Date(row.created_at),
    importance: row.importance
  }))
}

// 搜尋知識
export function searchKnowledge(
  query: string,
  catId?: string,
  type?: KnowledgeType
): ExtractedKnowledge[] {
  const db = getDb()

  let sql = `SELECT * FROM extracted_knowledge WHERE content LIKE ?`
  const params: any[] = [`%${query}%`]

  if (catId) {
    sql += ` AND cat_id = ?`
    params.push(catId)
  }

  if (type) {
    sql += ` AND type = ?`
    params.push(type)
  }

  sql += ` ORDER BY confidence DESC, created_at DESC LIMIT 20`

  const rows = db.prepare(sql).all(...params) as any[]

  return rows.map(row => ({
    id: row.id,
    type: row.type,
    content: row.content,
    source: row.source,
    confidence: row.confidence,
    catId: row.cat_id,
    relatedDate: row.related_date,
    tags: JSON.parse(row.tags || '[]'),
    createdAt: new Date(row.created_at),
    importance: row.importance
  }))
}

// 刪除知識
export function deleteKnowledge(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM extracted_knowledge WHERE id = ?').run(id)
}

// 更新知識
export function updateKnowledge(id: string, updates: Partial<ExtractedKnowledge>): void {
  const db = getDb()
  const knowledge = db.prepare('SELECT * FROM extracted_knowledge WHERE id = ?').get(id)

  if (!knowledge) {
    throw new Error('Knowledge not found')
  }

  const fields: string[] = []
  const values: any[] = []

  if (updates.content !== undefined) {
    fields.push('content = ?')
    values.push(updates.content)
  }

  if (updates.type !== undefined) {
    fields.push('type = ?')
    values.push(updates.type)
  }

  if (updates.importance !== undefined) {
    fields.push('importance = ?')
    values.push(updates.importance)
  }

  if (updates.tags !== undefined) {
    fields.push('tags = ?')
    values.push(JSON.stringify(updates.tags))
  }

  if (fields.length > 0) {
    values.push(id)
    db.prepare(`UPDATE extracted_knowledge SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }
}

// 生成知識 ID
function generateKnowledgeId(): string {
  return `knowledge_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

// 知識統計
export function getKnowledgeStats(catId?: string): {
  total: number
  byType: Record<KnowledgeType, number>
  byImportance: Record<string, number>
  recentCount: number  // 最近 7 天
} {
  const db = getDb()

  let sql = 'SELECT type, importance, created_at FROM extracted_knowledge'
  const params: any[] = []

  if (catId) {
    sql += ' WHERE cat_id = ?'
    params.push(catId)
  }

  const rows = db.prepare(sql).all(...params) as any[]

  const byType: Record<KnowledgeType, number> = {
    fact: 0,
    habit: 0,
    health: 0,
    preference: 0,
    event: 0
  }

  const byImportance: Record<string, number> = {
    low: 0,
    medium: 0,
    high: 0
  }

  let recentCount = 0
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  for (const row of rows) {
    byType[row.type as KnowledgeType]++
    byImportance[row.importance]++

    if (new Date(row.created_at) > sevenDaysAgo) {
      recentCount++
    }
  }

  return {
    total: rows.length,
    byType,
    byImportance,
    recentCount
  }
}

// 合併重複知識
export function deduplicateKnowledge(catId: string): number {
  const knowledge = getCatKnowledge(catId, 1000)

  // 按內容分組
  const groups = new Map<string, ExtractedKnowledge[]>()

  for (const k of knowledge) {
    const normalized = k.content.toLowerCase().trim()
    if (!groups.has(normalized)) {
      groups.set(normalized, [])
    }
    groups.get(normalized)!.push(k)
  }

  let deletedCount = 0

  // 刪除重複項 (保留信心度最高的)
  for (const group of groups.values()) {
    if (group.length > 1) {
      // 按信心度排序
      group.sort((a, b) => b.confidence - a.confidence)

      // 刪除除第一個外的所有項目
      for (let i = 1; i < group.length; i++) {
        deleteKnowledge(group[i].id)
        deletedCount++
      }
    }
  }

  return deletedCount
}

// 生成知識摘要
export function generateKnowledgeSummary(knowledge: ExtractedKnowledge[]): string {
  if (knowledge.length === 0) {
    return '目前沒有提取的知識點。'
  }

  const byType: Record<KnowledgeType, ExtractedKnowledge[]> = {
    fact: [],
    habit: [],
    health: [],
    preference: [],
    event: []
  }

  for (const k of knowledge) {
    byType[k.type].push(k)
  }

  let summary = `共提取 ${knowledge.length} 個知識點:\n\n`

  const typeEmoji: Record<KnowledgeType, string> = {
    fact: '📌',
    habit: '🔄',
    health: '🏥',
    preference: '❤️',
    event: '📅'
  }

  const typeName: Record<KnowledgeType, string> = {
    fact: '事實',
    habit: '習慣',
    health: '健康',
    preference: '偏好',
    event: '事件'
  }

  for (const [type, items] of Object.entries(byType)) {
    if (items.length > 0) {
      summary += `${typeEmoji[type as KnowledgeType]} ${typeName[type as KnowledgeType]} (${items.length}):\n`

      // 只顯示前 3 個
      for (const item of items.slice(0, 3)) {
        summary += `  • ${item.content}`

        if (item.importance === 'high') {
          summary += ' [重要]'
        }

        summary += '\n'
      }

      if (items.length > 3) {
        summary += `  ... 還有 ${items.length - 3} 個\n`
      }

      summary += '\n'
    }
  }

  return summary
}
