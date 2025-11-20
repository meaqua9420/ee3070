import type { LanguageCode } from './types'

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

interface KnowledgeEntry {
  id: string
  tags: string[]
  zh: {
    title: string
    summary: string
    actions: string[]
  }
  en: {
    title: string
    summary: string
    actions: string[]
  }
}

interface CareTaskTimeline {
  timestamp: string
  note: string
}

interface CareTaskStatus {
  taskId: string
  title: string
  category: 'hydration' | 'nutrition' | 'litter' | 'play' | 'health'
  status: 'pending' | 'in_progress' | 'completed'
  assignee: string
  lastUpdated: string
  nextAction: string
  timeline: CareTaskTimeline[]
}

const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  {
    id: 'hydration-basics',
    tags: ['water', 'hydration', 'bowl', 'intake'],
    zh: {
      title: '補水與水碗管理',
      summary: '建議每日監測水碗水位並計算飲水量，夏季或輕微脫水時可以提高水碗高度或提供流動水。',
      actions: [
        '維持水碗水位 60%-80%，若低於 40% 立即補充',
        '炎熱天氣可在下午額外提供冰塊或濕食提高水分',
        '每 2-3 天更換水碗並刷洗避免生物膜',
      ],
    },
    en: {
      title: 'Hydration & Bowl Management',
      summary: 'Monitor bowl levels and intake daily; raise the bowl or offer flowing water when it is hot or if mild dehydration is suspected.',
      actions: [
        'Keep bowl level between 60%-80%; refill immediately if it drops below 40%',
        'Offer ice cubes or extra wet food on hot days to boost water intake',
        'Rinse and scrub every 2-3 days to prevent biofilm build-up',
      ],
    },
  },
  {
    id: 'litter-box-hygiene',
    tags: ['litter', 'box', 'cleaning', 'hygiene'],
    zh: {
      title: '砂盆清潔與異常偵測',
      summary: '固定時間鏟砂與更換砂，並記錄一日尿塊與便便數量；突然減少可能代表泌尿或腸胃問題。',
      actions: [
        '每日早晚各鏟一次，並簡單記錄尿塊 / 便次',
        '若 24 小時內無尿塊或只有 1 次，需留意泌尿道阻塞',
        '兩週徹底換砂並洗刷砂盆，避免氣味與細菌累積',
      ],
    },
    en: {
      title: 'Litter Box Hygiene & Alerts',
      summary: 'Scoop on a schedule and log clump counts; a sudden drop often signals urinary or GI issues.',
      actions: [
        'Scoop twice a day and jot down number of clumps / stools',
        'If there is no urine clump for 24h or only one, treat as a red flag for urinary blockage',
        'Deep clean every two weeks to prevent odors and bacteria',
      ],
    },
  },
  {
    id: 'playtime-calibration',
    tags: ['play', 'exercise', 'enrichment'],
    zh: {
      title: '互動與遊戲建議',
      summary: '每日15分鐘以上的追逐或解謎遊戲可降低夜間爆衝與壓力，特別適合室內貓。',
      actions: [
        '早晚各安排 7-10 分鐘逗貓棒追逐或餌袋遊戲',
        '使用食物迷宮或拉繩小球增加解謎與嗅覺刺激',
        '遊戲後提供少量零食與撫摸，建立正向聯想',
      ],
    },
    en: {
      title: 'Playtime Calibration',
      summary: 'At least 15 minutes of chase/puzzle play reduces night zoomies and stress, especially for indoor cats.',
      actions: [
        'Schedule two 7–10 minute play blocks (morning & evening)',
        'Add puzzle feeders or scent games to enrich the routine',
        'Reward with a small treat + gentle pets afterward',
      ],
    },
  },
]

const TASK_STATUS: CareTaskStatus[] = [
  {
    taskId: 'task-hydration-check',
    title: '檢查水碗補水與濕食比例',
    category: 'hydration',
    status: 'in_progress',
    assignee: 'Care Team',
    lastUpdated: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    nextAction: '今晚上傳最新飲水量與水碗圖片',
    timeline: [
      { timestamp: new Date(Date.now() - 1000 * 60 * 320).toISOString(), note: '系統偵測水碗低於 30%，自動建立任務' },
      { timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(), note: '照護員補水並更換濕食碗' },
    ],
  },
  {
    taskId: 'task-litter-scoop',
    title: '記錄砂盆使用與清潔',
    category: 'litter',
    status: 'pending',
    assignee: 'Owner',
    lastUpdated: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    nextAction: '今晚完成鏟砂並拍照上傳到 Care Command Center',
    timeline: [
      { timestamp: new Date(Date.now() - 1000 * 60 * 1080).toISOString(), note: 'AI 提醒：砂盆 24h 內僅 1 次尿塊' },
    ],
  },
  {
    taskId: 'task-play-session',
    title: '紀錄互動遊戲與能量釋放',
    category: 'play',
    status: 'completed',
    assignee: 'Owner',
    lastUpdated: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    nextAction: '明日晚餐後再次進行 10 分鐘追逐遊戲',
    timeline: [
      { timestamp: new Date(Date.now() - 1000 * 60 * 75).toISOString(), note: '完成 12 分鐘逗貓棒追逐，貓咪有主動追擊' },
      { timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), note: 'AI 確認拍攝影片紀錄，任務自動轉完成' },
    ],
  },
]

type SnapshotSummary = {
  timestamp: string
  temperatureC: number
  humidityPercent: number
  waterLevelPercent: number
  alerts: string[]
}

const SNAPSHOT_HISTORY: Record<string, SnapshotSummary[]> = {
  default: Array.from({ length: 24 }).map((_, index) => {
    const timestamp = new Date(Date.now() - index * 60 * 60 * 1000).toISOString()
    return {
      timestamp,
      temperatureC: 25 + Math.sin(index / 3) * 1.5,
      humidityPercent: 55 + Math.cos(index / 2) * 5,
      waterLevelPercent: Math.max(30, 90 - index * 2),
      alerts: index === 5 ? ['hydration_low'] : [],
    }
  }),
}

const HYDRATION_EVENTS = [
  {
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    waterLevelPercent: 28,
    intakeMl: 210,
    action: 'Auto reminder sent to fill bowl',
  },
  {
    timestamp: new Date(Date.now() - 1000 * 60 * 440).toISOString(),
    waterLevelPercent: 34,
    intakeMl: 160,
    action: 'Caregiver refilled bowl and logged photo',
  },
]

interface GraphFact {
  id: string
  subject: string
  predicate: string
  object: string
  subjectType: string
  objectType: string
  confidence: number
  lastSeen: string
  metadata?: Record<string, unknown>
  source?: string
}

const GRAPH_FACTS = new Map<string, GraphFact>()
const PREPOPULATED_GRAPH_FACTS: GraphFact[] = [
  {
    id: 'fact-neko-sneeze',
    subject: 'cat:neko',
    predicate: 'recorded_symptom',
    object: 'symptom:sneeze',
    subjectType: 'Cat',
    objectType: 'Symptom',
    confidence: 0.82,
    lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    metadata: { severity: 'mild', location: 'living_room' },
    source: 'snapshot:hydration-baseline',
  },
  {
    id: 'fact-neko-vet',
    subject: 'cat:neko',
    predicate: 'visited_vet_on',
    object: 'event:vet-2024-10-12',
    subjectType: 'Cat',
    objectType: 'Event',
    confidence: 0.94,
    lastSeen: '2024-10-12T03:15:00.000Z',
    metadata: { clinic: 'Sunrise Vet', reason: 'seasonal rhinitis' },
    source: 'care-log#8831',
  },
  {
    id: 'fact-neko-prefers-temp',
    subject: 'cat:neko',
    predicate: 'prefers_temp_range',
    object: 'range:23-26C',
    subjectType: 'Cat',
    objectType: 'Range',
    confidence: 0.71,
    lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    metadata: { trigger: 'care-report', adjustedFrom: '24-27C' },
    source: 'professional-report#41',
  },
  {
    id: 'fact-habitat-humidity',
    subject: 'habitat:living-room',
    predicate: 'target_humidity',
    object: 'range:50-60%',
    subjectType: 'Habitat',
    objectType: 'Range',
    confidence: 0.9,
    lastSeen: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    metadata: { derivedFrom: 'sensor-calibration' },
    source: 'calibration#2024-11-01',
  },
]

const GRAPH_STORE_FILE =
  process.env.MCP_GRAPH_STORE_FILE?.trim() || path.join(process.cwd(), 'data', 'graphFacts.json')
const GRAPH_PERSIST_DEBOUNCE_MS = 1500
let graphPersistTimer: NodeJS.Timeout | null = null

function ensureGraphStoreDir() {
  if (!GRAPH_STORE_FILE) return
  const dir = path.dirname(GRAPH_STORE_FILE)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (error) {
    console.warn('[mcp] Failed to ensure graph store directory:', error)
  }
}

function persistGraphFactsNow() {
  if (!GRAPH_STORE_FILE) return
  ensureGraphStoreDir()
  const payload = JSON.stringify(Array.from(GRAPH_FACTS.values()), null, 2)
  fs.writeFileSync(GRAPH_STORE_FILE, payload, 'utf-8')
}

function scheduleGraphPersist() {
  if (!GRAPH_STORE_FILE) return
  if (graphPersistTimer) {
    return
  }
  graphPersistTimer = setTimeout(() => {
    graphPersistTimer = null
    try {
      persistGraphFactsNow()
    } catch (error) {
      console.warn('[mcp] Failed to persist knowledge graph:', error)
    }
  }, GRAPH_PERSIST_DEBOUNCE_MS)
}

function loadGraphFactsFromDisk(): boolean {
  if (!GRAPH_STORE_FILE) return false
  if (!fs.existsSync(GRAPH_STORE_FILE)) {
    return false
  }
  try {
    const raw = fs.readFileSync(GRAPH_STORE_FILE, 'utf-8')
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) {
      console.warn('[mcp] graphFacts file is not an array, ignoring.')
      return false
    }
    GRAPH_FACTS.clear()
    for (const entry of data) {
      if (!entry || typeof entry.subject !== 'string' || typeof entry.predicate !== 'string' || typeof entry.object !== 'string') {
        continue
      }
      const fact: GraphFact = {
        id:
          typeof entry.id === 'string'
            ? entry.id
            : `fact-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
        subject: entry.subject,
        predicate: entry.predicate,
        object: entry.object,
        subjectType: entry.subjectType ?? 'Entity',
        objectType: entry.objectType ?? 'Entity',
        confidence: typeof entry.confidence === 'number' ? entry.confidence : 0.7,
        lastSeen: entry.lastSeen ?? new Date().toISOString(),
        metadata: entry.metadata,
        source: entry.source,
      }
      GRAPH_FACTS.set(`${fact.subject}|${fact.predicate}|${fact.object}`, fact)
    }
    return GRAPH_FACTS.size > 0
  } catch (error) {
    console.warn('[mcp] Failed to load graph facts:', error)
    return false
  }
}

if (!loadGraphFactsFromDisk()) {
  for (const fact of PREPOPULATED_GRAPH_FACTS) {
    GRAPH_FACTS.set(`${fact.subject}|${fact.predicate}|${fact.object}`, fact)
  }
  try {
    scheduleGraphPersist()
  } catch (error) {
    console.warn('[mcp] Unable to persist default graph facts:', error)
  }
}

const DEFAULT_FS_ROOTS = (() => {
  const roots = [path.resolve(process.cwd())]
  const frontendRoot = path.resolve(path.join(process.cwd(), '..', 'smart-cat-home'))
  if (fs.existsSync(frontendRoot)) {
    roots.push(frontendRoot)
  }
  return roots
})()

function normalizeRoots(roots: string[]): string[] {
  return roots
    .map((root) => root.trim())
    .filter(Boolean)
    .map((root) => path.resolve(root))
    .filter((root, index, arr) => arr.indexOf(root) === index)
}

const FS_ROOTS = normalizeRoots(
  process.env.MCP_FS_ROOTS ? process.env.MCP_FS_ROOTS.split(',') : DEFAULT_FS_ROOTS,
)
const FS_ALLOW_WRITE = process.env.MCP_FS_ALLOW_WRITE === '1'

function coerceBoolean(input: unknown): boolean {
  if (typeof input === 'boolean') {
    return input
  }
  if (typeof input === 'number') {
    return input === 1
  }
  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase()
    return ['1', 'true', 'yes', 'on'].includes(normalized)
  }
  return false
}

const BROWSER_ALLOWLIST = (
  process.env.MCP_BROWSER_ALLOWLIST
    ? process.env.MCP_BROWSER_ALLOWLIST.split(',')
    : ['*']
).map((entry) => entry.trim()).filter(Boolean)
const MCP_BROWSER_TIMEOUT_MS = Math.min(Math.max(Number(process.env.MCP_BROWSER_TIMEOUT_MS) || 15000, 2000), 60000)
const MCP_SEARCH_API_URL = process.env.MCP_SEARCH_API_URL?.trim() || ''

interface CustomerProfile {
  customerId: string
  ownerName: string
  email: string
  locale: LanguageCode
  cats: Array<{
    id: string
    name: string
    birthYear: number
    allergies?: string[]
    subscription?: 'standard' | 'pro'
  }>
  preferences: {
    pushNotifications: boolean
    emailDigest: boolean
    preferredVet?: string
    language: LanguageCode
  }
  lastInteraction: string
}

interface CustomerEventLog {
  id: string
  customerId: string
  eventType: string
  createdAt: string
  properties?: Record<string, unknown>
  channel?: string
}

const CUSTOMER_PROFILES: Record<string, CustomerProfile> = {
  'cust-001': {
    customerId: 'cust-001',
    ownerName: 'Iris',
    email: 'iris@example.com',
    locale: 'zh',
    cats: [
      { id: 'cat:neko', name: 'Neko', birthYear: 2018, allergies: ['chicken protein'], subscription: 'pro' },
    ],
    preferences: {
      pushNotifications: true,
      emailDigest: false,
      preferredVet: 'Sunrise Vet Clinic',
      language: 'zh',
    },
    lastInteraction: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
  },
  'cust-002': {
    customerId: 'cust-002',
    ownerName: 'Liam',
    email: 'liam@example.com',
    locale: 'en',
    cats: [{ id: 'cat:momo', name: 'Momo', birthYear: 2021 }],
    preferences: {
      pushNotifications: true,
      emailDigest: true,
      language: 'en',
    },
    lastInteraction: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
}

const CUSTOMER_EVENT_LOG: CustomerEventLog[] = []

const FALLBACK_SEARCH_INDEX = [
  {
    url: 'https://www.cwb.gov.tw/V8/C/',
    title: 'Central Weather Administration - Taiwan Forecast',
    summary: 'Official forecast for Taiwan cities, including temperature, humidity, UV index, and rainfall alerts.',
    tags: ['weather', 'humidity', 'taiwan'],
  },
  {
    url: 'https://www.who.int/health-topics/heat-stress',
    title: 'WHO Heat Stress Guidance',
    summary: 'World Health Organization guidelines for managing heat stress for humans and pets, including hydration best practices.',
    tags: ['heat', 'hydration', 'health'],
  },
  {
    url: 'https://www.avma.org/resources-tools/pet-owners/petcare/cat-hydration',
    title: 'AVMA Cat Hydration Tips',
    summary: 'Veterinary recommendations for keeping cats hydrated, signs of dehydration, and when to see a vet.',
    tags: ['cat care', 'hydration', 'vet'],
  },
]

function isPathWithinRoots(targetPath: string): boolean {
  return FS_ROOTS.some((root) => targetPath === root || targetPath.startsWith(root + path.sep))
}

function resolveFsPath(targetPath?: string): string {
  const resolved = path.resolve(process.cwd(), targetPath ?? '.')
  if (!isPathWithinRoots(resolved)) {
    throw new Error(`Path "${targetPath}" is outside allowed roots: ${FS_ROOTS.join(', ')}`)
  }
  return resolved
}

function isUrlAllowed(urlInput: string | URL): boolean {
  if (BROWSER_ALLOWLIST.includes('*')) {
    return true
  }
  let parsed: URL
  try {
    parsed = typeof urlInput === 'string' ? new URL(urlInput) : urlInput
  } catch {
    return false
  }
  if (BROWSER_ALLOWLIST.length === 0) {
    return true
  }
  return BROWSER_ALLOWLIST.some((entry) => {
    if (!entry) return false
    try {
      if (entry.includes('://')) {
        const allowedUrl = new URL(entry)
        if (parsed.origin !== allowedUrl.origin) {
          return false
        }
        if (allowedUrl.pathname === '/' || allowedUrl.pathname === '') {
          return true
        }
        return parsed.pathname.startsWith(allowedUrl.pathname)
      }
      const normalized = entry.replace(/^\*\./, '')
      if (entry.startsWith('*.')) {
        return parsed.hostname === normalized || parsed.hostname.endsWith(`.${normalized}`)
      }
      return parsed.hostname === entry
    } catch {
      return false
    }
  })
}

function ensureAllowedUrl(urlString: string): URL {
  const parsed = new URL(urlString)
  if (!isUrlAllowed(parsed)) {
    throw new Error(`URL ${urlString} is not in MCP browser allowlist.`)
  }
  return parsed
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(?:br|p|div|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SmartCatMCP/1.0 (+https://localhost)',
        Accept: 'text/html,application/json',
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} when fetching ${url}`)
    }
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

function filterAllowedSearchResults(results: SearchResult[]): { allowed: SearchResult[]; blocked: number } {
  let blocked = 0
  const allowed = results.filter((result) => {
    if (!result.url || !isUrlAllowed(result.url)) {
      blocked += 1
      if (result.url) {
        console.warn('[mcp] Search result blocked by allowlist:', result.url)
      }
      return false
    }
    return true
  })
  return { allowed, blocked }
}

function summarizeSentences(text: string, limit: number): string {
  const sentences = text
    .split(/(?<=[。？！.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
  return sentences.slice(0, limit).join(' ')
}

type SearchResult = {
  url: string
  title: string
  summary: string
  tags?: string[]
}

async function performSearch(query: string, limit: number): Promise<{ items: SearchResult[]; blocked: number }> {
  let rawResults: SearchResult[] = []
  if (MCP_SEARCH_API_URL) {
    try {
      const endpoint = new URL(MCP_SEARCH_API_URL)
      endpoint.searchParams.set('q', query)
      endpoint.searchParams.set('limit', String(limit))
      const raw = await fetchWithTimeout(endpoint.toString(), MCP_BROWSER_TIMEOUT_MS)
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        rawResults = parsed
          .map((item) => ({
            url: item.url || item.link || '',
            title: item.title || item.name || item.url || 'Result',
            summary: item.summary || item.snippet || '',
            tags: item.tags,
          }))
          .filter((item) => item.url)
      }
    } catch (error) {
      console.warn('[mcp] search API failed, falling back to local index.', error)
    }
  }
  if (rawResults.length === 0) {
    const lowered = query.toLowerCase()
    rawResults = FALLBACK_SEARCH_INDEX.filter((entry) => {
      const haystack = `${entry.title} ${entry.summary} ${entry.tags?.join(' ') ?? ''}`.toLowerCase()
      return haystack.includes(lowered)
    })
  }
  const { allowed, blocked } = filterAllowedSearchResults(rawResults)
  return {
    items: allowed.slice(0, limit),
    blocked,
  }
}

type SearchArgs = {
  query?: string
  lang?: LanguageCode
  limit?: number
}

type TaskStatusArgs = {
  taskId?: string
  includeTimeline?: boolean
}

type SnapshotArgs = {
  catId?: string
  start?: string
  end?: string
  limit?: number
  lang?: LanguageCode
}

type GraphQueryArgs = {
  query?: string
  subject?: string
  predicate?: string
  object?: string
  limit?: number
  lang?: LanguageCode
}

type GraphUpsertArgs = {
  subject?: string
  predicate?: string
  object?: string
  subjectType?: string
  objectType?: string
  confidence?: number
  metadata?: Record<string, unknown>
  source?: string
  lang?: LanguageCode
}

type HydrationArgs = {
  catId?: string
  lookbackHours?: number
  lang?: LanguageCode
}

type CalibrationArgs = {
  sensor?: string
  reminderChannel?: 'notification' | 'task'
  etaMinutes?: number
  note?: string
  lang?: LanguageCode
}

type TaskSyncArgs = {
  taskId?: string
  targetBoard?: string
  notifyEmail?: string
  lang?: LanguageCode
}

type CodexExecArgs = {
  prompt?: string
  cwd?: string
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access'
  fullAuto?: boolean
  jsonMode?: boolean
  timeoutMs?: number
  lang?: LanguageCode
  allowWrite?: boolean
}

type FsListArgs = {
  path?: string
  recursive?: boolean
  includeHidden?: boolean
  lang?: LanguageCode
}

type FsReadArgs = {
  path?: string
  encoding?: BufferEncoding
  maxBytes?: number
  lang?: LanguageCode
}

type FsWriteArgs = {
  path?: string
  content?: string
  encoding?: BufferEncoding
  lang?: LanguageCode
}

type AnalyticsSummaryArgs = {
  catId?: string
  metric?: 'temperature' | 'humidity' | 'water'
  hours?: number
  lang?: LanguageCode
}

type AnalyticsRegressionArgs = AnalyticsSummaryArgs & {
  baseline?: number
}

type CdpProfileArgs = {
  customerId?: string
  lang?: LanguageCode
}

type CdpLogEventArgs = {
  customerId?: string
  eventType?: string
  channel?: string
  properties?: Record<string, unknown>
  lang?: LanguageCode
}

type BrowserFetchArgs = {
  url?: string
  summarySentences?: number
  lang?: LanguageCode
}

type BrowserSearchArgs = {
  query?: string
  lang?: LanguageCode
  limit?: number
}

function normalizeLanguage(language?: string): LanguageCode {
  return language === 'en' ? 'en' : 'zh'
}

function scoreEntry(entry: KnowledgeEntry, query: string): number {
  const lowered = query.toLowerCase()
  const haystack = [entry.id, ...entry.tags, entry.zh.title, entry.zh.summary, entry.en.title, entry.en.summary]
    .join(' ')
    .toLowerCase()
  let score = 0
  for (const token of lowered.split(/\s+/).filter(Boolean)) {
    if (haystack.includes(token)) {
      score += 2
    }
  }
  return score
}

type GraphUpsertInternal = {
  subject: string
  predicate: string
  object: string
  subjectType?: string
  objectType?: string
  confidence?: number
  metadata?: Record<string, unknown>
  source?: string
}

function upsertGraphFact(args: GraphUpsertInternal) {
  const key = `${args.subject}|${args.predicate}|${args.object}`
  const now = new Date().toISOString()
  const current = GRAPH_FACTS.get(key)
  if (current) {
    const next: GraphFact = {
      ...current,
      subjectType: args.subjectType ?? current.subjectType,
      objectType: args.objectType ?? current.objectType,
      confidence: typeof args.confidence === 'number' ? args.confidence : current.confidence,
      lastSeen: now,
      metadata: args.metadata ?? current.metadata,
      source: args.source ?? current.source,
    }
    GRAPH_FACTS.set(key, next)
    scheduleGraphPersist()
    return next
  }
  const created: GraphFact = {
    id: `fact-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
    subject: args.subject,
    predicate: args.predicate,
    object: args.object,
    subjectType: args.subjectType ?? 'Entity',
    objectType: args.objectType ?? 'Entity',
    confidence: typeof args.confidence === 'number' ? args.confidence : 0.7,
    lastSeen: now,
    metadata: args.metadata,
    source: args.source,
  }
  GRAPH_FACTS.set(key, created)
  scheduleGraphPersist()
  return created
}

async function handleGraphQuery(args: GraphQueryArgs): Promise<{ output: string; data: unknown }> {
  const lang = normalizeLanguage(args?.lang)
  const haystack = Array.from(GRAPH_FACTS.values())
  const limit = Math.min(Math.max(Number(args?.limit) || 4, 1), 12)
  const filtered = haystack
    .filter((fact) => {
      if (args?.subject && !fact.subject.includes(args.subject)) return false
      if (args?.predicate && fact.predicate !== args.predicate) return false
      if (args?.object && !fact.object.includes(args.object)) return false
      if (args?.query) {
        const loweredQuery = args.query.toLowerCase()
        const content = [
          fact.subject,
          fact.predicate,
          fact.object,
          fact.metadata ? JSON.stringify(fact.metadata) : '',
          fact.source ?? '',
        ]
          .join(' ')
          .toLowerCase()
        if (!content.includes(loweredQuery)) {
          return false
        }
      }
      return true
    })
    .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen))
    .slice(0, limit)

  if (filtered.length === 0) {
    return {
      output:
        lang === 'en'
          ? 'Knowledge graph did not return any matching facts.'
          : '知識圖譜中找不到符合條件的紀錄。',
      data: { items: [] },
    }
  }
  const lines = filtered.map((fact) => {
    const confidence = `${Math.round(fact.confidence * 100)}%`
    const notes =
      fact.metadata && Object.keys(fact.metadata).length > 0
        ? `meta=${JSON.stringify(fact.metadata)}`
        : ''
    return `${fact.subject} --${fact.predicate}--> ${fact.object} (${confidence}, ${fact.lastSeen}) ${notes}`.trim()
  })
  const intro =
    lang === 'en'
      ? `Knowledge graph returned ${filtered.length} fact(s):`
      : `知識圖譜找到 ${filtered.length} 筆關聯：`
  return {
    output: `${intro}\n${lines.join('\n')}`,
    data: { items: filtered },
  }
}

async function handleGraphUpsert(args: GraphUpsertArgs): Promise<{ output: string; data: unknown }> {
  const subject = typeof args?.subject === 'string' ? args.subject.trim() : ''
  const predicate = typeof args?.predicate === 'string' ? args.predicate.trim() : ''
  const object = typeof args?.object === 'string' ? args.object.trim() : ''
  if (!subject || !predicate || !object) {
    throw new Error('subject, predicate, and object are required for graph upsert.')
  }
  const fact = upsertGraphFact({
    subject,
    predicate,
    object,
    subjectType: args?.subjectType,
    objectType: args?.objectType,
    confidence: typeof args?.confidence === 'number' ? args.confidence : undefined,
    metadata: args?.metadata,
    source: args?.source,
  })
  const lang = normalizeLanguage(args?.lang)
  const message =
    lang === 'en'
      ? `Graph updated: ${fact.subject} ${fact.predicate} ${fact.object} (confidence ${Math.round(fact.confidence * 100)}%).`
      : `已更新知識圖譜：${fact.subject} ${fact.predicate} ${fact.object}（信心 ${Math.round(fact.confidence * 100)}%）。`
  return {
    output: message,
    data: fact,
  }
}

async function handleSearchKnowledgeBase(args: SearchArgs): Promise<{ output: string; data: unknown }> {
  const query = (args?.query ?? '').toString().trim()
  if (!query) {
    throw new Error('Missing query for knowledge search.')
  }
  const lang = normalizeLanguage(args?.lang)
  const limit = Math.min(Math.max(Number(args?.limit) || 3, 1), 5)
  const ranked = KNOWLEDGE_BASE.map((entry) => ({ entry, score: scoreEntry(entry, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  if (ranked.length === 0) {
    return {
      output:
        lang === 'en'
          ? `I could not find a direct match for “${query}”. Consider sharing more details (hydration, litter, behavior) so I can help.`
          : `目前找不到「${query}」的直接紀錄。可以再描述 hydration、砂盆或行為等細節，讓我提供更精準的建議。`,
      data: { items: [] },
    }
  }

  const bulletLines = ranked.map(({ entry }) => {
    const block = entry[lang]
    const actions = block.actions.slice(0, 2).map((action, idx) => `      • ${action}`).join('\n')
    return `- **${block.title}**：${block.summary}\n${actions}`
  })

  const output =
    lang === 'en'
      ? `Here are ${ranked.length} knowledge highlights related to “${query}”:\n${bulletLines.join('\n')}\nSummaries reflect Smart Cat Home care guidelines.`
      : `找到 ${ranked.length} 筆與「${query}」相關的照護重點：\n${bulletLines.join('\n')}\n以上內容依 Smart Cat Home 照護守則整理。`

  return {
    output,
    data: {
      items: ranked.map(({ entry }) => ({
        id: entry.id,
        tags: entry.tags,
        title: entry[lang].title,
        summary: entry[lang].summary,
        actions: entry[lang].actions,
      })),
    },
  }
}

async function handleFetchTaskStatus(args: TaskStatusArgs): Promise<{ output: string; data: unknown }> {
  const taskId = (args?.taskId ?? '').toString().trim()
  if (!taskId) {
    throw new Error('Missing taskId.')
  }
  const includeTimeline = Boolean(args?.includeTimeline)
  const task = TASK_STATUS.find((entry) => entry.taskId === taskId)
  if (!task) {
    throw new Error(`Task "${taskId}" not found.`)
  }
  const timeline = includeTimeline ? task.timeline : undefined
  const output = [
    `任務：${task.title}`,
    `分類：${task.category}`,
    `狀態：${task.status}`,
    `指派：${task.assignee}`,
    `更新：${task.lastUpdated}`,
    `下一步：${task.nextAction}`,
    timeline ? `歷程：\n${timeline.map((item) => `- ${item.timestamp}: ${item.note}`).join('\n')}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  return {
    output,
    data: {
      ...task,
      timeline,
    },
  }
}

function filterSnapshots(catId: string, start?: string, end?: string, limit?: number): SnapshotSummary[] {
  const history = SNAPSHOT_HISTORY[catId] ?? SNAPSHOT_HISTORY.default
  const startTime = start ? Date.parse(start) : Number.NEGATIVE_INFINITY
  const endTime = end ? Date.parse(end) : Number.POSITIVE_INFINITY
  const filtered = history.filter((entry) => {
    const ts = Date.parse(entry.timestamp)
    return ts >= startTime && ts <= endTime
  })
  const slice = typeof limit === 'number' && limit > 0 ? filtered.slice(0, limit) : filtered
  return slice
}

async function handleFetchSnapshotRange(args: SnapshotArgs): Promise<{ output: string; data: unknown }> {
  const catId = (args?.catId ?? 'default').toString()
  const limit = typeof args?.limit === 'number' ? Math.min(Math.max(args.limit, 1), 72) : 12
  const entries = filterSnapshots(catId, args?.start, args?.end, limit)
  if (entries.length === 0) {
    return {
      output: args?.lang === 'en'
        ? `No snapshots found for ${catId}. Try expanding the time window.`
        : `找不到 ${catId} 在此時段的快照，請放寬時間範圍。`,
      data: { items: [] },
    }
  }
  const lang = normalizeLanguage(args?.lang)
  const bulletLines = entries.slice(0, 4).map((entry) => {
    const sign = entry.alerts.length > 0 ? '⚠️' : '✅'
    const alertText = entry.alerts.length > 0 ? `alerts: ${entry.alerts.join(', ')}` : 'no alerts'
    return `${sign} ${entry.timestamp} · ${entry.temperatureC.toFixed(1)}°C / ${entry.humidityPercent.toFixed(0)}% · water ${entry.waterLevelPercent.toFixed(0)}% (${alertText})`
  })
  const output =
    lang === 'en'
      ? `Showing ${entries.length} snapshot(s) for cat "${catId}":\n${bulletLines.join('\n')}`
      : `列出 ${catId} 的 ${entries.length} 筆快照：\n${bulletLines.join('\n')}`
  return {
    output,
    data: { items: entries },
  }
}

async function handleListHydrationAnomalies(args: HydrationArgs): Promise<{ output: string; data: unknown }> {
  const lang = normalizeLanguage(args?.lang)
  if (HYDRATION_EVENTS.length === 0) {
    return {
      output: lang === 'en' ? 'No hydration anomalies recorded in the selected window.' : '選定時段內沒有偵測到飲水異常。',
      data: { items: [] },
    }
  }
  const list = HYDRATION_EVENTS.map(
    (event) =>
      `- ${event.timestamp}: water ${event.waterLevelPercent}% / intake ${event.intakeMl}ml → ${event.action}`,
  ).join('\n')
  const output =
    lang === 'en'
      ? `Recent hydration anomalies:\n${list}`
      : `最近的飲水異常：\n${list}`
  return {
    output,
    data: { items: HYDRATION_EVENTS },
  }
}

async function handleTriggerCalibrationReminder(args: CalibrationArgs): Promise<{ output: string; data: unknown }> {
  const sensor = (args?.sensor ?? 'fsr').toString()
  const channel = args?.reminderChannel ?? 'notification'
  const eta = typeof args?.etaMinutes === 'number' ? Math.max(5, Math.min(args.etaMinutes, 1440)) : 30
  const lang = normalizeLanguage(args?.lang)
  const note = typeof args?.note === 'string' && args.note.trim().length > 0 ? args.note.trim() : null
  const detail =
    lang === 'en'
      ? `Reminder queued: ${sensor} sensor calibration in ~${eta} minutes via ${channel}.`
      : `已排程提醒：${sensor} 感測器預計 ${eta} 分鐘後透過 ${channel} 提醒校正。`
  return {
    output: note ? `${detail}\nNote: ${note}` : detail,
    data: {
      sensor,
      channel,
      etaMinutes: eta,
      note,
      ticketId: `cal-${Date.now().toString(36)}`,
    },
  }
}

async function handleSyncCareTaskToNotion(args: TaskSyncArgs): Promise<{ output: string; data: unknown }> {
  const taskId = (args?.taskId ?? '').toString().trim()
  const targetBoard = (args?.targetBoard ?? 'Notion/CareBoard').toString()
  const notifyEmail = typeof args?.notifyEmail === 'string' ? args.notifyEmail : null
  if (!taskId) {
    throw new Error('taskId is required for Notion sync.')
  }
  const lang = normalizeLanguage(args?.lang)
  const payload = {
    taskId,
    targetBoard,
    status: 'queued',
    syncedAt: new Date().toISOString(),
  }
  const output =
    lang === 'en'
      ? `Task ${taskId} pushed to ${targetBoard}. ${notifyEmail ? `Notification queued for ${notifyEmail}.` : ''}`
      : `任務 ${taskId} 已推送到 ${targetBoard}。${notifyEmail ? `會寄送通知給 ${notifyEmail}。` : ''}`
  return { output: output.trim(), data: payload }
}

const ALLOWED_SANDBOX = new Set(['read-only', 'workspace-write', 'danger-full-access'])
const CODEX_MCP_ALLOW_WRITE = process.env.CODEX_MCP_ALLOW_WRITE === '1'
const SHORTCUTS_BIN = process.env.SHORTCUTS_BIN?.trim() || 'shortcuts'
const ANALYTICS_METRIC_FIELDS: Record<'temperature' | 'humidity' | 'water', keyof SnapshotSummary> = {
  temperature: 'temperatureC',
  humidity: 'humidityPercent',
  water: 'waterLevelPercent',
}

function sanitizeSandbox(requested: string | undefined, allowWrite: boolean): 'read-only' | 'workspace-write' | 'danger-full-access' {
  if (!requested || requested === 'read-only') {
    return 'read-only'
  }
  if (!allowWrite) {
    throw new Error('Write-enabled Codex sandbox is disabled. Set allowWrite=true in args and CODEX_MCP_ALLOW_WRITE=1 to permit it.')
  }
  if (!ALLOWED_SANDBOX.has(requested)) {
    return 'read-only'
  }
  return requested as 'workspace-write' | 'danger-full-access'
}

function getMetricSeries(catId: string, metric: 'temperature' | 'humidity' | 'water', hours: number): number[] {
  const history = SNAPSHOT_HISTORY[catId] ?? SNAPSHOT_HISTORY.default
  const cutoff = Date.now() - hours * 60 * 60 * 1000
  const field = ANALYTICS_METRIC_FIELDS[metric]
  return history
    .filter((entry) => Date.parse(entry.timestamp) >= cutoff)
    .map((entry) => entry[field] as number)
    .filter((value) => Number.isFinite(value))
}

function summarizeValues(values: number[]) {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.reduce((acc, value) => acc + value, 0) / values.length
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const median = sorted[Math.floor(sorted.length / 2)]
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length
  const stddev = Math.sqrt(variance)
  return { mean, min, max, median, stddev }
}

function linearRegression(values: number[]): { slope: number; intercept: number } | null {
  const n = values.length
  if (n < 2) return null
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  for (let i = 0; i < n; i += 1) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumXX += i * i
  }
  const denominator = n * sumXX - sumX * sumX
  if (denominator === 0) return null
  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

async function handleAnalyticsSummary(args: AnalyticsSummaryArgs): Promise<{ output: string; data: unknown }> {
  const metric = args?.metric ?? 'temperature'
  const catId = args?.catId ?? 'default'
  const hours = Math.min(Math.max(Number(args?.hours) || 24, 1), 168)
  const series = getMetricSeries(catId, metric, hours)
  const stats = summarizeValues(series)
  const lang = normalizeLanguage(args?.lang)
  if (!stats) {
    return {
      output: lang === 'en' ? 'No data available for the selected window.' : '此時段沒有可用資料。',
      data: { items: [] },
    }
  }
  const labelMap = {
    temperature: lang === 'en' ? 'Temperature' : '溫度',
    humidity: lang === 'en' ? 'Humidity' : '濕度',
    water: lang === 'en' ? 'Water level' : '水位',
  }
  const unit = metric === 'temperature' ? '°C' : metric === 'humidity' ? '%' : '%'
  const output =
    lang === 'en'
      ? `${labelMap[metric]} over last ${hours}h for ${catId}: mean ${stats.mean.toFixed(2)}${unit}, min ${stats.min.toFixed(2)}${unit}, max ${stats.max.toFixed(2)}${unit}, std ${stats.stddev.toFixed(2)}`
      : `${catId} 過去 ${hours} 小時的${labelMap[metric]}：平均 ${stats.mean.toFixed(2)}${unit}，最低 ${stats.min.toFixed(2)}${unit}，最高 ${stats.max.toFixed(2)}${unit}，標準差 ${stats.stddev.toFixed(2)}`
  return {
    output,
    data: {
      catId,
      metric,
      hours,
      stats,
      sampleSize: series.length,
    },
  }
}

async function handleAnalyticsRegression(args: AnalyticsRegressionArgs): Promise<{ output: string; data: unknown }> {
  const metric = args?.metric ?? 'temperature'
  const catId = args?.catId ?? 'default'
  const hours = Math.min(Math.max(Number(args?.hours) || 24, 1), 168)
  const series = getMetricSeries(catId, metric, hours)
  const regression = linearRegression(series)
  const lang = normalizeLanguage(args?.lang)
  if (!regression) {
    return {
      output: lang === 'en' ? 'Not enough samples for regression.' : '樣本不足，無法計算趨勢。',
      data: { items: [] },
    }
  }
  const unit = metric === 'temperature' ? '°C' : '%'
  const slopePerHour = regression.slope
  const trend =
    slopePerHour > 0.05
      ? lang === 'en'
        ? 'increasing'
        : '呈上升趨勢'
      : slopePerHour < -0.05
        ? lang === 'en'
          ? 'decreasing'
          : '呈下降趨勢'
        : lang === 'en'
          ? 'stable'
          : '維持穩定'
  const sentence =
    lang === 'en'
      ? `Linear trend for ${metric} across ${hours}h shows slope ${slopePerHour.toFixed(3)} ${unit}/step (${trend}).`
      : `${metric} 在 ${hours} 小時內的線性趨勢斜率為 ${slopePerHour.toFixed(3)} ${unit}/步，整體${trend}。`
  return {
    output: sentence,
    data: {
      metric,
      catId,
      hours,
      slopePerStep: slopePerHour,
      intercept: regression.intercept,
      samples: series.length,
    },
  }
}

async function handleCdpFetchProfile(args: CdpProfileArgs): Promise<{ output: string; data: unknown }> {
  const customerId = typeof args?.customerId === 'string' ? args.customerId.trim() : ''
  if (!customerId) {
    throw new Error('customerId is required.')
  }
  const profile = CUSTOMER_PROFILES[customerId]
  if (!profile) {
    throw new Error(`Customer ${customerId} not found.`)
  }
  const lang = normalizeLanguage(args?.lang ?? profile.locale)
  const catList = profile.cats.map((cat) => `${cat.name} (${cat.subscription ?? 'standard'})`).join(', ')
  const summary =
    lang === 'en'
      ? `Customer ${profile.ownerName} (${customerId}) prefers ${profile.preferences.language} UI, push=${profile.preferences.pushNotifications}. Cats: ${catList}.`
      : `顧客 ${profile.ownerName}（${customerId}）偏好 ${profile.preferences.language} 介面，推播=${profile.preferences.pushNotifications}。貓咪：${catList}。`
  return { output: summary, data: profile }
}

async function handleCdpLogEvent(args: CdpLogEventArgs): Promise<{ output: string; data: unknown }> {
  const customerId = typeof args?.customerId === 'string' ? args.customerId.trim() : ''
  const eventType = typeof args?.eventType === 'string' ? args.eventType.trim() : ''
  if (!customerId || !eventType) {
    throw new Error('customerId and eventType are required for event logging.')
  }
  if (!CUSTOMER_PROFILES[customerId]) {
    throw new Error(`Customer ${customerId} not found.`)
  }
  const event: CustomerEventLog = {
    id: `evt-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
    customerId,
    eventType,
    createdAt: new Date().toISOString(),
    channel: args?.channel,
    properties: args?.properties,
  }
  CUSTOMER_EVENT_LOG.push(event)
  const lang = normalizeLanguage(args?.lang)
  const msg =
    lang === 'en'
      ? `Logged event ${eventType} for ${customerId}.`
      : `已為 ${customerId} 記錄事件 ${eventType}。`
  return {
    output: msg,
    data: event,
  }
}

function runCodexExec(prompt: string, options: {
  cwd?: string
  sandbox?: string
  fullAuto?: boolean
  jsonMode?: boolean
  timeoutMs?: number
} = {}): Promise<{ stdout: string; stderr: string; command: string; args: string[] }> {
  const bin = process.env.CODEX_BIN?.trim() || 'codex'
  const args = ['exec', prompt, '--skip-git-repo-check']
  if (options.sandbox && ALLOWED_SANDBOX.has(options.sandbox)) {
    args.push('--sandbox', options.sandbox)
  }
  if (options.fullAuto) {
    args.push('--full-auto')
  }
  if (options.jsonMode) {
    args.push('--json')
  }
  const child = spawn(bin, args, {
    cwd: options.cwd ?? process.cwd(),
    env: process.env,
  })
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      reject(error)
    })
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`codex exec timed out after ${options.timeoutMs ?? 120000}ms`))
    }, options.timeoutMs ?? 120000)
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolve({ stdout, stderr, command: bin, args })
      } else {
        const tail = stderr.split('\n').slice(-20).join('\n').trim()
        reject(new Error(tail || `codex exec exited with code ${code}`))
      }
    })
  })
}

async function handleCodexExec(args: CodexExecArgs): Promise<{ output: string; data: unknown }> {
  const prompt = typeof args?.prompt === 'string' ? args.prompt.trim() : ''
  if (!prompt) {
    throw new Error('prompt is required for codex tool.')
  }
  const allowWrite = CODEX_MCP_ALLOW_WRITE || coerceBoolean((args as { allowWrite?: unknown })?.allowWrite)
  const sandbox = sanitizeSandbox(
    typeof args?.sandbox === 'string' ? args.sandbox : undefined,
    allowWrite,
  )
  const cwd = typeof args?.cwd === 'string' && args.cwd.trim().length > 0 ? args.cwd.trim() : process.cwd()
  const timeout = typeof args?.timeoutMs === 'number' && Number.isFinite(args.timeoutMs) ? Math.min(Math.max(args.timeoutMs, 5000), 300000) : undefined
  const result = await runCodexExec(prompt, {
    cwd,
    sandbox,
    fullAuto: Boolean(args?.fullAuto) && allowWrite,
    jsonMode: Boolean(args?.jsonMode),
    timeoutMs: timeout,
  })
  const lang = normalizeLanguage(args?.lang)
  const output =
    result.stdout.trim().length > 0
      ? result.stdout.trim()
      : lang === 'en'
        ? 'Codex completed with no textual output. Check metadata for details.'
        : 'Codex 已完成但沒有文字輸出，可檢查 metadata。'
  return {
    output,
    data: {
      stdout: result.stdout,
      stderr: result.stderr,
      sandbox,
      cwd,
      args: result.args,
      writeEnabled: allowWrite,
    },
  }
}

function execShortcuts(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(SHORTCUTS_BIN, args)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new Error(stderr.trim() || `shortcuts ${args.join(' ')} exited with code ${code}`))
      }
    })
  })
}

type ClaudeIdeArgs = {
  prompt?: string
  cwd?: string
  model?: string
  ide?: boolean
  systemPrompt?: string
  appendSystemPrompt?: string
  outputFormat?: 'text' | 'json'
  timeoutMs?: number
  allowDangerouslySkipPermissions?: boolean
  extraArgs?: string[]
  lang?: LanguageCode
}

const CLAUDE_BIN = process.env.CLAUDE_CLI_BIN?.trim() || 'claude'

function runClaudeCommand(
  prompt: string,
  options: {
    cwd?: string
    model?: string
    ide?: boolean
    systemPrompt?: string
    appendSystemPrompt?: string
    outputFormat?: 'text' | 'json'
    timeoutMs?: number
    allowDangerouslySkipPermissions?: boolean
    extraArgs?: string[]
  } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number; args: string[] }> {
  const outputFormat = options.outputFormat === 'json' ? 'json' : 'text'
  const args: string[] = ['--print', '--output-format', outputFormat]
  if (options.ide !== false) {
    args.push('--ide')
  }
  if (options.model) {
    args.push('--model', options.model)
  }
  if (options.systemPrompt) {
    args.push('--system-prompt', options.systemPrompt)
  }
  if (options.appendSystemPrompt) {
    args.push('--append-system-prompt', options.appendSystemPrompt)
  }
  if (options.allowDangerouslySkipPermissions) {
    args.push('--dangerously-skip-permissions')
  }
  if (Array.isArray(options.extraArgs) && options.extraArgs.length > 0) {
    args.push(...options.extraArgs.filter((value) => typeof value === 'string' && value.length > 0))
  }
  args.push(prompt)

  const child = spawn(CLAUDE_BIN, args, {
    cwd: options.cwd && options.cwd.trim().length > 0 ? options.cwd : process.cwd(),
    env: process.env,
  })

  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => reject(error))
    const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 180000, 5000), 600000)
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`Claude CLI timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve({ stdout, stderr, exitCode: 0, args })
      } else {
        reject(new Error(stderr.trim() || `claude exited with code ${code}`))
      }
    })
  })
}

async function handleClaudeIdeCommand(args: ClaudeIdeArgs): Promise<{ output: string; data: unknown }> {
  const prompt = typeof args?.prompt === 'string' ? args.prompt.trim() : ''
  if (!prompt) {
    throw new Error('prompt is required for Claude IDE command.')
  }
  const cwd =
    typeof args?.cwd === 'string' && args.cwd.trim().length > 0 ? path.resolve(args.cwd.trim()) : process.cwd()
  const timeout = typeof args?.timeoutMs === 'number' && Number.isFinite(args.timeoutMs) ? args.timeoutMs : undefined
  const result = await runClaudeCommand(prompt, {
    cwd,
    model: typeof args?.model === 'string' ? args.model : undefined,
    ide: typeof args?.ide === 'boolean' ? args.ide : true,
    systemPrompt: typeof args?.systemPrompt === 'string' ? args.systemPrompt : undefined,
    appendSystemPrompt: typeof args?.appendSystemPrompt === 'string' ? args.appendSystemPrompt : undefined,
    outputFormat: args?.outputFormat === 'json' ? 'json' : 'text',
    timeoutMs: timeout,
    allowDangerouslySkipPermissions: Boolean(args?.allowDangerouslySkipPermissions),
    extraArgs: Array.isArray(args?.extraArgs) ? args.extraArgs : undefined,
  })

  const lang = normalizeLanguage(args?.lang)
  const trimmed = result.stdout.trim()
  let parsed: unknown = undefined
  if (args?.outputFormat === 'json') {
    try {
      parsed = JSON.parse(trimmed || '{}')
    } catch (error) {
      parsed = { raw: trimmed }
    }
  }

  const output =
    trimmed.length > 0
      ? trimmed
      : lang === 'en'
        ? 'Claude completed with no textual output. Inspect metadata for stdout/stderr.'
        : 'Claude 已完成但沒有文字輸出，可檢查 metadata。'
  return {
    output,
    data: {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      args: result.args,
      cwd,
      parsed,
    },
  }
}

async function handleListShortcuts(args: ShortcutListArgs): Promise<{ output: string; data: unknown }> {
  const raw = await execShortcuts(['list'])
  const items = raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  const filter = typeof args?.filter === 'string' ? args.filter.trim().toLowerCase() : ''
  const filtered = filter ? items.filter(item => item.toLowerCase().includes(filter)) : items
  const lang = normalizeLanguage(args?.lang)
  const output =
    filtered.length === 0
      ? lang === 'en'
        ? 'No shortcuts found.'
        : '找不到捷徑。'
      : (lang === 'en'
        ? `Available shortcuts:\n${filtered.join('\n')}`
        : `可用的捷徑：\n${filtered.join('\n')}`)
  return { output, data: { items: filtered } }
}

async function handleRunShortcut(args: ShortcutRunArgs): Promise<{ output: string; data: unknown }> {
  const name = typeof args?.name === 'string' ? args.name.trim() : ''
  if (!name) {
    throw new Error('Shortcut name is required.')
  }
  const params = ['run', name]
  if (typeof args?.input === 'string' && args.input.length > 0) {
    params.push('-i', args.input)
  }
  const stdout = await execShortcuts(params)
  const lang = normalizeLanguage(args?.lang)
  const message =
    stdout.length > 0
      ? stdout
      : lang === 'en'
        ? `Shortcut "${name}" executed successfully.`
        : `捷徑「${name}」執行成功。`
  return { output: message, data: { name, input: args?.input ?? null, stdout } }
}

async function handleFsList(args: FsListArgs): Promise<{ output: string; data: unknown }> {
  const target = resolveFsPath(args?.path)
  const entries = fs.readdirSync(target, { withFileTypes: true })
  const includeHidden = Boolean(args?.includeHidden)
  const recursive = Boolean(args?.recursive)
  const results: Array<{ name: string; type: 'file' | 'dir'; size: number }> = []

  const walk = (dirPath: string, prefix = '') => {
    const files = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of files) {
      if (!includeHidden && entry.name.startsWith('.')) continue
      const absPath = path.join(dirPath, entry.name)
      const relName = prefix ? path.join(prefix, entry.name) : entry.name
      if (entry.isDirectory()) {
        results.push({ name: relName + '/', type: 'dir', size: 0 })
        if (recursive && results.length < 500) {
          walk(absPath, relName)
        }
      } else if (entry.isFile()) {
        const stat = fs.statSync(absPath)
        results.push({ name: relName, type: 'file', size: stat.size })
      }
      if (results.length >= 500) break
    }
  }

  if (recursive) {
    walk(target)
  } else {
    for (const entry of entries) {
      if (!includeHidden && entry.name.startsWith('.')) continue
      const absPath = path.join(target, entry.name)
      if (entry.isDirectory()) {
        results.push({ name: entry.name + '/', type: 'dir', size: 0 })
      } else if (entry.isFile()) {
        const stat = fs.statSync(absPath)
        results.push({ name: entry.name, type: 'file', size: stat.size })
      }
      if (results.length >= 500) break
    }
  }

  const lang = normalizeLanguage(args?.lang)
  const intro =
    lang === 'en'
      ? `Listing ${results.length} item(s) in ${target}`
      : `列出 ${target} 內的 ${results.length} 個項目`
  const lines = results
    .slice(0, 20)
    .map((entry) => `${entry.type === 'dir' ? '📁' : '📄'} ${entry.name} (${entry.size}B)`)
  const tail = results.length > 20 ? '…' : ''
  return {
    output: `${intro}\n${lines.join('\n')}${tail}`,
    data: { target, items: results },
  }
}

async function handleFsRead(args: FsReadArgs): Promise<{ output: string; data: unknown }> {
  const target = resolveFsPath(args?.path)
  const encoding = (args?.encoding ?? 'utf-8') as BufferEncoding
  const maxBytes = Math.min(Math.max(Number(args?.maxBytes) || 32_768, 256), 2_000_000)
  const stat = fs.statSync(target)
  if (!stat.isFile()) {
    throw new Error(`Path ${target} is not a file.`)
  }
  if (stat.size > maxBytes) {
    const fd = fs.openSync(target, 'r')
    const buffer = Buffer.allocUnsafe(maxBytes)
    const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0)
    fs.closeSync(fd)
    const slice = buffer.toString('utf-8', 0, bytesRead)
    return {
      output: `Read ${bytesRead} / ${stat.size} bytes from ${target}`,
      data: { path: target, content: slice, truncated: true, encoding: 'utf-8' },
    }
  }
  const content = fs.readFileSync(target, { encoding })
  return {
    output: `Read file ${target} (${stat.size} bytes)`,
    data: { path: target, content, truncated: false, encoding },
  }
}

async function handleFsWrite(args: FsWriteArgs): Promise<{ output: string; data: unknown }> {
  if (!FS_ALLOW_WRITE) {
    throw new Error('File write MCP tool is disabled.')
  }
  const target = resolveFsPath(args?.path)
  const encoding = (args?.encoding ?? 'utf-8') as BufferEncoding
  const content = typeof args?.content === 'string' ? args.content : ''
  if (!content) {
    throw new Error('Content is required for file write.')
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content, { encoding })
  const lang = normalizeLanguage(args?.lang)
  return {
    output: lang === 'en' ? `Wrote ${content.length} chars to ${target}` : `已寫入 ${content.length} 字元至 ${target}`,
    data: { path: target, bytes: Buffer.byteLength(content, encoding), encoding },
  }
}

async function handleBrowserFetch(args: BrowserFetchArgs): Promise<{ output: string; data: unknown }> {
  const url = typeof args?.url === 'string' ? args.url.trim() : ''
  if (!url) {
    throw new Error('url is required for browser fetch.')
  }
  const parsed = ensureAllowedUrl(url)
  const html = await fetchWithTimeout(parsed.toString(), MCP_BROWSER_TIMEOUT_MS)
  const text = stripHtml(html)
  const sentences = summarizeSentences(text, Math.min(Math.max(Number(args?.summarySentences) || 4, 1), 8))
  const lang = normalizeLanguage(args?.lang)
  const output =
    lang === 'en'
      ? `Fetched ${parsed.hostname}, summary:\n${sentences}`
      : `已抓取 ${parsed.hostname}，摘要如下：\n${sentences}`
  return {
    output,
    data: {
      url: parsed.toString(),
      summary: sentences,
      contentSnippet: text.slice(0, 2000),
    },
  }
}

async function handleBrowserSearch(args: BrowserSearchArgs): Promise<{ output: string; data: unknown }> {
  const query = typeof args?.query === 'string' ? args.query.trim() : ''
  if (!query) {
    throw new Error('query is required for browser search.')
  }
  const limit = Math.min(Math.max(Number(args?.limit) || 3, 1), 10)
  const { items: results, blocked } = await performSearch(query, limit)
  const lang = normalizeLanguage(args?.lang)
  if (results.length === 0) {
    if (blocked > 0 && BROWSER_ALLOWLIST.length > 0) {
      const message =
        lang === 'en'
          ? `All available results for "${query}" were blocked by MCP_BROWSER_ALLOWLIST. Update the allow list or broaden the query.`
          : `「${query}」的搜尋結果皆被 MCP_BROWSER_ALLOWLIST 限制，請調整允許網域或改用其他資料來源。`
      return {
        output: message,
        data: { query, items: [], blocked },
      }
    }
    return {
      output: lang === 'en' ? `No search results for "${query}".` : `「${query}」沒有找到結果。`,
      data: { query, items: [], blocked },
    }
  }
  const lines = results
    .map((result, index) => `${index + 1}. ${result.title} → ${result.summary}`)
    .join('\n')
  const output =
    lang === 'en'
      ? `Top ${results.length} result(s) for "${query}":\n${lines}`
      : `「${query}」的前 ${results.length} 筆結果：\n${lines}`
  return {
    output,
    data: {
      query,
      items: results,
      blocked,
    },
  }
}

type McpHandler = (args: unknown) => Promise<{ output: string; data?: unknown }>

const MCP_HANDLERS: Record<string, McpHandler> = {
  'mcp.searchKnowledgeBase': handleSearchKnowledgeBase,
  'mcp.fetchTaskStatus': handleFetchTaskStatus,
  'mcp.fetchSnapshotRange': handleFetchSnapshotRange,
  'mcp.listHydrationAnomalies': handleListHydrationAnomalies,
  'mcp.triggerCalibrationReminder': handleTriggerCalibrationReminder,
  'mcp.syncCareTaskToNotion': handleSyncCareTaskToNotion,
  'mcp.runCodexTask': handleCodexExec,
  'mcp.listAppleShortcuts': handleListShortcuts,
  'mcp.runAppleShortcut': handleRunShortcut,
  'mcp.graph.query': handleGraphQuery,
  'mcp.graph.upsert': handleGraphUpsert,
  'mcp.fs.list': handleFsList,
  'mcp.fs.read': handleFsRead,
  'mcp.fs.write': handleFsWrite,
  'mcp.analytics.summarize': handleAnalyticsSummary,
  'mcp.analytics.regression': handleAnalyticsRegression,
  'mcp.cdp.fetchProfile': handleCdpFetchProfile,
  'mcp.cdp.logEvent': handleCdpLogEvent,
  'mcp.browser.fetchPage': handleBrowserFetch,
  'mcp.browser.search': handleBrowserSearch,
  'mcp.claude.ideCommand': handleClaudeIdeCommand,
}

export async function invokeLocalMcpTool(tool: string, args: unknown): Promise<{ output: string; data?: unknown }> {
  const handler = MCP_HANDLERS[tool]
  if (!handler) {
    throw new Error(`Unknown MCP tool: ${tool}`)
  }
  return handler(args)
}

export function listLocalMcpTools(): string[] {
  return Object.keys(MCP_HANDLERS)
}
type ShortcutListArgs = {
  filter?: string
  lang?: LanguageCode
}

type ShortcutRunArgs = {
  name?: string
  input?: string
  lang?: LanguageCode
}
