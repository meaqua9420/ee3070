import cors from 'cors'
import fs from 'node:fs'
import https from 'node:https'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import promClient from 'prom-client'
import webPush from 'web-push'
import { validateEnvOrExit } from './validateEnv'
import { DEFAULT_HISTORY_LIMIT, DEFAULT_SETTINGS } from './constants'
import { aiConfig } from './config'
import { globalSSEPool, TextStreamer, SSEConnection, type ThinkingPhase } from './streaming'
import { logger, createHttpLogger } from './logger'
import {
  analyzeVisionRisk,
  shouldTriggerAlert,
  formatRiskReport,
  type VisionRiskAnalysis,
} from './visionRiskAnalyzer'
import {
  initializeAlertManager,
  dispatchVisionRiskAlert,
} from './alertManager'
import { NativePushService } from './nativePushService'
import {
  initializeUltraManager,
  getUltraManager,
} from './ultraMode'
import {
  initializeAutoModeManager,
  startAutoMode,
  stopAutoMode,
  getAutoModeStatus,
} from './autoModeManager'
import { executeMcpTool, getMcpToolDefinitions, isMcpEnabled, isMcpTool } from './mcp'
import { invokeLocalMcpTool, listLocalMcpTools } from './mcpHandlers'
import { enforceCatOnlyAnswer, buildPolicyMessage } from './policyGuards'
import { classifyPromptSafety } from './safetyClassifier'
// 🔒 环境变量验证（在任何其他操作之前）
// Environment variable validation (before any other operations)
validateEnvOrExit()
import {
  loadHistory,
  loadLatestSnapshot,
  loadSettings as loadStoredSettings,
  loadCalibration,
  saveCalibration,
  savePushSubscription,
  saveNativePushDevice,
  listNativePushDevices,
  listPushSubscriptions,
  removePushSubscription,
  saveSettings as persistSettings,
  saveSnapshot as persistSnapshot,
  saveAutomationAlert,
  loadAutomationAlerts,
  listMemories,
  addMemory,
  updateMemory,
  removeMemory,
  listPinnedToolEvents,
  savePinnedToolEvent,
  removePinnedToolEvent,
  addNotificationFix,
  listNotificationFixes,
  listAlertRules,
  createAlertRule,
  updateAlertRule,
  removeAlertRule,
  listChatFavorites,
  saveChatFavorite,
  deleteChatFavorite,
  performDatabaseCleanup,
  getDatabaseStats,
  enqueueHardwareCommand,
  claimNextHardwareCommand,
  completeHardwareCommand,
  resetStaleHardwareCommands,
  getHardwareCommandById,
  listCareTasks,
  createCareTask,
  updateCareTaskStatus,
  removeCareTask,
  listCats,
  getCat,
  upsertCat,
  removeCat,
  listCarePlugins,
  upsertCarePlugin,
  updateCarePluginEnabled,
  deleteCarePlugin,
  loadDashboardLayoutPreference,
  saveDashboardLayoutPreference,
  saveCalibrationHistory,
  getCalibrationHistory,
  getCalibrationHistoryById,
  countCalibrationHistory,
  listPetProfiles,
  getPetProfile,
  createPetProfile,
  updatePetProfile,
  deletePetProfile,
} from './db'
import type {
  StoredPushSubscription,
  HardwareCommandRecord,
  MemoryEntryRecord,
  CalibrationHistoryRecord,
  NativePushTransport,
} from './db'
import { maybeStartSerialBridge, type SerialBridgeConnection } from './serialBridge'
import {
  generateChatContent,
  getChatMetrics,
  buildSystemPrompt,
  analyzeImageWithQwen,
  type ReasoningEffort,
  applyPersonaSignature,
} from './ai'
import {
  handleFileUpload,
  handleFileAnalyze,
  handleFileList,
  handleFileDelete,
  handleFileDownload,
} from './fileApi.js'
import {
  configureCameraFromEnv,
  fetchCameraSnapshotBuffer,
  getCameraRuntime,
  ingestCameraEvent,
  pollCameraStatus,
  updateCameraRuntimeFromReading,
  getCameraProxyTargets,
} from './camera'
import {
  buildSnapshot,
  deriveStatus,
  isSmartHomeReading,
  isSmartHomeSettings,
} from './utils'
import { buildProfessionalCareReport } from './reports'
import { synthesizeSpeech, listVoicePresets, type SynthesizeSpeechOptions } from './speech'
import { deriveCareInsights, deriveBehaviorForecast, suggestCareTasks, summarizeCalibrationAdjustment } from './analytics'
import { ensureBehaviorProfile, refreshBehaviorProfile } from './behaviorLearning'
import {
  validateImageUpload,
  validateDocumentUpload,
  VALIDATION_LIMITS,
  ALLOWED_IMAGE_MIME_TYPES,
} from './validators'
import { retrieveKnowledgeArticles, listKnowledgeArticles, buildKnowledgePrompt } from './knowledge'
import * as knowledgeExtractor from './knowledgeExtractor.js'
import * as proactiveAssistant from './proactiveAssistant.js'
import * as fileHandler from './fileHandler.js'
import { analyzePDF, generatePDFSummary } from './pdfParser.js'
import { analyzeDocumentAttachment } from './documentParser.js'
import { analyzeAudioWithAI, generateAudioSummary } from './audioAnalyzer.js'
import { analyzeVideoWithAI, generateVideoSummary } from './videoProcessor.js'
import {
  attachAuthContext,
  authenticateUser,
  getPublicUser,
  issueSession,
  invalidateSession,
  requireAuthenticated,
  requireDeveloper,
} from './auth'
import {
  validateAlertRule,
  validateMemory,
  validateTask,
  validatePlugin,
  validateQueryString,
  sanitizeString,
} from './validators'
import { ChatFavoritesService } from './services/chatFavoritesService'
import { createChatFavoritesRouter } from './routes/chatFavoritesRoutes'
import {
  getPreferredLanguage,
  resolveRequestLanguage,
  runWithLanguageContext,
  setPersistedLanguage,
} from './services/languageService'
import type {
  EquipmentTestResponse,
  LanguageCode,
  SmartHomeReading,
  SmartHomeSettings,
  SmartHomeSnapshot,
  CalibrationProfile,
  AutomationAlert,
  AlertMessageKey,
  ChatTool,
  ChatToolCall,
  ToolExecutionLog,
  MemoryEntry,
  MemoryType,
  NotificationFixLog,
  AlertRule,
  ChatFavorite,
  TextToSpeechResponsePayload,
  CareTask,
  CareTaskStatus,
  CareInsightCategory,
  CatProfile,
  AudioStatus,
  UvFanStatus,
  VisionStatus,
  VisionInference,
} from './types'

const app = express()
app.set('trust proxy', 1)
const chatFavoritesService = new ChatFavoritesService()
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function streamChunks(text: string): string[] {
  if (!text) return []
  const sentences = text.split(/(?<=[。！？?!])/u).map((chunk) => chunk.trim()).filter(Boolean)
  if (sentences.length === 0) {
    return [text]
  }
  return sentences
}

function sanitizeSystemPrompt(prompt: string): string {
  if (!prompt || typeof prompt !== 'string') {
    return ''
  }
  return prompt
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

function normalizeTaskToolPayload(data: unknown): { ok: true; payload: { title: string; description: string; category: string; dueAt?: string | null; metadata?: Record<string, unknown> } } | { ok: false; message: string } {
  const validation = validateTask(data)
  if (!validation.ok) {
    return { ok: false, message: validation.message ?? 'invalid-task' }
  }

  const raw = (data && typeof data === 'object' ? (data as Record<string, unknown>) : {}) ?? {}
  let dueAt: string | null | undefined
  if (typeof raw.dueAt === 'string' && raw.dueAt.trim().length > 0) {
    dueAt = raw.dueAt.trim()
  } else if (typeof raw.dueDate === 'string' && raw.dueDate.trim().length > 0) {
    dueAt = raw.dueDate.trim()
  } else if (typeof raw.dueInHours === 'number' && Number.isFinite(raw.dueInHours)) {
    dueAt = new Date(Date.now() + raw.dueInHours * 60 * 60 * 1000).toISOString()
  }

  const metadata = raw.metadata && typeof raw.metadata === 'object' ? (raw.metadata as Record<string, unknown>) : undefined

  return {
    ok: true,
    payload: {
      title: validation.value.title,
      description: validation.value.description ?? '',
      category: validation.value.category,
      dueAt: dueAt ?? undefined,
      metadata,
    },
  }
}

const TOOL_EVENT_HISTORY: Array<ToolExecutionLog & { timestamp: string }> = []
const MAX_TOOL_EVENTS = 20
const MEMORY_TYPES: MemoryType[] = ['note', 'conversation', 'setting']
const PINNED_TOOL_EVENTS = new Map<
  string,
  ToolExecutionLog & { timestamp: string; pinnedAt: string }
>()
const MAX_PINNED_TOOL_EVENTS = 50
const CARE_TASK_CATEGORIES: ReadonlySet<CareInsightCategory | 'general'> = new Set([
  'environment',
  'hydration',
  'nutrition',
  'behavior',
  'wellness',
  'safety',
  'maintenance',
  'general',
])

type CatPayload = {
  name: string
  avatarUrl?: string | null
  breed?: string | null
  birthdate?: string | null
  weightKg?: number | null
  notes?: string | null
  tags?: string[] | null
}

function validateCatPayload(data: unknown): { ok: true; value: CatPayload } | { ok: false; message: string } {
  if (!data || typeof data !== 'object') {
    return { ok: false, message: 'invalid-payload' }
  }

  const record = data as Record<string, unknown>
  const rawName = typeof record.name === 'string' ? record.name.trim() : ''
  if (!rawName) {
    return { ok: false, message: 'name-required' }
  }

  const payload: CatPayload = {
    name: rawName.slice(0, VALIDATION_LIMITS.MAX_SHORT_TEXT_LENGTH),
  }

  if (typeof record.avatarUrl === 'string') {
    payload.avatarUrl = record.avatarUrl.trim() || null
  }
  if (typeof record.breed === 'string') {
    payload.breed = record.breed.trim() || null
  }
  if (typeof record.birthdate === 'string') {
    payload.birthdate = record.birthdate.trim() || null
  }
  if (typeof record.notes === 'string') {
    payload.notes = record.notes.trim() || null
  }
  if (typeof record.weightKg === 'number' && Number.isFinite(record.weightKg)) {
    payload.weightKg = record.weightKg
  }
  if (Array.isArray(record.tags)) {
    const tags = record.tags
      .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
      .filter((tag) => tag.length > 0 && tag.length <= VALIDATION_LIMITS.MAX_SHORT_TEXT_LENGTH)
    payload.tags = tags.length > 0 ? tags : null
  }

  return { ok: true, value: payload }
}
const CARE_TASK_STATUS_VALUES: ReadonlySet<CareTaskStatus> = new Set(['pending', 'completed', 'dismissed'])
const SEARCH_PROXY_URL = process.env.SMARTCAT_SEARCH_PROXY_URL?.trim() || 'http://127.0.0.1:5858/search'
const SEARCH_PROXY_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.SMARTCAT_SEARCH_TIMEOUT_MS ?? '8000', 10)
  if (!Number.isFinite(raw) || raw <= 0) return 8000
  return Math.max(2000, Math.min(raw, 20000))
})()
// 🔧 FIX: Include all search-related tools (web search + MCP knowledge base search)
const SEARCH_TOOL_NAMES = new Set(['searchWeb', 'mcp.searchKnowledgeBase', 'mcp.browser.search'])
const MAX_SEARCH_CALLS_PER_REQUEST = 1

const SYSTEM_MEMORIES: Array<{ type: MemoryType; content: string; source: string }> = [
  {
    type: 'note',
    source: 'system',
    content:
      'Smart Cat Home AI 功能：1) 監測感測資料並整理快速摘要；2) 依照安全範圍呼叫 updateSettings 調整 Autoset（溫度 16-36°C、濕度 30%-70% 等）；3) 透過 updateCalibration 更新 FSR、超音波或亮度校正；4) 協助紀錄/查詢聊天備忘與收藏；5) 在感測風險或自訂警報觸發時提供即時建議與提醒。',
  },
  {
    type: 'note',
    source: 'system',
    content:
      '當使用者詢問「你能做什麼 / what can you do」時，請以友善語氣列出主要能力、可執行的工具，以及至少三個範例指令，例如：「把濕度調成 55%」、「幫我更新水碗校正 2.3 公分」、「分析這張睡覺照片」等，並邀請對方繼續提問。',
  },
]

function seedSystemMemories() {
  try {
    const existing = new Set(
      listMemories(500)
        .filter((entry) => entry.source === 'system')
        .map((entry) => entry.content.trim()),
    )
    for (const memory of SYSTEM_MEMORIES) {
      if (!existing.has(memory.content.trim())) {
        addMemory(memory)
      }
    }
  } catch (error) {
    logger.warn('[memories] Failed to seed system memories', error)
  }
}

seedSystemMemories()

for (const event of listPinnedToolEvents()) {
  PINNED_TOOL_EVENTS.set(event.timestamp, {
    tool: event.tool,
    success: event.success,
    message: event.message,
    args: event.args,
    durationMs: event.durationMs,
    output: event.output,
    timestamp: event.timestamp,
    pinnedAt: event.pinnedAt,
  })
}

let alertRulesCache: AlertRule[] = listAlertRules()

function refreshAlertRules() {
  alertRulesCache = listAlertRules()
}

function recordToolEvent(log: ToolExecutionLog) {
  const entry: ToolExecutionLog & { timestamp: string } = {
    tool: log.tool,
    success: log.success,
    message: log.message,
    timestamp: new Date().toISOString(),
  }

  if (typeof log.args !== 'undefined') {
    entry.args = log.args
  }
  if (typeof log.durationMs === 'number') {
    entry.durationMs = log.durationMs
  }
  if (typeof log.output === 'string') {
    entry.output = log.output
  }
  TOOL_EVENT_HISTORY.unshift(entry)
  if (TOOL_EVENT_HISTORY.length > MAX_TOOL_EVENTS) {
    TOOL_EVENT_HISTORY.length = MAX_TOOL_EVENTS
  }
  const pinned = PINNED_TOOL_EVENTS.get(entry.timestamp)
  if (pinned) {
    const updated: ToolExecutionLog & { timestamp: string; pinnedAt: string } = {
      tool: entry.tool,
      success: entry.success,
      message: entry.message,
      timestamp: entry.timestamp,
      pinnedAt: pinned.pinnedAt,
    }
    if (typeof entry.args !== 'undefined') {
      updated.args = entry.args
    }
    if (typeof entry.durationMs === 'number') {
      updated.durationMs = entry.durationMs
    }
    if (typeof entry.output === 'string') {
      updated.output = entry.output
    }
    PINNED_TOOL_EVENTS.set(entry.timestamp, updated)
    savePinnedToolEvent(updated)
  }
}

async function summarizeDocumentAttachmentBeforeChat(params: {
  attachment: DocumentAttachment
  requestedCatId: string
  userId: string
  toolEvents: ToolExecutionLog[]
  connection?: SSEConnection | null
}): Promise<string> {
  const { attachment, requestedCatId, userId, toolEvents, connection } = params
  const startAt = Date.now()
  const filename = attachment.filename ?? `document-${Date.now()}`
  const { analysis } = await analyzeDocumentAttachment({
    dataUrl: attachment.dataUrl,
    mimeType: attachment.mimeType,
    filename,
    userId,
    catId: requestedCatId,
  })

  const log: ToolExecutionLog = {
    tool: 'analyzeDocument',
    success: true,
    message: `Document analyzed: ${analysis.filename}`,
    args: { filename: analysis.filename, type: attachment.type },
    durationMs: Date.now() - startAt,
    output: analysis.summary,
  }

  toolEvents.push(log)
  recordToolEvent(log)
  connection?.sendTool(log.tool, log.args ?? undefined, log)

  return analysis.summary
}

function getRecentToolEvents(limit = 5) {
  if (limit <= 0) return []
  const pinned = new Set(PINNED_TOOL_EVENTS.keys())
  const results: Array<ToolExecutionLog & { timestamp: string }> = []
  for (const event of TOOL_EVENT_HISTORY) {
    if (pinned.has(event.timestamp)) {
      continue
    }
    results.push(event)
    if (results.length >= limit) break
  }
  return results
}

function getPinnedToolEvents() {
  return [...PINNED_TOOL_EVENTS.values()].sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt))
}

function enforcePinnedLimit() {
  if (PINNED_TOOL_EVENTS.size <= MAX_PINNED_TOOL_EVENTS) return
  const orderedOldestFirst = [...PINNED_TOOL_EVENTS.values()].sort((a, b) => a.pinnedAt.localeCompare(b.pinnedAt))
  while (orderedOldestFirst.length > MAX_PINNED_TOOL_EVENTS) {
    const removed = orderedOldestFirst.shift()
    if (!removed) break
    PINNED_TOOL_EVENTS.delete(removed.timestamp)
    removePinnedToolEvent(removed.timestamp)
  }
}

function constantTimeEqual(expected: string, received: string): boolean {
  const expectedBuf = Buffer.from(expected, 'utf8')
  const receivedBuf = Buffer.from(received, 'utf8')
  if (expectedBuf.length !== receivedBuf.length) {
    return false
  }
  return crypto.timingSafeEqual(expectedBuf, receivedBuf)
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'unknown-error'
}

function ensureHardwareAuthorized(req: express.Request, res: express.Response): boolean {
  if (!HARDWARE_API_KEY) {
    return true
  }

  const authHeader = req.headers.authorization ?? ''
  const normalized = authHeader.trim()
  if (!normalized.toLowerCase().startsWith('bearer ')) {
    res.status(401).json({ ok: false, message: 'hardware-unauthorized' })
    return false
  }

  const token = normalized.slice(7).trim()
  if (!token || !constantTimeEqual(HARDWARE_API_KEY, token)) {
    res.status(401).json({ ok: false, message: 'hardware-unauthorized' })
    return false
  }

  return true
}

function ensureAdminAuthorized(req: express.Request, res: express.Response): boolean {
  if (req.authUser?.role === 'developer') {
    return true
  }
  if (!ADMIN_API_KEY) {
    return true
  }

  const headerValue =
    typeof req.headers['x-smartcat-admin'] === 'string'
      ? req.headers['x-smartcat-admin']
      : Array.isArray(req.headers['x-smartcat-admin'])
        ? req.headers['x-smartcat-admin'][0]
        : typeof req.headers.authorization === 'string'
          ? req.headers.authorization
          : undefined

  if (!headerValue) {
    res.status(401).json({ ok: false, message: 'admin-unauthorized' })
    return false
  }

  const token = headerValue.toLowerCase().startsWith('bearer ')
    ? headerValue.slice(7).trim()
    : headerValue.trim()

  if (!token || !constantTimeEqual(ADMIN_API_KEY, token)) {
    res.status(401).json({ ok: false, message: 'admin-unauthorized' })
    return false
  }

  return true
}

function ensureDeveloperOrAdmin(req: express.Request, res: express.Response): boolean {
  if (req.authUser && req.authUser.role === 'developer') {
    return true
  }
  return ensureAdminAuthorized(req, res)
}

function serializeHardwareCommand(command: HardwareCommandRecord) {
  return {
    id: command.id,
    type: command.type,
    payload: typeof command.payload === 'undefined' ? null : command.payload,
    status: command.status,
    createdAt: command.createdAt,
    claimedAt: command.claimedAt ?? null,
    completedAt: command.completedAt ?? null,
    resultMessage: command.resultMessage ?? null,
  }
}

function claimHardwareCommandsBatch(limit = 2) {
  const claimed: HardwareCommandRecord[] = []
  for (let i = 0; i < limit; i += 1) {
    const next = claimNextHardwareCommand()
    if (!next) {
      break
    }
    claimed.push(next)
  }
  return claimed
}

function recordNotificationFix(step: NotificationFixLog['step'], success: boolean, message?: string) {
  const base: NotificationFixLog = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    step,
    success,
    timestamp: new Date().toISOString(),
  }
  const log: NotificationFixLog = message ? { ...base, message } : base
  addNotificationFix(log)
  return log
}

function isMemoryType(value: unknown): value is MemoryType {
  return typeof value === 'string' && (MEMORY_TYPES as readonly string[]).includes(value)
}

function isChatTool(value: unknown): value is ChatTool {
  return (
    value === 'updateSettings' ||
    value === 'updateCalibration' ||
    value === 'saveMemory' ||
    value === 'createCareTask' ||
    value === 'switchToProModel' ||
    value === 'searchWeb' ||
    value === 'playAudioPattern' ||
    value === 'stopAudioPlayback' ||
    value === 'refreshCameraStatus' ||
    value === 'hardwareControl'
  )
}

function normalizeToolEventPayload(payload: unknown): (ToolExecutionLog & { timestamp: string }) | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const { timestamp, tool, success, message } = record
  if (typeof timestamp !== 'string' || timestamp.length === 0) return null
  if (!isChatTool(tool)) return null
  if (typeof success !== 'boolean') return null
  if (typeof message !== 'string' || message.length === 0) return null

  const normalized: ToolExecutionLog & { timestamp: string } = {
    timestamp,
    tool,
    success,
    message,
  }

  if ('args' in record) {
    normalized.args = record.args
  }

  if (typeof record.durationMs === 'number' && Number.isFinite(record.durationMs)) {
    normalized.durationMs = record.durationMs
  }

  if (typeof record.output === 'string') {
    normalized.output = record.output
  }

  return normalized
}

const STOP_WORDS = new Set<string>([
  'the',
  'and',
  'with',
  'that',
  'this',
  'from',
  'into',
  'your',
  'have',
  'will',
  'just',
  'about',
  'when',
  'where',
  'what',
  'which',
  'then',
  'them',
  'they',
  'their',
  'been',
  'were',
  'than',
  'only',
  'also',
  'maybe',
  'should',
  'could',
  'would',
  'there',
  'here',
  'very',
  'more',
  'less',
  'some',
  'such',
  'even',
  'onto',
  'upon',
  'because',
  'while',
  'after',
  'before',
  'since',
  'please',
  'thanks',
  'thank',
  'https',
  'http',
  'www',
  'com',
  '使用',
  '以及',
  '我們',
  '現在',
  '需要',
  '如果',
])

function normalizeText(text: string) {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
}

function buildNGramVector(text: string, size = 3) {
  const normalized = normalizeText(text).replace(/\s+/g, ' ')
  const source = normalized.trim().length > 0 ? normalized.trim() : normalized
  const vector = new Map<string, number>()
  if (source.length === 0) return vector

  const padded = source.length < size ? source.padEnd(size, ' ') : source
  for (let index = 0; index <= padded.length - size; index += 1) {
    const gram = padded.slice(index, index + size)
    vector.set(gram, (vector.get(gram) ?? 0) + 1)
  }
  return vector
}

function tokenizeText(text: string) {
  const normalized = normalizeText(text)
  const tokens: string[] = []

  const wordMatches = normalized.match(/\p{L}[\p{L}\p{N}_-]*/gu)
  if (wordMatches) {
    for (const raw of wordMatches) {
      const token = raw.replace(/[_-]+/g, '')
      if (token.length >= 2 && !STOP_WORDS.has(token)) {
        tokens.push(token)
      }
    }
  }

  if (tokens.length === 0) {
    const numericMatches = normalized.match(/\d+(?:\.\d+)?/g)
    if (numericMatches) {
      tokens.push(...numericMatches)
    }
  }

  if (tokens.length === 0) {
    const cjkMatches = normalized.match(/[\p{Script=Han}]/gu)
    if (cjkMatches) {
      tokens.push(...cjkMatches)
    }
  }

  return tokens.slice(0, 50)
}

function buildTermFrequency(tokens: string[]) {
  const map = new Map<string, number>()
  for (const token of tokens) {
    map.set(token, (map.get(token) ?? 0) + 1)
  }
  return map
}

function computeVector(
  termFrequency: Map<string, number>,
  documentFrequency: Map<string, number>,
  totalDocs: number,
) {
  const vector = new Map<string, number>()
  for (const [token, count] of termFrequency) {
    const tf = 1 + Math.log(count)
    const df = documentFrequency.get(token) ?? 0
    const idf = Math.log(1 + totalDocs / (1 + df))
    vector.set(token, tf * idf)
  }
  return vector
}

function vectorMagnitude(vector: Map<string, number>) {
  let sum = 0
  for (const value of vector.values()) {
    sum += value * value
  }
  return Math.sqrt(sum)
}

function cosineSimilarity(
  vectorA: Map<string, number>,
  vectorB: Map<string, number>,
  magnitudeB?: number,
) {
  if (vectorA.size === 0 || vectorB.size === 0) return 0
  const magnitudeA = vectorMagnitude(vectorA)
  const magB = typeof magnitudeB === 'number' ? magnitudeB : vectorMagnitude(vectorB)
  if (magnitudeA === 0 || magB === 0) return 0
  let dot = 0
  for (const [token, value] of vectorA) {
    const other = vectorB.get(token)
    if (typeof other === 'number') {
      dot += value * other
    }
  }
  if (dot === 0) return 0
  return dot / (magnitudeA * magB)
}

function daysSince(timestamp: string) {
  const createdAt = new Date(timestamp)
  if (Number.isNaN(createdAt.getTime())) return Number.POSITIVE_INFINITY
  const diffMs = Date.now() - createdAt.getTime()
  return diffMs > 0 ? diffMs / (1000 * 60 * 60 * 24) : 0
}

const ALERT_RULE_METRIC_LABELS: Record<AlertRule['metric'], string> = {
  temperatureC: 'temperature (°C)',
  humidityPercent: 'humidity (%)',
  waterLevelPercent: 'water level (%)',
  ambientLightPercent: 'ambient light (%)',
  waterIntakeMl: 'water intake (ml)',
  airQualityIndex: 'air quality index',
  catWeightKg: 'cat weight (kg)',
  lastFeedingMinutesAgo: 'minutes since feeding',
}

const ALERT_RULE_METRICS = new Set<AlertRule['metric']>(Object.keys(ALERT_RULE_METRIC_LABELS) as AlertRule['metric'][])
const ALERT_RULE_COMPARISONS = new Set<AlertRule['comparison']>(['above', 'below'])
const ALERT_RULE_SEVERITIES = new Set<AlertRule['severity']>(['info', 'warning', 'critical'])
const CHAT_ROLES = new Set<ChatFavorite['role']>(['user', 'assistant', 'system'])

type MemoryFeatureCacheEntry = {
  signature: string
  tokenSet: Set<string>
  termFrequency: Map<string, number>
  ngramVector: Map<string, number>
  lowerContent: string
}

const memoryFeatureCache = new Map<number, MemoryFeatureCacheEntry>()

function buildMemorySignature(entry: MemoryEntryRecord): string {
  return `${entry.content}||${entry.source}||${entry.type}||${entry.createdAt}`
}

function getMemoryFeatures(entry: MemoryEntryRecord): MemoryFeatureCacheEntry {
  const existing = memoryFeatureCache.get(entry.id)
  const signature = buildMemorySignature(entry)
  if (existing && existing.signature === signature) {
    return existing
  }

  const combined = `${entry.content} ${entry.source}`
  const tokens = tokenizeText(combined)
  const features: MemoryFeatureCacheEntry = {
    signature,
    tokenSet: new Set(tokens),
    termFrequency: buildTermFrequency(tokens),
    ngramVector: buildNGramVector(combined),
    lowerContent: entry.content.toLowerCase(),
  }

  memoryFeatureCache.set(entry.id, features)
  return features
}

function getMetricValue(reading: SmartHomeReading, metric: AlertRule['metric']): number | undefined {
  const record = reading as unknown as Record<string, unknown>
  const value = record[metric]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  return undefined
}

function evaluateAlertRules(reading: SmartHomeReading) {
  for (const rule of alertRulesCache) {
    if (!rule.enabled) continue
    const value = getMetricValue(reading, rule.metric)
    if (typeof value !== 'number') continue
    const triggered = rule.comparison === 'above' ? value > rule.threshold : value < rule.threshold
    if (!triggered) continue
    const metricLabel = ALERT_RULE_METRIC_LABELS[rule.metric] ?? rule.metric
    const message = rule.message
      ? rule.message
      : rule.comparison === 'above'
        ? `Custom alert: ${metricLabel} (${value.toFixed(1)}) exceeded ${rule.threshold}.`
        : `Custom alert: ${metricLabel} (${value.toFixed(1)}) fell below ${rule.threshold}.`
    pushAlert({ message: `${message} [rule-${rule.id}]`, severity: rule.severity })
  }
}

// 🧠 Memory Search Performance Optimization
// Cache document frequency globally to avoid O(n²) recalculation on every search
interface MemorySearchCache {
  documentFrequency: Map<string, number>
  totalDocs: number
  lastUpdated: string
}

let memorySearchCache: MemorySearchCache | null = null
let isRebuildingCache = false // Guard against re-entry

function rebuildMemorySearchCache() {
  if (isRebuildingCache) {
    logger.warn('[memory] ⚠️  Cache rebuild already in progress, skipping')
    return
  }

  isRebuildingCache = true
  try {
    const MAX_CANDIDATES = 200
    const rawEntries = listMemories(MAX_CANDIDATES).filter((entry) => isMemoryType(entry.type))

    const documentFrequency = new Map<string, number>()
    for (const entry of rawEntries) {
      const features = getMemoryFeatures(entry)
      for (const token of features.tokenSet) {
        documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
      }
    }

    memorySearchCache = {
      documentFrequency,
      totalDocs: rawEntries.length,
      lastUpdated: new Date().toISOString(),
    }

    logger.info(`[memory] search cache rebuilt: ${rawEntries.length} documents, ${documentFrequency.size} unique tokens`)
  } finally {
    isRebuildingCache = false
  }
}

// Rebuild cache every 5 minutes
setInterval(() => {
  rebuildMemorySearchCache()
}, 5 * 60 * 1000)

function loadRelevantMemories(question: string, limit = 5): MemoryEntry[] {
  const MAX_CANDIDATES = 200
  const rawEntries = listMemories(MAX_CANDIDATES).filter((entry) => isMemoryType(entry.type))
  if (rawEntries.length === 0) {
    return []
  }

  // Use cached document frequency or rebuild if needed
  if (!memorySearchCache || memorySearchCache.totalDocs !== rawEntries.length) {
    logger.info(`[memory] 🔄 Cache rebuild triggered: cached=${memorySearchCache?.totalDocs ?? 'null'}, actual=${rawEntries.length}`)
    rebuildMemorySearchCache()
  }

  const documentFrequency = memorySearchCache!.documentFrequency
  const totalDocs = memorySearchCache!.totalDocs

  const prepared = rawEntries.map((entry) => {
    const memory = {
      id: entry.id,
      type: entry.type as MemoryType,
      content: entry.content,
      source: entry.source,
      createdAt: entry.createdAt,
    }
    const features = getMemoryFeatures(entry)
    return { memory, features }
  })

  const questionTokens = tokenizeText(question)
  const questionNGramVector = buildNGramVector(question)
  const questionNGramMagnitude = vectorMagnitude(questionNGramVector)

  if (questionTokens.length === 0) {
    const ngramCandidates =
      questionNGramVector.size > 0
        ? prepared
            .map((item, index) => ({
              memory: item.memory,
              score: cosineSimilarity(item.features.ngramVector, questionNGramVector, questionNGramMagnitude),
              index,
            }))
            .filter((item) => item.score > 0)
            .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index))
            .slice(0, limit)
            .map((item) => item.memory)
        : []

    if (ngramCandidates.length > 0) {
      return ngramCandidates
    }

    return prepared
      .slice()
      .sort(
        (a, b) =>
          new Date(b.memory.createdAt).getTime() - new Date(a.memory.createdAt).getTime(),
      )
      .slice(0, limit)
      .map((entry) => entry.memory)
  }

  const queryTf = buildTermFrequency(questionTokens)
  const queryVector = computeVector(queryTf, documentFrequency, totalDocs)
  const queryMagnitude = vectorMagnitude(queryVector)

  const scored = prepared
    .map((item, index) => {
      const vector = computeVector(item.features.termFrequency, documentFrequency, totalDocs)
      const similarity = cosineSimilarity(vector, queryVector, queryMagnitude)
      const typeBoost = (() => {
        switch (item.memory.type) {
          case 'setting':
            return 1.3
          case 'note':
            return 1.2
          case 'conversation':
            return 1.1
          default:
            return 1
        }
      })()
      const recencyBoost = (() => {
        const ageDays = daysSince(item.memory.createdAt)
        if (!Number.isFinite(ageDays)) return 1
        if (ageDays <= 3) return 1.4
        if (ageDays <= 14) return 1.2
        if (ageDays <= 60) return 1.05
        return 1
      })()
      const keywordBonus = questionTokens.reduce((total, token) => {
        return item.features.lowerContent.includes(token) ? total + 0.05 : total
      }, 0)
      const ngramSimilarity =
        questionNGramMagnitude > 0
          ? cosineSimilarity(item.features.ngramVector, questionNGramVector, questionNGramMagnitude)
          : 0
      const finalScore = similarity * typeBoost * recencyBoost + keywordBonus + ngramSimilarity * 0.4
      return { memory: item.memory, score: finalScore, index }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.index - b.index
    })
    .slice(0, limit)
    .map((item) => item.memory)

  if (scored.length > 0) {
    return scored
  }

  if (questionNGramVector.size > 0) {
    const fallbackByNGram = prepared
      .map((item, index) => ({
        memory: item.memory,
        score: cosineSimilarity(item.features.ngramVector, questionNGramVector, questionNGramMagnitude),
        index,
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index))
      .slice(0, limit)
      .map((item) => item.memory)

    if (fallbackByNGram.length > 0) {
      return fallbackByNGram
    }
  }

  return prepared
    .slice()
    .sort(
      (a, b) =>
        new Date(b.memory.createdAt).getTime() - new Date(a.memory.createdAt).getTime(),
    )
    .slice(0, limit)
    .map((entry) => entry.memory)
}

function findLastMessageByRole<T extends { role?: string }>(
  messages: T[],
  role: 'user' | 'assistant' | 'system',
): T | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index]
    if (candidate && candidate.role === role) {
      return candidate
    }
  }
  return null
}

function getMemoryKeywordStats(limit = 20) {
  const entries = listMemories(200)
  const counts = new Map<string, number>()

  for (const entry of entries) {
    const tokens = tokenizeText(entry.content)
    const typeWeight = entry.type === 'setting' ? 1.35 : entry.type === 'note' ? 1.2 : 1.05
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + typeWeight)
    }
  }

  const sorted = Array.from(counts.entries())
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword, score]) => ({ keyword, score }))

  return sorted
}

function buildDiagnosticReport(): string {
  const now = new Date().toISOString()
  const chatMetrics = getChatMetrics()
  const recentToolEvents = getRecentToolEvents(5)
  const pinned = getPinnedToolEvents()
  const fixes = listNotificationFixes(10)
  const favorites = listChatFavorites()
  const keywordStats = getMemoryKeywordStats(10)
  const lines: string[] = []

  lines.push('Smart Cat Home Diagnostic Report')
  lines.push(`Generated at: ${now}`)
  lines.push('')

  if (latestSnapshot) {
    lines.push('Latest Snapshot:')
    lines.push(`  Timestamp: ${latestSnapshot.reading.timestamp}`)
    lines.push(`  Temperature: ${latestSnapshot.reading.temperatureC} °C`)
    lines.push(`  Humidity: ${latestSnapshot.reading.humidityPercent}%`)
    if (typeof latestSnapshot.reading.waterLevelPercent === 'number') {
      lines.push(`  Water level: ${latestSnapshot.reading.waterLevelPercent}%`)
    }
    lines.push(`  Air Quality Index: ${latestSnapshot.reading.airQualityIndex}`)
  } else {
    lines.push('Latest Snapshot: none')
  }

  lines.push('')
  lines.push('AI Inference Metrics:')
  lines.push(`  Provider: ${chatMetrics.provider ?? 'unknown'}`)
  lines.push(`  Source: ${chatMetrics.source ?? 'unknown'}`)
  lines.push(`  Duration (ms): ${chatMetrics.durationMs ?? 'n/a'}`)
  lines.push(`  Updated: ${chatMetrics.updatedAt ?? 'n/a'}`)
  if (chatMetrics.error) {
    lines.push(`  Error: ${chatMetrics.error}`)
  }

  lines.push('')
  lines.push('Custom Alert Rules:')
  if (alertRulesCache.length === 0) {
    lines.push('  (none)')
  } else {
    for (const rule of alertRulesCache) {
      const status = rule.enabled ? 'enabled' : 'disabled'
      lines.push(
        `  [${rule.id}] ${rule.metric} ${rule.comparison} ${rule.threshold} -> ${rule.severity} (${status})${rule.message ? ` :: ${rule.message}` : ''}`,
      )
    }
  }

  lines.push('')
  lines.push('Recent Tool Events:')
  if (recentToolEvents.length === 0) {
    lines.push('  (none)')
  } else {
    for (const event of recentToolEvents) {
      lines.push(
        `  [${event.timestamp}] ${event.tool} :: ${event.success ? 'success' : 'failed'} (${event.message})`,
      )
    }
  }

  lines.push('')
  lines.push('Pinned Tool Events:')
  if (pinned.length === 0) {
    lines.push('  (none)')
  } else {
    for (const event of pinned) {
      lines.push(
        `  [${event.timestamp}] ${event.tool} :: ${event.success ? 'success' : 'failed'} (${event.message})`,
      )
    }
  }

  lines.push('')
  lines.push('Notification Fix Attempts:')
  if (fixes.length === 0) {
    lines.push('  (none)')
  } else {
    for (const fix of fixes) {
      lines.push(
        `  [${fix.timestamp}] ${fix.step} => ${fix.success ? 'success' : 'failure'}${fix.message ? ` :: ${fix.message}` : ''}`,
      )
    }
  }

  lines.push('')
  lines.push(`Chat Favorites (${favorites.length}):`)
  if (favorites.length === 0) {
    lines.push('  (none)')
  } else {
    for (const favorite of favorites.slice(0, 5)) {
      const preview = favorite.content.length > 160 ? `${favorite.content.slice(0, 157)}…` : favorite.content
      lines.push(`  [${favorite.createdAt}] ${favorite.role}: ${preview}`)
    }
    if (favorites.length > 5) {
      lines.push(`  ... ${favorites.length - 5} more`)
    }
  }

  lines.push('')
  lines.push('Memory Keyword Highlights:')
  if (keywordStats.length === 0) {
    lines.push('  (none)')
  } else {
    for (const keyword of keywordStats) {
      lines.push(`  ${keyword.keyword}: ${keyword.score.toFixed(2)}`)
    }
  }

  return lines.join('\n')
}

function parseAlertRuleCreatePayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const metric = record.metric
  const comparison = record.comparison
  const threshold = record.threshold
  const severity = record.severity
  const enabled = record.enabled
  const message = typeof record.message === 'string' && record.message.trim().length > 0 ? record.message.trim() : undefined

  if (typeof metric !== 'string' || !ALERT_RULE_METRICS.has(metric as AlertRule['metric'])) return null
  if (typeof comparison !== 'string' || !ALERT_RULE_COMPARISONS.has(comparison as AlertRule['comparison'])) return null
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) return null
  if (typeof severity !== 'string' || !ALERT_RULE_SEVERITIES.has(severity as AlertRule['severity'])) return null

  const result: {
    metric: AlertRule['metric']
    comparison: AlertRule['comparison']
    threshold: number
    severity: AlertRule['severity']
    message?: string
    enabled: boolean
  } = {
    metric: metric as AlertRule['metric'],
    comparison: comparison as AlertRule['comparison'],
    threshold,
    severity: severity as AlertRule['severity'],
    enabled: typeof enabled === 'boolean' ? enabled : true,
  }

  if (message) {
    result.message = message
  }

  return result
}

function parseAlertRuleUpdatePayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const comparison = record.comparison
  const threshold = record.threshold
  const severity = record.severity
  const enabled = record.enabled
  const message = typeof record.message === 'string' && record.message.trim().length > 0 ? record.message.trim() : undefined

  if (typeof comparison !== 'string' || !ALERT_RULE_COMPARISONS.has(comparison as AlertRule['comparison'])) return null
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) return null
  if (typeof severity !== 'string' || !ALERT_RULE_SEVERITIES.has(severity as AlertRule['severity'])) return null
  if (typeof enabled !== 'boolean') return null

  const result: {
    comparison: AlertRule['comparison']
    threshold: number
    severity: AlertRule['severity']
    enabled: boolean
    message?: string
  } = {
    comparison: comparison as AlertRule['comparison'],
    threshold,
    severity: severity as AlertRule['severity'],
    enabled,
  }

  if (message) {
    result.message = message
  }

  return result
}

function isNotificationFixStep(value: unknown): value is NotificationFixLog['step'] {
  return value === 'permission' || value === 'serviceWorker' || value === 'subscription' || value === 'backend'
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const HELMET_CONNECT_SRC = (() => {
  const sources = new Set<string>(["'self'"])
  for (const origin of ALLOWED_ORIGINS) {
    if (!origin) continue
    if (origin.startsWith('http://') || origin.startsWith('https://')) {
      sources.add(origin)
      continue
    }
    sources.add(`http://${origin}`)
    sources.add(`https://${origin}`)
  }
  return Array.from(sources)
})()

const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const FORCE_HTTPS = (() => {
  const raw = (process.env.FORCE_HTTPS ?? '').trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'yes'
})()

// In production, CORS must be explicitly configured
if (IS_PRODUCTION && ALLOWED_ORIGINS.length === 0) {
  logger.error('⚠️  SECURITY WARNING: ALLOWED_ORIGINS not configured in production environment!')
  logger.error('⚠️  Set ALLOWED_ORIGINS environment variable to allowed frontend origins.')
  logger.error('⚠️  Example: ALLOWED_ORIGINS=https://example.com,https://app.example.com')
}

// Block wildcard (*) in production
if (IS_PRODUCTION && ALLOWED_ORIGINS.includes('*')) {
  logger.error('⚠️  SECURITY ERROR: Wildcard (*) is not allowed in ALLOWED_ORIGINS in production!')
  logger.error('⚠️  Please specify exact origins instead of using "*".')
  process.exit(1)
}

function originMatchesRule(origin: string, rule: string) {
  if (rule === '*') return true

  try {
    const originUrl = new URL(origin)
    const originHost = originUrl.hostname.toLowerCase()
    const originProtocol = originUrl.protocol
    const originPort = originUrl.port

    if (rule.startsWith('capacitor://') || rule.startsWith('ionic://')) {
      return origin.toLowerCase() === rule.toLowerCase()
    }

    if (rule.startsWith('http://') || rule.startsWith('https://')) {
      try {
        const ruleUrl = new URL(rule)
        const rulePort = ruleUrl.port || (ruleUrl.protocol === 'https:' ? '443' : '80')
        const candidatePort = originPort || (originProtocol === 'https:' ? '443' : '80')
        return (
          originProtocol === ruleUrl.protocol &&
          originHost === ruleUrl.hostname.toLowerCase() &&
          candidatePort === rulePort
        )
      } catch {
        return origin === rule
      }
    }

    if (rule.startsWith('*.')) {
      const domain = rule.slice(2).toLowerCase()
      return originHost === domain || originHost.endsWith(`.${domain}`)
    }

    const [ruleHost, rulePort] = rule.toLowerCase().split(':')
    if (rulePort) {
      const candidatePort = originPort || (originProtocol === 'https:' ? '443' : '80')
      return originHost === ruleHost && candidatePort === rulePort
    }
    return originHost === ruleHost
  } catch {
    return false
  }
}

function parseNumericEnv(value: string | undefined, fallback: number) {
  if (typeof value === 'undefined') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const JSON_BODY_LIMIT = (() => {
  const raw = (process.env.JSON_BODY_LIMIT ?? '').trim()
  return raw.length > 0 ? raw : '80mb' // Increased default to 80mb so the frontend can upload ∼50mb files (base64 expands payload size)
})()

const REQUEST_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.REQUEST_TIMEOUT_MS ?? '', 10)
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 120000) : 60000 // Default 60s, max 120s
})()
const PROMETHEUS_ENABLED = (() => {
  const raw = (process.env.PROMETHEUS_METRICS ?? '').trim().toLowerCase()
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false
  return true
})()

app.use(
  cors({
    origin: (origin, callback) => {
      // No origin (e.g., server-side request, Postman, curl) - allow in dev, reject in prod
      if (!origin) {
        if (IS_PRODUCTION) {
          callback(new Error('Origin header required in production'), false)
          return
        }
        callback(null, true)
        return
      }

      // Empty allowlist - allow all in development, reject all in production
      if (ALLOWED_ORIGINS.length === 0) {
        if (IS_PRODUCTION) {
          logger.warn(`[CORS] Rejected origin (no allowlist configured): ${origin}`)
          callback(new Error('CORS not configured'), false)
          return
        }
        // Development mode: allow all
        callback(null, true)
        return
      }

      // Check against allowlist
      const allowed = ALLOWED_ORIGINS.some((rule) => originMatchesRule(origin, rule))
      if (!allowed) {
        logger.warn(`[CORS] Rejected origin: ${origin} (not in allowlist)`)
      }
      callback(allowed ? null : new Error('Origin not allowed'), allowed)
    },
    credentials: true,
  }),
)

// 🔒 安全標頭 (Security Headers)
// Helmet 幫助設定各種 HTTP 安全標頭來保護應用程式
// Helmet helps set various HTTP security headers to protect the application
app.use(
  helmet({
    // 🔒 啟用內容安全政策（Content Security Policy）/ Enable CSP
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // React可能需要 inline scripts
        styleSrc: ["'self'", "'unsafe-inline'"], // React inline styles
        imgSrc: ["'self'", 'data:', 'blob:'], // 允許 data URIs 和 blob 圖片
        connectSrc: HELMET_CONNECT_SRC, // API 請求允許清單
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"], // 禁止 Flash 等 plugins
        mediaSrc: ["'self'", 'blob:'], // 音訊/視訊檔案
        frameSrc: ["'none'"], // 禁止 iframe 嵌入
        upgradeInsecureRequests: [], // 自動升級 HTTP 到 HTTPS
      },
    },
    crossOriginEmbedderPolicy: false, // 允許跨域嵌入（PWA 需要）
    crossOriginResourcePolicy: {
      policy: 'cross-origin', // 允許前端使用跨來源 fetch 取得 API
    },
    // 其他安全標頭 helmet 會自動啟用：
    // - X-Content-Type-Options: nosniff
    // - X-Frame-Options: SAMEORIGIN
    // - X-XSS-Protection: 0 (modern browsers use CSP)
    // - Strict-Transport-Security (HTTPS only)
  }),
)

// 🔒 HTTPS 強制重定向 / HTTPS Enforcement
// 在生產環境中，強制所有 HTTP 請求重定向到 HTTPS
// In production, force all HTTP requests to redirect to HTTPS
if (FORCE_HTTPS) {
  app.use((req, res, next) => {
    // 檢查是否為 HTTPS 連接
    // Check if connection is already HTTPS
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https'

    if (!isSecure) {
      // 構建 HTTPS URL / Build HTTPS URL
      const host = req.headers.host || req.hostname
      const httpsUrl = `https://${host}${req.url}`

      logger.info(`[https] Redirecting HTTP request to HTTPS: ${req.url}`)

      // 使用 301 永久重定向 / Use 301 permanent redirect
      res.redirect(301, httpsUrl)
      return
    }

    next()
  })
  logger.info('[https] HTTPS enforcement enabled - HTTP requests will be redirected')
} else {
  logger.info('[https] HTTPS enforcement disabled (set FORCE_HTTPS=true to enable)')
}

// 🔒 速率限制（可配置）/ Rate Limiting (configurable)
// 环境变量配置 / Environment variable configuration
const RATE_LIMIT_GENERAL_WINDOW_MS = Number.parseInt(
  process.env.RATE_LIMIT_GENERAL_WINDOW_MS ?? '900000',
  10,
) // 默认 15 分钟 / Default 15 minutes
const RATE_LIMIT_GENERAL_MAX = Number.parseInt(
  process.env.RATE_LIMIT_GENERAL_MAX ?? '100',
  10,
) // 默认 100 请求 / Default 100 requests
const RATE_LIMIT_CHAT_WINDOW_MS = Number.parseInt(
  process.env.RATE_LIMIT_CHAT_WINDOW_MS ?? '300000',
  10,
) // 默认 5 分钟 / Default 5 minutes
const RATE_LIMIT_CHAT_MAX = Number.parseInt(
  process.env.RATE_LIMIT_CHAT_MAX ?? '10',
  10,
) // 默认 10 请求 / Default 10 requests

// 一般 API 限制 / General API rate limiting
const generalLimiter = rateLimit({
  windowMs: RATE_LIMIT_GENERAL_WINDOW_MS,
  max: RATE_LIMIT_GENERAL_MAX,
  message: { ok: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true, // 在 `RateLimit-*` 标头返回速率限制信息 / Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // 停用 `X-RateLimit-*` 标头 / Disable `X-RateLimit-*` headers
})

// AI 聊天限制（避免滥用昂贵的 AI 运算）/ AI chat rate limiting (avoid abuse of expensive AI computation)
const chatLimiter = rateLimit({
  windowMs: RATE_LIMIT_CHAT_WINDOW_MS,
  max: RATE_LIMIT_CHAT_MAX,
  message: { ok: false, message: 'Too many AI chat requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const RATE_LIMIT_TTS_WINDOW_MS = Math.max(
  30_000,
  parseNumericEnv(process.env.RATE_LIMIT_TTS_WINDOW_MS, 60_000),
)
const RATE_LIMIT_TTS_MAX = Math.max(1, parseNumericEnv(process.env.RATE_LIMIT_TTS_MAX, 6))
const ttsLimiter = rateLimit({
  windowMs: RATE_LIMIT_TTS_WINDOW_MS,
  max: RATE_LIMIT_TTS_MAX,
  message: { ok: false, message: 'Too many TTS requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// 🔒 登入速率限制（防止暴力破解攻擊）/ Login rate limiting (prevent brute force attacks)
const RATE_LIMIT_LOGIN_WINDOW_MS = Math.max(
  60_000, // Minimum 1 minute / 最少 1 分鐘
  parseNumericEnv(process.env.RATE_LIMIT_LOGIN_WINDOW_MS, 900_000), // Default 15 minutes / 預設 15 分鐘
)
const RATE_LIMIT_LOGIN_MAX = Math.max(1, parseNumericEnv(process.env.RATE_LIMIT_LOGIN_MAX, 5)) // Default 5 attempts / 預設 5 次
const loginLimiter = rateLimit({
  windowMs: RATE_LIMIT_LOGIN_WINDOW_MS,
  max: RATE_LIMIT_LOGIN_MAX,
  message: {
    ok: false,
    message: 'Too many login attempts. Please try again later.',
    retryAfter: Math.ceil(RATE_LIMIT_LOGIN_WINDOW_MS / 1000), // Seconds / 秒數
  },
  standardHeaders: true,
  legacyHeaders: false,
  // 跳過成功的登入請求，只計算失敗的嘗試 / Skip successful logins, only count failed attempts
  skipSuccessfulRequests: true,
})

logger.info(`[rate-limit] General: ${RATE_LIMIT_GENERAL_MAX} requests per ${RATE_LIMIT_GENERAL_WINDOW_MS / 1000}s`)
logger.info(`[rate-limit] Chat: ${RATE_LIMIT_CHAT_MAX} requests per ${RATE_LIMIT_CHAT_WINDOW_MS / 1000}s`)
logger.info(`[rate-limit] TTS: ${RATE_LIMIT_TTS_MAX} requests per ${RATE_LIMIT_TTS_WINDOW_MS / 1000}s`)
logger.info(`[rate-limit] Login: ${RATE_LIMIT_LOGIN_MAX} attempts per ${RATE_LIMIT_LOGIN_WINDOW_MS / 1000}s (failed attempts only)`)


// 套用一般速率限制到所有路由 / Apply general rate limiting to all routes
app.use(generalLimiter)

app.use(express.json({ limit: JSON_BODY_LIMIT }))
app.use(createHttpLogger())

const TIMEOUT_EXEMPT_PATHS = new Set([
  '/api/chat/suggestions',
  '/api/chat/stream',
])

// Request timeout middleware
app.use((req, res, next) => {
  const acceptHeader = typeof req.headers.accept === 'string' ? req.headers.accept : ''
  const isSse = acceptHeader.includes('text/event-stream')
  const path = typeof req.path === 'string' ? req.path : req.url ?? ''
  const skipTimeout = isSse || TIMEOUT_EXEMPT_PATHS.has(path)

  if (skipTimeout) {
    // Disable per-request socket timeouts so long-lived SSE/AI calls can finish normally
    req.setTimeout(0)
    res.setTimeout(0)
    return next()
  }

  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(408).json({ ok: false, message: 'request-timeout' })
    }
  })
  res.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(408).json({ ok: false, message: 'response-timeout' })
    }
  })
  next()
})

app.use((req, _res, next) => {
  attachAuthContext(req)
  next()
})

app.get('/api/mcp/tools', (_req, res) => {
  const definitions = getMcpToolDefinitions()
  const tools = definitions.map((entry) => ({
    name: entry.function.name,
    description: typeof entry.function.description === 'string' ? entry.function.description : '',
    parameters:
      entry.function.parameters && typeof entry.function.parameters === 'object'
        ? entry.function.parameters
        : null,
  }))
  res.json({
    ok: true,
    data: {
      enabled: isMcpEnabled(),
      count: tools.length,
      tools,
    },
  })
})

app.post('/mcp/invoke', async (req, res) => {
  const tool = typeof req.body?.tool === 'string' ? req.body.tool.trim() : ''
  const args = req.body?.args ?? {}
  if (!tool) {
    res.status(400).json({ ok: false, message: 'missing-tool' })
    return
  }
  if (!listLocalMcpTools().includes(tool)) {
    res.status(404).json({ ok: false, message: `unknown-tool:${tool}` })
    return
  }
  try {
    const result = await invokeLocalMcpTool(tool, args)
    const payload = {
      tool,
      output: result.output,
      payload: result.data ?? null,
    }
    res.json({
      ok: true,
      ...payload,
      data: payload,
    })
  } catch (error) {
    logger.error('[mcp] Local handler failed:', error)
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : 'mcp-handler-error',
    })
  }
})

const HISTORY_LIMIT = Math.max(1, parseNumericEnv(process.env.HISTORY_LIMIT, DEFAULT_HISTORY_LIMIT))
const ALERT_HISTORY_LIMIT = Math.max(1, parseNumericEnv(process.env.ALERT_HISTORY_LIMIT, 50))
const PUSH_BATCH_SIZE = Math.max(1, parseNumericEnv(process.env.PUSH_BATCH_SIZE, 10))
const PUSH_BATCH_DELAY_MS = Math.max(0, parseNumericEnv(process.env.PUSH_BATCH_DELAY_MS, 200))

function indicatesWebSearch(text: string): boolean {
  if (!text) return false
  const lowered = text.toLowerCase()
  return (
    lowered.includes('search') ||
    lowered.includes('look up') ||
    lowered.includes('google') ||
    /上網查|網路搜尋|幫我查|查一下/.test(text)
  )
}
const MAX_TOOL_CALL_ITERATIONS = Math.max(
  2,
  parseNumericEnv(process.env.MAX_TOOL_CALL_ITERATIONS, 5),
)

async function evaluateUltraSafetyDecision(input: string, language: LanguageCode) {
  let decision = enforceCatOnlyAnswer(input, language)
  if (!decision) {
    const classifierDecision = await classifyPromptSafety(input, language)
    if (classifierDecision && classifierDecision.label !== 'allow') {
      const violation = classifierDecision.label === 'non-cat' ? 'non_cat' : 'prompt_injection'
      decision = {
        reason: violation,
        message: classifierDecision.reason?.trim().length
          ? classifierDecision.reason.trim()
          : buildPolicyMessage(violation, language),
      }
    }
  }
  if (decision) {
    return decision
  }
  return null
}

const storedSettings = loadStoredSettings()

const DEFAULT_CAT_ID = 'default'
const DEFAULT_CAT_NAME = 'Neko'
const catRegistry = new Map<string, CatProfile>()
for (const cat of listCats()) {
  catRegistry.set(cat.id, cat)
}
if (!catRegistry.has(DEFAULT_CAT_ID)) {
  const fallback = upsertCat({ id: DEFAULT_CAT_ID, name: DEFAULT_CAT_NAME })
  catRegistry.set(fallback.id, fallback)
}

let activeCatId = catRegistry.has(DEFAULT_CAT_ID)
  ? DEFAULT_CAT_ID
  : catRegistry.values().next()?.value?.id ?? DEFAULT_CAT_ID

const latestSnapshotsByCat = new Map<string, SmartHomeSnapshot>()
for (const cat of catRegistry.values()) {
  const snapshot = loadLatestSnapshot(cat.id)
  if (snapshot) {
    const normalized = snapshot.catId ? snapshot : { ...snapshot, catId: cat.id }
    latestSnapshotsByCat.set(cat.id, normalized)
  }
}

const pendingBehaviorRefreshTimers = new Map<string, NodeJS.Timeout>()
const BEHAVIOR_REFRESH_DELAY_MS = 2_000

for (const catId of catRegistry.keys()) {
  setTimeout(() => {
    try {
      ensureBehaviorProfile(catId)
    } catch (error) {
      logger.warn('[behavior] Failed to prime behavior profile for cat', catId, error)
    }
  }, 0)
}

// Mutex for protecting latestSnapshot from race conditions
class Mutex {
  private locked = false
  private queue: (() => void)[] = []

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true
        resolve(() => this.release())
      } else {
        this.queue.push(() => resolve(() => this.release()))
      }
    })
  }

  private release(): void {
    const next = this.queue.shift()
    if (next) {
      next()
    } else {
      this.locked = false
    }
  }
}

const snapshotMutex = new Mutex()

let currentSettings: SmartHomeSettings = storedSettings ?? DEFAULT_SETTINGS
let latestSnapshot: SmartHomeSnapshot | null = latestSnapshotsByCat.get(activeCatId) ?? null
let currentCalibration: CalibrationProfile | null = loadCalibration()
configureCameraFromEnv()
let latestVisionStatus: VisionStatus = getCameraRuntime()
let latestAudioStatus: AudioStatus | null =
  latestSnapshot && latestSnapshot.reading.audio ? { ...latestSnapshot.reading.audio } : null
let latestUvFanStatus: UvFanStatus | null =
  latestSnapshot && latestSnapshot.reading.uvFan ? { ...latestSnapshot.reading.uvFan } : null

if (latestSnapshot) {
  if (latestSnapshot.reading.vision) {
    updateCameraRuntimeFromReading(latestSnapshot.reading.vision)
    latestVisionStatus = getCameraRuntime()
  } else {
    patchLatestVisionStatus(latestVisionStatus)
  }
  if (!latestSnapshot.reading.audio && latestAudioStatus) {
    patchLatestAudioStatus(latestAudioStatus)
  }
  if (!latestSnapshot.reading.uvFan && latestUvFanStatus) {
    patchLatestUvFanStatus(latestUvFanStatus)
  }
}
const HARDWARE_API_KEY = (process.env.HARDWARE_API_KEY ?? '').trim()
const ADMIN_API_KEY = (process.env.ADMIN_API_KEY ?? '').trim()
const ENABLE_TTS = ['true', '1', 'yes'].includes((process.env.ENABLE_TTS ?? 'true').toLowerCase())
const TTS_MODEL_ID = process.env.TTS_MODEL_ID ?? 'Xenova/xtts-v2'
const DEFAULT_CAT_PRESENCE_KG =
  Number.isFinite(Number(process.env.CAT_PRESENCE_WEIGHT_KG))
    ? Number(process.env.CAT_PRESENCE_WEIGHT_KG)
    : 1
let recentAlerts: AutomationAlert[] = loadAutomationAlerts(ALERT_HISTORY_LIMIT)
let serialBridge: SerialBridgeConnection | null = null

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_CONTACT = process.env.VAPID_CONTACT ?? 'mailto:smart-cat-home@example.com'
let pushNotificationsEnabled = false
let nativePushService: NativePushService | null = null

type PushChannelMetrics = {
  successCount: number
  failureCount: number
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastError?: string | null
}

type PushDeliverySummary = {
  web: { targeted: number; sent: number; failed: number }
  native: { targeted: number; sent: number; failed: number }
}

type PushNotificationPayload = {
  alertId: string
  title: string
  body: string
  severity: AutomationAlert['severity']
  action?: string | null
  url?: string | null
  data: Record<string, unknown>
}

type PushNotificationContext = {
  test?: boolean
  title?: string
  url?: string
  action?: string
}

const pushDeliveryMetrics: Record<'web' | 'native', PushChannelMetrics> = {
  web: {
    successCount: 0,
    failureCount: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  },
  native: {
    successCount: 0,
    failureCount: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  },
}

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webPush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    pushNotificationsEnabled = true
  } catch (error) {
    logger.warn('[push] Failed to configure VAPID keys', error)
  }
} else {
  logger.warn('[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set; push notifications disabled.')
}

const NATIVE_PUSH_ENABLED = ['true', '1', 'yes'].includes((process.env.NATIVE_PUSH_ENABLED ?? 'false').toLowerCase())
if (NATIVE_PUSH_ENABLED) {
  const apnsKeyPath = process.env.APNS_AUTH_KEY_PATH
  const apnsKeyBase64 = process.env.APNS_AUTH_KEY_BASE64
  const apnsKeyId = process.env.APNS_KEY_ID
  const apnsTeamId = process.env.APNS_TEAM_ID
  const apnsBundleId = process.env.APNS_BUNDLE_ID
  const apnsProduction = ['true', '1', 'yes'].includes((process.env.APNS_USE_PRODUCTION ?? 'false').toLowerCase())

  const apnsConfigured = Boolean((apnsKeyPath || apnsKeyBase64) && apnsKeyId && apnsTeamId && apnsBundleId)

  const fcmServiceAccountPath = process.env.FCM_SERVICE_ACCOUNT_PATH
  const fcmServiceAccountBase64 = process.env.FCM_SERVICE_ACCOUNT_BASE64
  const fcmConfigured = Boolean(fcmServiceAccountPath || fcmServiceAccountBase64)

  if (apnsConfigured || fcmConfigured) {
    nativePushService = new NativePushService({
      apns: apnsConfigured
        ? {
            keyPath: apnsKeyPath,
            keyBase64: apnsKeyBase64,
            keyId: apnsKeyId!,
            teamId: apnsTeamId!,
            bundleId: apnsBundleId!,
            production: apnsProduction,
          }
        : null,
      fcm: fcmConfigured
        ? {
            serviceAccountPath: fcmServiceAccountPath,
            serviceAccountBase64: fcmServiceAccountBase64,
          }
        : null,
    })
  } else {
    logger.warn('[native-push] Enabled but no APNs/FCM credentials detected; native push skipped.')
  }
} else {
  logger.info('[native-push] Native push disabled via NATIVE_PUSH_ENABLED flag.')
}

function recordPushDelivery(
  channel: 'web' | 'native',
  outcome: { success: number; failure: number; error?: string | null },
) {
  const metrics = pushDeliveryMetrics[channel]
  const now = new Date().toISOString()
  if (outcome.success > 0) {
    metrics.successCount += outcome.success
    metrics.lastSuccessAt = now
  }
  if (outcome.failure > 0) {
    metrics.failureCount += outcome.failure
    metrics.lastFailureAt = now
    if (outcome.error) {
      metrics.lastError = outcome.error
    }
  } else if (outcome.error) {
    metrics.lastError = outcome.error
  }
}

type PushAlertInput =
  | {
      message: string
      severity?: AutomationAlert['severity']
    }
  | {
      key: AlertMessageKey
      variables?: Record<string, string | number | boolean>
      severity?: AutomationAlert['severity']
    }

// 🚨 Alert rate limiting: Prevent alert spam with cooldown periods
const ALERT_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes
const alertCooldowns = new Map<string, number>() // key -> expiryTimestamp

// Cleanup expired cooldowns periodically to prevent memory leak
setInterval(() => {
  const now = Date.now()
  for (const [key, expiry] of alertCooldowns.entries()) {
    if (expiry < now) {
      alertCooldowns.delete(key)
    }
  }
}, 60 * 1000) // Run cleanup every minute

// ⏱️ Hardware command timeout: Reset stale commands every minute
// If Arduino crashes after claiming a command, it will be automatically retried
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
setInterval(() => {
  const resetCount = resetStaleHardwareCommands(COMMAND_TIMEOUT_MS)
  if (resetCount > 0) {
    logger.info(`[hardware] Timeout check: reset ${resetCount} stale command(s)`)
  }
}, 60 * 1000) // Check every minute

function pushAlert(input: PushAlertInput) {
  const severity = input.severity ?? 'warning'
  let message: string
  let messageKey: AlertMessageKey | undefined
  let messageVariables: Record<string, string | number | boolean> | undefined

  if ('message' in input) {
    message = input.message
  } else {
    messageKey = input.key
    messageVariables = input.variables ? { ...input.variables } : undefined
    const normalizedVariables = Object.fromEntries(
      Object.entries(messageVariables ?? {}).map(([key, value]) => [
        key,
        typeof value === 'boolean' ? (value ? 'true' : 'false') : value,
      ]),
    ) as Record<string, string | number>
    message = formatAlertMessage(input.key, normalizedVariables)
  }

  // 🚨 Check cooldown: Create unique key for this alert type
  const cooldownKey = messageKey
    ? `${messageKey}-${JSON.stringify(messageVariables ?? {})}`
    : `msg-${message}`

  const cooldownExpiry = alertCooldowns.get(cooldownKey)
  if (cooldownExpiry && Date.now() < cooldownExpiry) {
    // Still in cooldown period, skip this alert
    return
  }

  const lastAlert = recentAlerts[0]
  if (lastAlert) {
    if (messageKey && lastAlert.messageKey === messageKey) {
      const previous = JSON.stringify(lastAlert.messageVariables ?? {})
      const next = JSON.stringify(messageVariables ?? {})
      if (previous === next && lastAlert.severity === severity) {
        return
      }
    } else if (!messageKey && lastAlert.message === message && lastAlert.severity === severity) {
      return
    }
  }

  const alert: AutomationAlert = {
    timestamp: new Date().toISOString(),
    message,
    severity,
    ...(messageKey ? { messageKey } : {}),
    ...(messageVariables ? { messageVariables } : {}),
  }
  recentAlerts = [alert, ...recentAlerts].slice(0, ALERT_HISTORY_LIMIT)
  try {
    saveAutomationAlert(alert, ALERT_HISTORY_LIMIT)
  } catch (error) {
    logger.warn('[alerts] Failed to persist automation alert', error)
  }
  if (pushNotificationsEnabled || nativePushService) {
    void sendAlertNotification(alert).catch((error) => {
      logger.warn('[push] Failed to deliver automation alert', error)
    })
  }

  // 🚨 Set cooldown for this alert type
  alertCooldowns.set(cooldownKey, Date.now() + ALERT_COOLDOWN_MS)
}

type BasicHardwareCommand = 'updateSettings' | 'updateCalibration' | 'startFeederCycle' | 'stopFeederCycle' | 'hydrateNow'

function sendHardwareCommand(type: BasicHardwareCommand, payload: unknown) {
  const commandPayload = typeof payload === 'undefined' ? {} : payload

  if (serialBridge) {
    serialBridge
      .sendCommand({
        type,
        payload: commandPayload,
        timestamp: new Date().toISOString(),
      })
      .catch((error) => {
        logger.warn('[serial] Failed to send hardware command, falling back to queue', {
          type,
          error: error instanceof Error ? error.message : String(error),
        })
        try {
          enqueueHardwareCommand(type, commandPayload ?? null)
        } catch (queueError) {
          logger.error('[hardware] Failed to enqueue hardware command after serial failure', queueError)
        }
      })
    return
  }

  try {
    enqueueHardwareCommand(type, commandPayload ?? null)
  } catch (error) {
    logger.warn('[hardware] Failed to enqueue hardware command', type, error)
  }
}

function pushSettingsToHardware(settings: SmartHomeSettings) {
  sendHardwareCommand('updateSettings', settings)
}

function pushCalibrationToHardware(calibration: CalibrationProfile) {
  sendHardwareCommand('updateCalibration', calibration)
}

const DEFAULT_AUDIO_STATUS: AudioStatus = {
  amplifierOnline: true,
  muted: false,
  volumePercent: 70,
  activePattern: 'none',
  playing: false,
  lastPattern: null,
  lastTriggeredAtMs: undefined,
}

function patchLatestAudioStatus(partial: Partial<AudioStatus>) {
  const base = latestAudioStatus ? { ...latestAudioStatus } : { ...DEFAULT_AUDIO_STATUS }
  const next: AudioStatus = {
    ...base,
    ...partial,
  }
  next.volumePercent = Math.max(0, Math.min(100, next.volumePercent))
  latestAudioStatus = next

  if (latestSnapshot) {
    const updated: SmartHomeSnapshot = {
      ...latestSnapshot,
      reading: {
        ...latestSnapshot.reading,
        audio: { ...next },
      },
    }
    latestSnapshot = updated
    const targetCat = updated.catId ?? activeCatId
    latestSnapshotsByCat.set(targetCat, updated)
  }
}

function sendSerialAudioControl(payload: Record<string, unknown>) {
  if (!serialBridge) {
    return
  }
  serialBridge
    .sendCommand({
      type: 'audioControl',
      payload,
      timestamp: new Date().toISOString(),
    })
    .catch((error) => {
      logger.warn('[audio] Failed to send serial audio control', error)
    })
}

function triggerAudioPattern(pattern: string, repeat = 1) {
  const sanitizedPattern = pattern.trim().length > 0 ? pattern.trim() : 'call-cat'
  const repeatCount = Number.isFinite(repeat) && repeat > 0 ? repeat : 1

  if (serialBridge) {
    sendSerialAudioControl({ action: 'playPattern', pattern: sanitizedPattern, repeat: repeatCount })
  } else {
    enqueueHardwareCommand('playAudioPattern', { pattern: sanitizedPattern, repeat: repeatCount })
  }

  patchLatestAudioStatus({
    amplifierOnline: latestAudioStatus?.amplifierOnline ?? true,
    activePattern: sanitizedPattern,
    lastPattern: sanitizedPattern,
    playing: true,
    lastTriggeredAtMs: Date.now(),
  })
}

function stopAudioPlayback() {
  if (serialBridge) {
    sendSerialAudioControl({ action: 'stop' })
  } else {
    enqueueHardwareCommand('stopAudio', null)
  }

  patchLatestAudioStatus({
    activePattern: 'none',
    playing: false,
  })
}

function updateAudioConfiguration(options: {
  muted?: boolean | undefined
  volumePercent?: number | undefined
  pattern?: string | undefined
  repeat?: number | undefined
}) {
  const payload: Record<string, unknown> = {}
  if (typeof options.muted === 'boolean') {
    payload.muted = options.muted
  }
  if (typeof options.volumePercent === 'number' && Number.isFinite(options.volumePercent)) {
    payload.volumePercent = Math.max(0, Math.min(100, options.volumePercent))
  }
  if (typeof options.pattern === 'string' && options.pattern.trim().length > 0) {
    payload.pattern = options.pattern.trim()
    if (typeof options.repeat === 'number' && Number.isFinite(options.repeat)) {
      payload.repeat = options.repeat
    }
  }

  if (serialBridge) {
    if (typeof payload.volumePercent === 'number') {
      sendSerialAudioControl({ action: 'setVolume', volumePercent: payload.volumePercent })
    }
    if (typeof payload.muted === 'boolean') {
      sendSerialAudioControl({
        action: payload.muted ? 'mute' : 'unmute',
        muted: payload.muted,
      })
    }
    if (typeof payload.pattern === 'string') {
      triggerAudioPattern(payload.pattern, typeof payload.repeat === 'number' ? payload.repeat : 1)
      return
    }
  } else if (Object.keys(payload).length > 0) {
    enqueueHardwareCommand('setAudioState', payload)
  }

  const partial: Partial<AudioStatus> = {}
  if (typeof payload.volumePercent === 'number') {
    partial.volumePercent = payload.volumePercent
  }
  if (typeof payload.muted === 'boolean') {
    partial.muted = payload.muted
    partial.playing = payload.muted ? false : latestAudioStatus?.playing ?? false
    if (payload.muted) {
      partial.activePattern = 'none'
    }
  }
  if (typeof payload.pattern === 'string') {
    patchLatestAudioStatus({
      activePattern: payload.pattern,
      lastPattern: payload.pattern,
      playing: true,
      lastTriggeredAtMs: Date.now(),
    })
    return
  }

  if (Object.keys(partial).length > 0) {
    patchLatestAudioStatus(partial)
  }
}

const DEFAULT_UV_FAN_STATUS: UvFanStatus = {
  uvOn: false,
  fanOn: false,
  autoMode: true,
  cleaningActive: false,
  cleaningDurationMs: 0,
  cleaningRemainingMs: 0,
  lastRunUnix: null,
  lastRunIso: null,
  nextAutoUnix: null,
  nextAutoIso: null,
  nextAutoInMs: null,
}

function clampNonNegative(value: number | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value)
  }
  if (value === null) {
    return null
  }
  return undefined
}

function patchLatestUvFanStatus(partial: Partial<UvFanStatus>) {
  const base = latestUvFanStatus ? { ...latestUvFanStatus } : { ...DEFAULT_UV_FAN_STATUS }
  const next: UvFanStatus = {
    ...base,
    ...partial,
  }
  next.cleaningDurationMs = clampNonNegative(next.cleaningDurationMs)
  next.cleaningRemainingMs = clampNonNegative(next.cleaningRemainingMs)
  next.lastRunUnix = clampNonNegative(next.lastRunUnix)
  next.nextAutoUnix = clampNonNegative(next.nextAutoUnix)
  next.nextAutoInMs = clampNonNegative(next.nextAutoInMs)

  latestUvFanStatus = next

  if (latestSnapshot) {
    const updated: SmartHomeSnapshot = {
      ...latestSnapshot,
      reading: {
        ...latestSnapshot.reading,
        uvFan: { ...next },
      },
    }
    latestSnapshot = updated
    const targetCat = updated.catId ?? activeCatId
    latestSnapshotsByCat.set(targetCat, updated)
  }
}

type UvFanSerialAction = 'setState' | 'setAutoMode' | 'startCleaning' | 'stopCleaning'

function sendSerialUvFanControl(action: UvFanSerialAction, payload?: Record<string, unknown>) {
  if (!serialBridge) {
    return
  }
  const body: Record<string, unknown> = { action }
  if (payload && typeof payload === 'object') {
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value !== 'undefined') {
        body[key] = value
      }
    }
  }
  serialBridge
    .sendCommand({
      type: 'uvFanControl',
      payload: body,
      timestamp: new Date().toISOString(),
    })
    .catch((error) => {
      logger.warn('[uv-fan] Failed to send serial uv-fan command', error)
    })
}

function updateUvFanState(options: { uvOn?: boolean; fanOn?: boolean; autoMode?: boolean }) {
  const payload: Record<string, unknown> = {}
  let hasStateChange = false
  if (typeof options.uvOn === 'boolean') {
    payload.uvOn = options.uvOn
    hasStateChange = true
  }
  if (typeof options.fanOn === 'boolean') {
    payload.fanOn = options.fanOn
    hasStateChange = true
  }
  if (typeof options.autoMode === 'boolean') {
    payload.autoMode = options.autoMode
  }

  if (!hasStateChange && typeof payload.autoMode === 'undefined') {
    throw new Error('uv-fan-payload-empty')
  }

  if (serialBridge) {
    const action: UvFanSerialAction = hasStateChange ? 'setState' : 'setAutoMode'
    sendSerialUvFanControl(action, payload)
  } else {
    enqueueHardwareCommand('setUvFanState', payload)
  }

  const patch: Partial<UvFanStatus> = {}
  if (typeof payload.uvOn === 'boolean') {
    patch.uvOn = payload.uvOn
  }
  if (typeof payload.fanOn === 'boolean') {
    patch.fanOn = payload.fanOn
  }
  if (typeof payload.autoMode === 'boolean') {
    patch.autoMode = payload.autoMode
    if (!payload.autoMode) {
      patch.nextAutoUnix = null
      patch.nextAutoIso = null
      patch.nextAutoInMs = null
    }
  }
  if (hasStateChange) {
    patch.cleaningActive = false
    patch.cleaningRemainingMs = null
  }
  patchLatestUvFanStatus(patch)
}

function startUvCleaning(durationMs?: number) {
  let sanitizedDuration: number | undefined
  if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0) {
    sanitizedDuration = Math.max(1000, Math.round(durationMs))
  }
  if (serialBridge) {
    sendSerialUvFanControl('startCleaning', sanitizedDuration ? { durationMs: sanitizedDuration } : undefined)
  } else {
    enqueueHardwareCommand('startUvCleaning', sanitizedDuration ? { durationMs: sanitizedDuration } : null)
  }

  const fallbackDuration =
    sanitizedDuration ??
    latestUvFanStatus?.cleaningDurationMs ??
    DEFAULT_UV_FAN_STATUS.cleaningDurationMs ??
    0

  patchLatestUvFanStatus({
    cleaningActive: true,
    cleaningDurationMs: fallbackDuration,
    cleaningRemainingMs: fallbackDuration,
    uvOn: true,
    fanOn: true,
  })
}

function stopUvCleaning() {
  if (serialBridge) {
    sendSerialUvFanControl('stopCleaning')
  } else {
    enqueueHardwareCommand('stopUvCleaning', null)
  }
  patchLatestUvFanStatus({
    cleaningActive: false,
    cleaningRemainingMs: null,
    uvOn: false,
    fanOn: false,
  })
}

function startFeederCycleCommand(options?: { targetGrams?: number; minGrams?: number }) {
  const payload: Record<string, unknown> = {}
  if (options) {
    if (typeof options.targetGrams === 'number' && Number.isFinite(options.targetGrams)) {
      payload.targetGrams = options.targetGrams
    }
    if (typeof options.minGrams === 'number' && Number.isFinite(options.minGrams)) {
      payload.minGrams = options.minGrams
    }
  }
  sendHardwareCommand('startFeederCycle', Object.keys(payload).length > 0 ? payload : {})
}

function stopFeederCycleCommand() {
  sendHardwareCommand('stopFeederCycle', {})
}

function triggerHydrationPump(durationMs?: number) {
  let sanitized: number | undefined
  if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0) {
    sanitized = Math.max(200, Math.min(durationMs, 5000))
  }
  const payload = typeof sanitized === 'number' ? { durationMs: sanitized } : {}
  sendHardwareCommand('hydrateNow', payload)
}

function patchLatestVisionStatus(status: VisionStatus) {
  latestVisionStatus = {
    ...status,
    inference: status.inference ? { ...status.inference } : status.inference ?? null,
  }

  if (latestSnapshot) {
    const updated: SmartHomeSnapshot = {
      ...latestSnapshot,
      reading: {
        ...latestSnapshot.reading,
        vision: latestVisionStatus,
      },
    }
    latestSnapshot = updated
    const targetCat = updated.catId ?? activeCatId
    latestSnapshotsByCat.set(targetCat, updated)
  }
}

function getCatPresenceThresholdKg() {
  return currentCalibration?.catPresenceThresholdKg ?? DEFAULT_CAT_PRESENCE_KG
}

const ALERT_TRANSLATIONS: Record<
  LanguageCode,
  Record<
    | 'waterLevelCritical'
    | 'waterLevelLow'
    | 'brightnessLow'
    | 'brightnessHigh'
    | 'catLeft'
    | 'catAwayTooLong',
    string
  >
> = {
  zh: {
    waterLevelCritical: '水位僅剩 {percent}%，請立即補水。',
    waterLevelLow: '水位偏低（{percent}%），建議儘快補水。',
    brightnessLow: '偵測到貓咪在屋內且環境亮度偏暗，請考慮開燈或增加照明。',
    brightnessHigh: '偵測到貓咪在屋內且亮度過高（{percent}%），請檢查是否有強光或直射日光。',
    catLeft: '偵測到貓咪剛離開智慧貓屋，請確認是否為預期情況。',
    catAwayTooLong: '貓咪離開超過 6 小時且未餵食，請確認其狀態。',
  },
  en: {
    waterLevelCritical: 'Water level at {percent}%. Refill immediately.',
    waterLevelLow: 'Water level low ({percent}%). Schedule a refill soon.',
    brightnessLow: 'Brightness is very low while the cat is inside. Consider turning on the lights.',
    brightnessHigh: 'Brightness extremely high ({percent}%) while the cat is inside. Check for direct sunlight or glare.',
    catLeft: 'Cat just left the habitat. Monitor if this was expected.',
    catAwayTooLong: 'Cat has been away for over 6 hours since last feeding. Please check on them.',
  },
}

const ALERT_ACTION_HINTS: Record<
  AlertMessageKey,
  { zh: string; en: string; url: string }
> = {
  waterLevelCritical: {
    zh: '立即補滿水碗或啟動自動補水。',
    en: 'Refill the water bowl immediately or trigger auto-refill.',
    url: '/#hydration',
  },
  waterLevelLow: {
    zh: '安排補水或提醒家人注意水位。',
    en: 'Schedule a refill or remind a family member to check the bowl.',
    url: '/#hydration',
  },
  brightnessLow: {
    zh: '開燈或調整夜燈，讓貓咪保持安全。',
    en: 'Turn on a light or adjust the night lamp so your cat stays safe.',
    url: '/#control',
  },
  brightnessHigh: {
    zh: '拉上窗簾或換個位置，避免直射強光。',
    en: 'Close the curtains or move the habitat to avoid harsh light.',
    url: '/#control',
  },
  catLeft: {
    zh: '檢查室外環境並確認牠的行蹤。',
    en: 'Check the surroundings and confirm where your cat is heading.',
    url: '/#alerts',
  },
  catAwayTooLong: {
    zh: '準備食物或啟動餵食器，並留意回家狀況。',
    en: 'Prepare food or trigger the feeder and watch for their return.',
    url: '/#care-center',
  },
}

function formatAlertMessage(
  key: AlertMessageKey,
  variables: Record<string, string | number> = {},
) {
  const language = getPreferredLanguage()
  const template = ALERT_TRANSLATIONS[language]?.[key] ?? ALERT_TRANSLATIONS.en[key] ?? key
  return template.replace(/\{(\w+)\}/g, (_match, token: string) => {
    const value = variables[token]
    return value !== undefined ? String(value) : ''
  })
}

function buildAlertActionHint(
  alert: AutomationAlert,
  overrides?: { url?: string; action?: string },
): { action: string | null; url: string } {
  if (overrides?.action || overrides?.url) {
    return {
      action: overrides.action ?? null,
      url: overrides.url ?? '/#alerts',
    }
  }

  const language = getPreferredLanguage()
  if (alert.messageKey && ALERT_ACTION_HINTS[alert.messageKey]) {
    const hint = ALERT_ACTION_HINTS[alert.messageKey]
    const action = language === 'zh' ? hint.zh : hint.en
    return {
      action,
      url: hint.url,
    }
  }

  return {
    action: null,
    url: '/#alerts',
  }
}

function buildNotificationPayload(
  alert: AutomationAlert,
  context?: PushNotificationContext,
): PushNotificationPayload {
  const { action, url } = buildAlertActionHint(alert, context)
  return {
    alertId: alert.timestamp,
    title: context?.title ?? 'Smart Cat Home Alert',
    body: alert.message,
    severity: alert.severity,
    action,
    url,
    data: {
      messageKey: alert.messageKey ?? null,
      messageVariables: alert.messageVariables ?? null,
      severity: alert.severity,
      action,
      url,
      test: context?.test === true,
    },
  }
}

const CALIBRATION_KEYS: Array<keyof CalibrationProfile> = [
  'fsrZero',
  'fsrScale',
  'waterLevelFullCm',
  'waterLevelEmptyCm',
  'ldrDark',
  'ldrBright',
  'catPresenceThresholdKg',
]

function formatDecimal(value: number | undefined, fractionDigits = 1): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }
  const fixed = value.toFixed(fractionDigits)
  return fixed.replace(/\.0+$/, '').replace(/(\.[0-9]*[1-9])0+$/, '$1')
}

function numbersDifferent(a: number | undefined, b: number | undefined, tolerance = 0.0001): boolean {
  if (typeof a !== 'number' || !Number.isFinite(a)) {
    return typeof b === 'number' && Number.isFinite(b)
  }
  if (typeof b !== 'number' || !Number.isFinite(b)) {
    return true
  }
  return Math.abs(a - b) > tolerance
}

function describeSettingsChanges(previous: SmartHomeSettings, next: SmartHomeSettings): string[] {
  const changes: string[] = []

  if (previous.autoMode !== next.autoMode) {
    changes.push(`autoMode ${previous.autoMode ? 'ON' : 'OFF'}→${next.autoMode ? 'ON' : 'OFF'}`)
  }
  if (numbersDifferent(previous.targetTemperatureC, next.targetTemperatureC, 0.05)) {
    changes.push(`溫度 ${formatDecimal(previous.targetTemperatureC, 1)}°C→${formatDecimal(next.targetTemperatureC, 1)}°C`)
  }
  if (numbersDifferent(previous.targetHumidityPercent, next.targetHumidityPercent, 0.5)) {
    changes.push(`濕度 ${formatDecimal(previous.targetHumidityPercent, 0)}%→${formatDecimal(next.targetHumidityPercent, 0)}%`)
  }
  if (numbersDifferent(previous.waterBowlLevelTargetMl, next.waterBowlLevelTargetMl, 0.5)) {
    changes.push(`水碗目標 ${formatDecimal(previous.waterBowlLevelTargetMl, 0)}ml→${formatDecimal(next.waterBowlLevelTargetMl, 0)}ml`)
  }
  const prevSchedule = previous.feederSchedule.trim()
  const nextSchedule = next.feederSchedule.trim()
  if (prevSchedule !== nextSchedule) {
    changes.push(`餵食行程 ${prevSchedule.length > 0 ? prevSchedule : '—'}→${nextSchedule.length > 0 ? nextSchedule : '—'}`)
  }
  if (previous.purifierIntensity !== next.purifierIntensity) {
    changes.push(`空氣淨化 ${previous.purifierIntensity}→${next.purifierIntensity}`)
  }

  return changes
}

function recordSettingsMemory(previous: SmartHomeSettings, next: SmartHomeSettings, source: string) {
  const changes = describeSettingsChanges(previous, next)
  if (!changes.length) return
  const content = `Autoset 設定更新：${changes.join('；')}`
  try {
    addMemory({ type: 'setting', content, source })
  } catch (error) {
    logger.warn('[memories] Failed to persist settings change', error)
  }
}

const CALIBRATION_LABELS: Record<keyof CalibrationProfile, string> = {
  fsrZero: 'FSR 零點',
  fsrScale: 'FSR 比例',
  waterLevelFullCm: '水位（滿）',
  waterLevelEmptyCm: '水位（空）',
  ldrDark: 'LDR 暗部',
  ldrBright: 'LDR 亮部',
  catPresenceThresholdKg: '貓咪入屋閾值',
  updatedAt: '更新時間',
}

const CALIBRATION_PRECISION: Partial<Record<keyof CalibrationProfile, number>> = {
  fsrScale: 6,
  catPresenceThresholdKg: 2,
  waterLevelFullCm: 2,
  waterLevelEmptyCm: 2,
}

const CALIBRATION_TOLERANCE: Partial<Record<keyof CalibrationProfile, number>> = {
  fsrScale: 1e-6,
  catPresenceThresholdKg: 0.005,
  waterLevelFullCm: 0.02,
  waterLevelEmptyCm: 0.02,
}

function formatCalibrationValue(key: keyof CalibrationProfile, value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }
  const digits = CALIBRATION_PRECISION[key] ?? (Math.abs(value) >= 10 ? 1 : 2)
  const text = formatDecimal(value, digits)
  if (key === 'catPresenceThresholdKg') return `${text}kg`
  if (key === 'waterLevelFullCm' || key === 'waterLevelEmptyCm') return `${text}cm`
  if (key === 'fsrZero' || key === 'ldrDark' || key === 'ldrBright') return text
  if (key === 'fsrScale') return text
  return text
}

function describeCalibrationChanges(previous: CalibrationProfile | null, next: CalibrationProfile): string[] {
  const changes: string[] = []
  for (const key of CALIBRATION_KEYS) {
    const label = CALIBRATION_LABELS[key] ?? key
    const prevHas = previous ? Object.prototype.hasOwnProperty.call(previous, key) : false
    const nextHas = Object.prototype.hasOwnProperty.call(next, key)
    const prevValue = prevHas ? (previous as Record<string, unknown>)[key] : undefined
    const nextValue = nextHas ? (next as Record<string, unknown>)[key] : undefined

    if (!prevHas && !nextHas) {
      continue
    }
    if (!nextHas) {
      const before = typeof prevValue === 'number' ? formatCalibrationValue(key, prevValue) : '—'
      changes.push(`${label} 移除（原值 ${before}）`)
      continue
    }
    if (!prevHas) {
      const after = typeof nextValue === 'number' ? formatCalibrationValue(key, nextValue) : '—'
      changes.push(`${label} 設為 ${after}`)
      continue
    }
    if (
      typeof prevValue === 'number' &&
      typeof nextValue === 'number' &&
      !numbersDifferent(prevValue, nextValue, CALIBRATION_TOLERANCE[key] ?? 0.0001)
    ) {
      continue
    }
    if (prevValue === nextValue) {
      continue
    }
    const before = typeof prevValue === 'number' ? formatCalibrationValue(key, prevValue) : '—'
    const after = typeof nextValue === 'number' ? formatCalibrationValue(key, nextValue) : '—'
    changes.push(`${label} ${before}→${after}`)
  }
  return changes
}

function recordCalibrationMemory(previous: CalibrationProfile | null, next: CalibrationProfile, source: string) {
  const changes = describeCalibrationChanges(previous, next)
  if (!changes.length) return
  const content = `校正值更新：${changes.join('；')}`
  try {
    addMemory({ type: 'setting', content, source })
  } catch (error) {
    logger.warn('[memories] Failed to persist calibration change', error)
  }
}

function normalizeCalibrationPayload(payload: unknown): { profile: CalibrationProfile; changed: boolean } | null {
  if (!payload || typeof payload !== 'object') return null
  const next: CalibrationProfile = { ...(currentCalibration ?? {}) }
  let changed = false

  for (const key of CALIBRATION_KEYS) {
    if (!(key in (payload as Record<string, unknown>))) continue
    const raw = (payload as Record<string, unknown>)[key]
    if (raw === null || raw === '' || typeof raw === 'undefined') {
      if (key in next) {
        delete next[key]
        changed = true
      }
      continue
    }
    const value = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(value)) {
      Object.assign(next, { [key]: value })
      changed = true
    }
  }

  if (!changed) {
    return { profile: next, changed: false }
  }

  next.updatedAt = new Date().toISOString()
  return { profile: next, changed: true }
}

type ImageAttachment = {
  imageBase64?: string | undefined
  imageUrl?: string | undefined
  mimeType?: string | undefined
}

type DocumentAttachment = {
  dataUrl: string
  mimeType: string
  filename?: string
  type: 'pdf' | 'word'
}

function detectAttachmentType(mimeType?: string, filename?: string): 'image' | 'pdf' | 'word' | 'unknown' {
  const normalized = (mimeType ?? '').toLowerCase()
  const name = filename?.toLowerCase() ?? ''
  if (normalized.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/.test(name)) {
    return 'image'
  }
  if (normalized === 'application/pdf' || name.endsWith('.pdf')) {
    return 'pdf'
  }
  if (
    normalized === 'application/msword' ||
    normalized === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.doc') ||
    name.endsWith('.docx')
  ) {
    return 'word'
  }
  return 'unknown'
}

function parseConversationAttachments(rawMessages: unknown[]): {
  conversationMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  imageAttachments: ImageAttachment[]
  documentAttachments: DocumentAttachment[]
} {
  const conversationMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []
  const imageAttachments: ImageAttachment[] = []
  const documentAttachments: DocumentAttachment[] = []

  for (const raw of rawMessages) {
    const message: any = raw
    if (
      !message ||
      typeof message.role !== 'string' ||
      (message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string'
    ) {
      continue
    }
    const role = message.role as 'system' | 'user' | 'assistant'
    const content = message.content as string
    conversationMessages.push({ role, content })
    const messageIndex = conversationMessages.length - 1

    const attachment = typeof message.attachment === 'object' && message.attachment ? (message.attachment as Record<string, unknown>) : null
    const attachmentData =
      typeof attachment?.dataUrl === 'string'
        ? attachment.dataUrl
        : typeof attachment?.data === 'string'
          ? attachment.data
          : ''
    const attachmentMime = typeof attachment?.mimeType === 'string' ? attachment.mimeType : ''
    const attachmentFilename = typeof attachment?.filename === 'string' ? attachment.filename : undefined
    if (attachmentData) {
      const detectedType = detectAttachmentType(attachmentMime, attachmentFilename)
      if (detectedType === 'image') {
        imageAttachments.push({
          messageIndex,
          imageBase64: attachmentData,
          mimeType: attachmentMime || undefined,
        })
        continue
      }
      if (detectedType === 'pdf' || detectedType === 'word') {
        let normalizedMime = attachmentMime.trim()
        if (!normalizedMime) {
          normalizedMime = detectedType === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
        documentAttachments.push({
          messageIndex,
          dataUrl: attachmentData,
          mimeType: normalizedMime,
          filename: attachmentFilename,
          type: detectedType,
        })
        continue
      }
    }

    const imageBase64 = typeof message.imageBase64 === 'string' ? message.imageBase64 : ''
    const imageUrl = typeof message.imageUrl === 'string' ? message.imageUrl : ''
    const mimeType = typeof message.mimeType === 'string' ? message.mimeType : ''
    if (imageBase64 || imageUrl) {
      const attachmentRecord: ImageAttachment & { imageBase64?: string; imageUrl?: string; mimeType?: string } = {
        messageIndex,
      }
      if (imageBase64) attachmentRecord.imageBase64 = imageBase64
      if (imageUrl) attachmentRecord.imageUrl = imageUrl
      if (mimeType) attachmentRecord.mimeType = mimeType
      imageAttachments.push(attachmentRecord)
    }
  }

  return { conversationMessages, imageAttachments, documentAttachments }
}

function extractFileAttachmentIds(rawMessages: unknown[]): string[] {
  const ids = new Set<string>()
  for (const raw of rawMessages) {
    if (!raw || typeof raw !== 'object') continue
    const message = raw as Record<string, unknown>
    const attachments = Array.isArray(message.fileAttachments) ? message.fileAttachments : []
    for (const id of attachments) {
      if (typeof id === 'string' && id.trim().length > 0) {
        ids.add(id.trim())
      }
    }
  }
  return Array.from(ids)
}

function buildFileAttachmentSummary(fileIds: string[]): string | null {
  if (!fileIds.length) return null
  const summaries: string[] = []
  for (const fileId of fileIds) {
    const metadata = fileHandler.getFileMetadata(fileId)
    if (!metadata) {
      logger.warn(`[fileAttachment] Missing metadata for ${fileId}`)
      continue
    }
    const analysis = metadata.analysisResult as { summary?: string; type?: string; extractedText?: string } | undefined
    const summaryText = (analysis?.summary?.trim() || metadata.filename || 'Uploaded file').replace(/\s+/g, ' ').trim()
    const typeLabel = analysis?.type || metadata.fileType || metadata.mimeType?.split('/').pop() || 'file'

    // 對於 PDF,如果有提取的文字,包含前500字符
    let detailedContent = ''
    if (metadata.fileType === 'pdf' && analysis?.extractedText) {
      const preview = analysis.extractedText.substring(0, 500).trim()
      if (preview.length > 0) {
        detailedContent = `\n  內容預覽: ${preview}${analysis.extractedText.length > 500 ? '...' : ''}`
      }
    }

    summaries.push(`• ${metadata.filename} (${typeLabel}):\n  分析摘要: ${summaryText}${detailedContent}`)
  }
  if (!summaries.length) return null
  const maxEntries = 5
  const display = summaries.length > maxEntries ? summaries.slice(0, maxEntries).join('\n\n') : summaries.join('\n\n')
  const suffix = summaries.length > maxEntries ? `\n\n+ ${summaries.length - maxEntries} more files` : ''

  // 🆕 更強調的標題,明確指示這是用戶上傳的文件
  return `📎 USER UPLOADED FILES (用戶剛上傳的文件 - 請優先參考這些內容回答問題):\n\n${display}${suffix}\n\n⚠️ 重要: 當用戶問及文件內容時,請主要基於以上文件分析來回答,而不是感測器數據。`
}

function buildFileAttachmentVisionContext(
  fileIds: string[],
  language: LanguageCode,
): { visionSummary: string | null; hasImageAttachment: boolean } {
  if (!fileIds.length) {
    return { visionSummary: null, hasImageAttachment: false }
  }

  const records: string[] = []
  let hasImageAttachment = false

  for (const fileId of fileIds) {
    const metadata = fileHandler.getFileMetadata(fileId)
    if (!metadata) continue
    if (metadata.fileType !== 'image') continue
    hasImageAttachment = true

    const summary =
      typeof metadata.analysisResult?.summary === 'string' && metadata.analysisResult.summary.trim().length > 0
        ? metadata.analysisResult.summary.trim()
        : language === 'en'
          ? 'Image uploaded, awaiting analysis.'
          : '圖片已上傳，尚未取得分析摘要。'

    const label = metadata.filename || metadata.id
    records.push(`${label}: ${summary}`)
  }

  if (!records.length) {
    return { visionSummary: null, hasImageAttachment }
  }

  const maxEntries = 4
  const selected = records.slice(0, maxEntries)
  const suffix =
    records.length > maxEntries
      ? language === 'en'
        ? `\n+ ${records.length - maxEntries} more images`
        : `\n+ 另外 ${records.length - maxEntries} 張圖片`
      : ''
  const heading = language === 'en' ? 'Vision insights from uploaded files:' : '上傳檔案的視覺摘要：'
  return { visionSummary: `${heading}\n${selected.join('\n')}${suffix}`, hasImageAttachment: true }
}

async function executeToolCall(
  call: ChatToolCall,
  context: {
    modelTier: 'standard' | 'pro' | null
    userQuestion?: string | undefined
    imageAttachment?: ImageAttachment | null | undefined
    enableSearch?: boolean | undefined
    language?: LanguageCode | undefined
  } = {
    modelTier: null,
  },
): Promise<{
  log: ToolExecutionLog
  snapshot?: SmartHomeSnapshot
  directResponse?: string
}> {
  const language = context.language ?? getPreferredLanguage()
  switch (call.tool) {
    case 'updateSettings': {
      const startedAt = Date.now()
      if (!call.args || typeof call.args !== 'object') {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: 'Invalid settings payload.',
            args: call.args,
            durationMs: Date.now() - startedAt,
          },
        }
      }

      const allowedKeys: Array<keyof SmartHomeSettings> = [
        'autoMode',
        'targetTemperatureC',
        'targetHumidityPercent',
        'waterBowlLevelTargetMl',
        'feederSchedule',
        'purifierIntensity',
      ]

      const partial: Partial<SmartHomeSettings> = {}
      for (const key of allowedKeys) {
        if (Object.prototype.hasOwnProperty.call(call.args, key)) {
          ;(partial as any)[key] = (call.args as any)[key]
        }
      }

      if (Object.keys(partial).length === 0) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: 'No supported settings provided.',
            args: call.args,
            durationMs: Date.now() - startedAt,
          },
        }
      }

      const previousSettings = { ...currentSettings }
      const merged = { ...currentSettings, ...partial }

      if (merged.targetTemperatureC < 16 || merged.targetTemperatureC > 36) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: 'targetTemperatureC out of safe range.',
            args: partial,
            durationMs: Date.now() - startedAt,
          },
        }
      }

      if (merged.targetHumidityPercent < 20 || merged.targetHumidityPercent > 80) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: 'targetHumidityPercent out of safe range.',
            args: partial,
            durationMs: Date.now() - startedAt,
          },
        }
      }

      if (merged.waterBowlLevelTargetMl < 80 || merged.waterBowlLevelTargetMl > 500) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: 'waterBowlLevelTargetMl out of bounds.',
            args: partial,
            durationMs: Date.now() - startedAt,
          },
        }
      }

      if (
        typeof merged.feederSchedule === 'string' &&
        !/^\d{2}:\d{2}(,\s*\d{2}:\d{2})*$/.test(merged.feederSchedule)
      ) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: 'feederSchedule format invalid.',
            args: partial,
            durationMs: Date.now() - startedAt,
          },
        }
      }

      if (!isSmartHomeSettings(merged)) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: 'Settings validation failed.',
            args: partial,
            durationMs: Date.now() - startedAt,
          },
        }
      }

      await applySettings(merged)
      recordSettingsMemory(previousSettings, currentSettings, 'tool:updateSettings')
      const result: { log: ToolExecutionLog; snapshot?: SmartHomeSnapshot } = {
        log: {
          tool: call.tool,
          success: true,
          message: 'Settings updated successfully.',
          args: partial,
          durationMs: Date.now() - startedAt,
        },
      }

      if (latestSnapshot) {
        result.snapshot = latestSnapshot
      }

      return result
    }
    case 'updateCalibration': {
      const startedAt = Date.now()
      const previousCalibration = currentCalibration ? { ...currentCalibration } : null
      const normalized = normalizeCalibrationPayload(call.args)
      if (!normalized) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: 'Calibration payload invalid.',
            args: call.args,
            durationMs: Date.now() - startedAt,
          },
        }
      }

      if (!normalized.changed) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: 'No calibration updates were provided.',
            args: call.args,
            durationMs: Date.now() - startedAt,
          },
        }
      }

      currentCalibration = normalized.profile
      saveCalibration(normalized.profile)
      pushCalibrationToHardware(normalized.profile)
      recordCalibrationMemory(previousCalibration, normalized.profile, 'tool:updateCalibration')
      const summary = summarizeCalibrationAdjustment(getPreferredLanguage(), previousCalibration, normalized.profile)
      return {
        log: {
          tool: call.tool,
          success: true,
          message: 'Calibration updated successfully.',
          args: normalized.profile,
          durationMs: Date.now() - startedAt,
          ...(summary ? { output: summary } : {}),
        },
      }
    }
    case 'analyzeImage': {
      const startedAt = Date.now()
      const attachment = context.imageAttachment
      const rawArgs = (call.args && typeof call.args === 'object') ? (call.args as Record<string, unknown>) : {}
      const providedBase64 =
        typeof rawArgs.imageBase64 === 'string' && rawArgs.imageBase64.trim().length > 0
          ? rawArgs.imageBase64.trim()
          : attachment?.imageBase64
      const providedUrl =
        typeof rawArgs.imageUrl === 'string' && rawArgs.imageUrl.trim().length > 0
          ? rawArgs.imageUrl.trim()
          : attachment?.imageUrl
      const mimeType =
        typeof rawArgs.mimeType === 'string' && rawArgs.mimeType.trim().length > 0
          ? rawArgs.mimeType.trim()
          : attachment?.mimeType
      if (!providedBase64 && !providedUrl) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: getPreferredLanguage() === 'en' ? 'No image data available for analysis.' : '沒有可用的影像資料可以分析。',
            args: rawArgs,
            durationMs: Date.now() - startedAt,
            errorCode: 'missing_image',
          },
        }
      }
      const prompt =
        typeof rawArgs.prompt === 'string' && rawArgs.prompt.trim().length > 0
          ? rawArgs.prompt
          : context.userQuestion
      try {
        const visionSummary = await analyzeImageWithQwen({
          imageBase64: providedBase64,
          imageUrl: providedUrl,
          mimeType,
          prompt,
          language: getPreferredLanguage(),
        })
        const result: {
          log: ToolExecutionLog
          directResponse?: string
        } = {
          log: {
            tool: call.tool,
            success: true,
            message: getPreferredLanguage() === 'en' ? 'Image analysed successfully.' : '影像分析完成。',
            args: prompt ? { prompt } : undefined,
            durationMs: Date.now() - startedAt,
            output: visionSummary.text,
          },
        }
        if (visionSummary.catVisible === false) {
          result.directResponse =
            getPreferredLanguage() === 'en'
              ? "I reviewed the photo but couldn’t actually see your cat—could you try another angle or describe the situation so I can help?"
              : '我看過這張照片，但畫面裡看不到貓咪。可以換個角度再拍一次，或直接用文字描述狀況，讓我好幫上忙嗎？'
        }
        // 🔍 DEBUG: Log vision analysis result
        logger.info('[VISION DEBUG] analyzeImage result:', {
          catVisible: visionSummary.catVisible,
          textLength: visionSummary.text?.length || 0,
          textPreview: visionSummary.text?.substring(0, 100) + '...',
          hasDirectResponse: !!result.directResponse
        })
        return result
      } catch (error) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: error instanceof Error ? error.message : 'Vision analysis failed.',
            args: prompt ? { prompt } : undefined,
            durationMs: Date.now() - startedAt,
            errorCode: 'vision_failed',
          },
        }
      }
    }
    case 'createCareTask': {
      const startedAt = Date.now()
      const normalized = normalizeTaskToolPayload(call.args)
      if (!normalized.ok) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: normalized.message,
            args: call.args,
            durationMs: Date.now() - startedAt,
          },
        }
      }

      try {
        const created = createCareTask({
          title: normalized.payload.title,
          description: normalized.payload.description,
          category: normalized.payload.category,
          dueAt: normalized.payload.dueAt,
          metadata: normalized.payload.metadata,
          source: 'ai',
        })
        const successMessage = getPreferredLanguage() === 'en' ? 'Task created successfully.' : '已建立照護任務。'
        return {
          log: {
            tool: call.tool,
            success: true,
            message: successMessage,
            args: {
              title: created.title,
              category: created.category,
              dueAt: created.dueAt,
            },
            durationMs: Date.now() - startedAt,
            output: `Task #${created.id}: ${created.title}`,
          },
        }
      } catch (error) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: error instanceof Error ? error.message : 'task-create-failed',
            args: normalized.payload,
            durationMs: Date.now() - startedAt,
          },
        }
      }
    }
    case 'switchToProModel': {
      const startedAt = Date.now()
      const reason =
        call.args && typeof call.args === 'object' && (call.args as { reason?: unknown }).reason
          ? String((call.args as { reason?: unknown }).reason)
          : null
      return {
        log: {
          tool: call.tool,
          success: true,
          message:
            getPreferredLanguage() === 'en'
              ? 'Preparing to switch to pro-tier reasoning.'
              : '準備切換至 Pro 模型。',
          args: reason ? { reason } : undefined,
          durationMs: Date.now() - startedAt,
        },
      }
    }
    case 'playAudioPattern': {
      const startedAt = Date.now()
      const args = (call.args && typeof call.args === 'object' ? (call.args as Record<string, unknown>) : {}) ?? {}
      const ALLOWED_PATTERNS = new Set([
        'call-cat',
        'wake-up-lullaby',
        'hydrate-reminder',
        'meow-call',
        'calm-chime',
        'alert',
      ])
      const requestedPattern = typeof args.pattern === 'string' ? args.pattern.trim() : ''
      const pattern = ALLOWED_PATTERNS.has(requestedPattern) ? requestedPattern : 'call-cat'
      const repeatRaw =
        typeof args.repeat === 'number'
          ? args.repeat
          : typeof args.repeat === 'string'
            ? Number.parseInt(args.repeat, 10)
            : undefined
      const repeat = repeatRaw && Number.isFinite(repeatRaw) ? Math.min(5, Math.max(1, Math.trunc(repeatRaw))) : 1
      const volumeRaw =
        typeof args.volumePercent === 'number'
          ? args.volumePercent
          : typeof args.volumePercent === 'string'
            ? Number.parseFloat(args.volumePercent)
            : undefined
      const volume =
        typeof volumeRaw === 'number' && Number.isFinite(volumeRaw) ? Math.min(100, Math.max(0, volumeRaw)) : undefined
      const mute = typeof args.mute === 'boolean' ? args.mute : undefined

      if (typeof volume !== 'undefined' || typeof mute !== 'undefined') {
        updateAudioConfiguration({
          volumePercent: volume,
          muted: mute,
        })
      }

      triggerAudioPattern(pattern, repeat)
      const summary = latestAudioStatus
        ? `pattern=${latestAudioStatus.activePattern}, volume=${latestAudioStatus.volumePercent}%, playing=${latestAudioStatus.playing}`
        : 'Audio command dispatched.'

      return {
        log: {
          tool: call.tool,
          success: true,
          message:
            getPreferredLanguage() === 'en'
              ? `Playing audio pattern "${pattern}" ${repeat} time(s).`
              : `已播放音訊模式「${pattern}」，重複 ${repeat} 次。`,
          args: {
            pattern,
            repeat,
            ...(typeof volume !== 'undefined' ? { volumePercent: volume } : {}),
            ...(typeof mute !== 'undefined' ? { mute } : {}),
          },
          durationMs: Date.now() - startedAt,
          output: summary,
        },
      }
    }
    case 'stopAudioPlayback': {
      const startedAt = Date.now()
      const mute = call.args && typeof call.args === 'object' && typeof (call.args as any).mute === 'boolean'
        ? Boolean((call.args as any).mute)
        : undefined

      stopAudioPlayback()
      if (typeof mute !== 'undefined') {
        updateAudioConfiguration({ muted: mute })
      }

      const summary = latestAudioStatus
        ? `pattern=${latestAudioStatus.activePattern}, playing=${latestAudioStatus.playing}`
        : 'Playback stop issued.'

      return {
        log: {
          tool: call.tool,
          success: true,
          message:
            getPreferredLanguage() === 'en'
              ? 'Audio playback stopped.'
              : '音訊播放已停止。',
          args: typeof mute !== 'undefined' ? { mute } : undefined,
          durationMs: Date.now() - startedAt,
          output: summary,
        },
      }
    }
    case 'hardwareControl': {
      const startedAt = Date.now()
      const args = (call.args && typeof call.args === 'object' ? (call.args as Record<string, unknown>) : {}) ?? {}
      const language = getPreferredLanguage()
      const target = typeof args.target === 'string' ? args.target : ''
      const action = typeof args.action === 'string' ? args.action : ''
      const targetGrams =
        typeof args.targetGrams === 'number' && Number.isFinite(args.targetGrams) ? args.targetGrams : undefined
      const minGrams =
        typeof args.minGrams === 'number' && Number.isFinite(args.minGrams) ? args.minGrams : undefined
      const durationMs =
        typeof args.durationMs === 'number' && Number.isFinite(args.durationMs) ? args.durationMs : undefined
      const uvOn = typeof args.uvOn === 'boolean' ? args.uvOn : undefined
      const fanOn = typeof args.fanOn === 'boolean' ? args.fanOn : undefined
      const autoMode = typeof args.autoMode === 'boolean' ? args.autoMode : undefined

      const successResponse = (messageEn: string, messageZh: string, extra?: string) => ({
        log: {
          tool: call.tool,
          success: true,
          message: language === 'en' ? messageEn : messageZh,
          args: {
            target,
            action,
            ...(typeof targetGrams === 'number' ? { targetGrams } : {}),
            ...(typeof minGrams === 'number' ? { minGrams } : {}),
            ...(typeof durationMs === 'number' ? { durationMs } : {}),
            ...(typeof uvOn === 'boolean' ? { uvOn } : {}),
            ...(typeof fanOn === 'boolean' ? { fanOn } : {}),
            ...(typeof autoMode === 'boolean' ? { autoMode } : {}),
          },
          durationMs: Date.now() - startedAt,
          output: extra ?? `${target}:${action}`,
        },
      })

      const failureResponse = (reason?: string) => ({
        log: {
          tool: call.tool,
          success: false,
          message: language === 'en' ? 'Hardware control failed. Please try again later.' : '硬體控制失敗，請稍後再試。',
          args: {
            target,
            action,
          },
          durationMs: Date.now() - startedAt,
          output: reason ?? 'hardware-control-failed',
        },
      })

      try {
        switch (target) {
          case 'feeder': {
            if (action === 'stop') {
              stopFeederCycleCommand()
              return successResponse('Feeder cycle stopped.', '餵食循環已停止。')
            }
            if (action === 'feed') {
              startFeederCycleCommand({
                targetGrams,
                minGrams,
              })
              const label = targetGrams
                ? language === 'en'
                  ? `Target ${targetGrams} g`
                  : `目標 ${targetGrams} g`
                : undefined
              return successResponse(
                'Feeding command dispatched.',
                '已送出餵食指令。',
                label,
              )
            }
            throw new Error('unsupported-feeder-action')
          }
          case 'hydration': {
            if (action !== 'pulse') {
              throw new Error('unsupported-hydration-action')
            }
            triggerHydrationPump(durationMs)
            return successResponse('Hydration pump triggered.', '已啟動補水泵。')
          }
          case 'uvFan': {
            if (action === 'setState') {
              const state: { uvOn?: boolean; fanOn?: boolean; autoMode?: boolean } = {}
              if (typeof uvOn === 'boolean') state.uvOn = uvOn
              if (typeof fanOn === 'boolean') state.fanOn = fanOn
              if (typeof autoMode === 'boolean') state.autoMode = autoMode
              if (Object.keys(state).length === 0) {
                throw new Error('missing-uv-state')
              }
              updateUvFanState(state)
              return successResponse('UV/Fan state updated.', '已更新 UV/排風狀態。')
            }
            if (action === 'startCleaning') {
              startUvCleaning(durationMs)
              return successResponse('UV cleaning started.', 'UV 清潔已啟動。')
            }
            if (action === 'stopCleaning') {
              stopUvCleaning()
              return successResponse('UV cleaning stopped.', 'UV 清潔已停止。')
            }
            throw new Error('unsupported-uv-action')
          }
          default:
            throw new Error('unsupported-target')
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'hardware-control-failed'
        return failureResponse(reason)
      }
    }
    case 'refreshCameraStatus': {
      const startedAt = Date.now()
      const args = (call.args && typeof call.args === 'object' ? (call.args as Record<string, unknown>) : {}) ?? {}
      const captureSnapshot = args.captureSnapshot === true
      const reason = typeof args.reason === 'string' ? args.reason.trim() : null
      try {
        const status = await pollCameraStatus()
        if (!status) {
          return {
            log: {
              tool: call.tool,
              success: false,
              message:
                getPreferredLanguage() === 'en'
                  ? 'Camera did not respond.'
                  : '攝影機沒有回應。',
              args: { captureSnapshot, reason },
              durationMs: Date.now() - startedAt,
            },
          }
        }
        patchLatestVisionStatus(status)
        let snapshotNote: string | undefined
        if (captureSnapshot) {
          const snapshot = await fetchCameraSnapshotBuffer()
          if (snapshot) {
            patchLatestVisionStatus(getCameraRuntime())
            snapshotNote = `Snapshot refreshed (${snapshot.contentType}, ${snapshot.buffer.length} bytes)`
          } else {
            snapshotNote = 'Snapshot unavailable'
          }
        }
        const runtime = getCameraRuntime()
        const inference = runtime?.inference
        const summary = inference
          ? `catDetected=${inference.catDetected ? 'yes' : 'no'}, confidence=${Math.round(inference.probability * 100)}%`
          : 'No inference data yet.'

        return {
          log: {
            tool: call.tool,
            success: true,
            message:
              getPreferredLanguage() === 'en'
                ? 'Camera status refreshed.'
                : '攝影機狀態已更新。',
            args: { captureSnapshot, reason },
            durationMs: Date.now() - startedAt,
            output: snapshotNote ? `${summary} · ${snapshotNote}` : summary,
          },
        }
      } catch (error) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message:
              getPreferredLanguage() === 'en'
                ? `Camera refresh failed: ${safeErrorMessage(error)}`
                : `攝影機更新失敗：${safeErrorMessage(error)}`,
            args: { captureSnapshot, reason },
            durationMs: Date.now() - startedAt,
          },
        }
      }
    }
    case 'searchWeb':
    case 'mcp.browser.search': {
      const startedAt = Date.now()
      const language = context.language ?? getPreferredLanguage()
      if (context.enableSearch === false) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message:
              language === 'en'
                ? 'Web search is disabled for this request.'
                : '本次請求已停用網頁搜尋。',
            args: call.args,
            durationMs: Date.now() - startedAt,
            errorCode: 'search_disabled',
          },
        }
      }
      const args = (call.args && typeof call.args === 'object') ? (call.args as Record<string, unknown>) : {}
      const queryRaw = typeof args.query === 'string' ? args.query : typeof args.q === 'string' ? args.q : ''
      const query = queryRaw.trim().slice(0, 200)
      if (!query) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: language === 'en' ? 'Query text is required.' : '請提供要搜尋的關鍵字。',
            args,
            durationMs: Date.now() - startedAt,
            errorCode: 'missing_query',
          },
        }
      }
      if (!SEARCH_PROXY_URL) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: language === 'en' ? 'Search proxy not configured.' : '尚未設定搜尋代理。',
            args: { query },
            durationMs: Date.now() - startedAt,
            errorCode: 'proxy_missing',
          },
        }
      }

      const limitRaw = typeof args.limit === 'number' && Number.isFinite(args.limit) ? args.limit : undefined
      const limit = limitRaw !== undefined ? Math.max(1, Math.min(Math.trunc(limitRaw), 5)) : 3
      const proxyUrl = new URL(SEARCH_PROXY_URL)
      proxyUrl.searchParams.set('q', query)
      proxyUrl.searchParams.set('limit', String(limit))
      const langArg =
        typeof args.lang === 'string' && args.lang.trim().length > 0
          ? args.lang.trim().slice(0, 5)
          : language
      proxyUrl.searchParams.set('lang', langArg)

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), SEARCH_PROXY_TIMEOUT_MS)
        let payload: any = null
        let responseText = ''
        try {
          const response = await fetch(proxyUrl.toString(), {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          })
          responseText = await response.text()
          if (!response.ok) {
            throw new Error(responseText || `HTTP ${response.status}`)
          }
          try {
            payload = JSON.parse(responseText)
          } catch {
            payload = null
          }
        } finally {
          clearTimeout(timeout)
        }

        const lines: string[] = []
        const rows: Array<{ title?: string; url?: string; snippet?: string }> = Array.isArray(payload?.results)
          ? payload.results
          : Array.isArray(payload)
            ? payload
            : []
        const sliced = rows.slice(0, limit)
        if (sliced.length > 0) {
          sliced.forEach((item, index) => {
            const title = (item?.title || item?.url || `Result ${index + 1}`).toString().trim()
            const url = (item?.url || '').toString().trim()
            const snippet = (item?.snippet || '').toString().trim()
            let block = `${index + 1}. ${title}`
            if (snippet) block += `\n${snippet}`
            if (url) block += `\n${url}`
            lines.push(block)
          })
        }

        const summary =
          lines.length > 0
            ? lines.join('\n\n')
            : responseText
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .slice(0, limit)
                .join('\n')

        if (!summary.trim()) {
          return {
            log: {
              tool: call.tool,
              success: false,
              message: language === 'en' ? 'Search returned no readable summary.' : '搜尋結果為空。',
              args: { query },
              durationMs: Date.now() - startedAt,
              errorCode: 'empty_results',
            },
          }
        }

        return {
          log: {
            tool: call.tool,
            success: true,
            message:
              language === 'en'
                ? `Fetched ${lines.length || 1} search result(s).`
                : `取得 ${lines.length || 1} 筆搜尋結果。`,
            args: { query, lang: langArg, limit },
            durationMs: Date.now() - startedAt,
            output: summary,
          },
        }
      } catch (error) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: error instanceof Error ? error.message : 'Search request failed.',
            args: { query },
            durationMs: Date.now() - startedAt,
            errorCode: 'search_failed',
          },
        }
      }
    }
    case 'saveMemory': {
      const startedAt = Date.now()
      if (!call.args || typeof call.args !== 'object') {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: 'Memory payload missing.',
            args: call.args,
            durationMs: Date.now() - startedAt,
          },
        }
      }

      const payload = call.args as { type?: unknown; content?: unknown; source?: unknown }
      const rawContent = typeof payload.content === 'string' ? payload.content.trim() : ''
      const requestedType =
        typeof payload.type === 'string' ? payload.type.trim().toLowerCase() : ''
      const memoryType: MemoryType = isMemoryType(requestedType) ? (requestedType as MemoryType) : 'note'
      const source =
        typeof payload.source === 'string' && payload.source.trim().length > 0
          ? payload.source.trim()
          : 'tool:saveMemory'

      if (rawContent.length < 3) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message: 'Memory content too short.',
            args: { type: memoryType, content: rawContent },
            durationMs: Date.now() - startedAt,
          },
        }
      }

      try {
        const entry = addMemory({
          type: memoryType,
          content: rawContent.slice(0, 1000),
          source,
        })

        const summary =
          entry.content.length > 200 ? `${entry.content.slice(0, 197)}…` : entry.content

        return {
          log: {
            tool: call.tool,
            success: true,
            message: 'Memory saved successfully.',
            args: { id: entry.id, type: entry.type, source },
            durationMs: Date.now() - startedAt,
            output: summary,
          },
        }
      } catch (error) {
        return {
          log: {
            tool: call.tool,
            success: false,
            message:
              error instanceof Error ? error.message : 'Failed to persist memory entry.',
            args: { type: memoryType, content: rawContent, source },
            durationMs: Date.now() - startedAt,
          },
        }
      }
    }
    default: {
      if (isMcpTool(call.tool)) {
        const startedAt = Date.now()
        try {
          const result = await executeMcpTool(call.tool, call.args ?? {})
          return {
            log: {
              tool: call.tool,
              success: true,
              message: 'MCP tool executed successfully.',
              args: call.args,
              durationMs: Date.now() - startedAt,
              output: result.output,
            },
          }
        } catch (error) {
          return {
            log: {
              tool: call.tool,
              success: false,
              message: error instanceof Error ? error.message : 'MCP tool execution failed.',
              args: call.args,
              durationMs: Date.now() - startedAt,
              errorCode: 'mcp_error',
            },
          }
        }
      }
      return {
        log: {
          tool: call.tool,
          success: false,
          message: 'Unsupported tool.',
        },
      }
    }
  }
}

async function analyzeImageAttachmentsBeforeChat(params: {
  attachments: ImageAttachment[]
  question: string
  language: LanguageCode
  toolEvents: ToolExecutionLog[]
  connection?: SSEConnection | null
}): Promise<{ summary: string | null; directResponse?: string }> {
  const { attachments, question, language, toolEvents, connection } = params
  if (!attachments.length) {
    return { summary: null }
  }

  const summaries: string[] = []
  for (const attachment of attachments) {
    const call: ChatToolCall = {
      tool: 'analyzeImage',
      args: question ? { prompt: question } : {},
    }
    const execution = await executeToolCall(call, {
      modelTier: null,
      userQuestion: question,
      imageAttachment: attachment,
    })
    toolEvents.push(execution.log)
    recordToolEvent(execution.log)
    connection?.sendTool(call.tool, call.args, execution.log)

    if (execution.directResponse) {
      logger.info('[VISION DEBUG] executeToolCall returned directResponse:', {
        responseLength: execution.directResponse.length,
        responsePreview: execution.directResponse.substring(0, 100) + '...'
      })
      return { summary: null, directResponse: execution.directResponse }
    }

    if (!execution.log.success) {
      // 🚫 CRITICAL: When vision fails, provide clear fallback and stop the chat generation
      // This prevents the chat model from hallucinating about the image
      const fallback =
        language === 'en'
          ? `⚠️ Vision Analysis Failed

I cannot analyze the photo because the vision model is not responding properly.

**Error:** ${execution.log.message}

**What you can do:**
1. Describe what you see in the photo manually
2. Try uploading the photo again
3. Check if the vision service is running (port 18183)

Without vision analysis, I cannot comment on the image content. I'm here to help with sensor data and text-based questions in the meantime.`
          : `⚠️ 視覺分析失敗

我無法分析照片，因為視覺模型沒有正常回應。

**錯誤：** ${execution.log.message}

**您可以：**
1. 手動描述您在照片中看到的內容
2. 重新上傳照片
3. 檢查視覺服務是否運行中（端口 18183）

沒有視覺分析，我無法評論圖片內容。但我可以協助感測器數據和文字問題。`
      return { summary: null, directResponse: fallback }
    }

    if (execution.log.output?.trim()) {
      summaries.push(execution.log.output.trim())
    } else if (execution.log.success) {
      // 🚫 CRITICAL: Vision succeeded but returned empty content (catVisible: false or no summary)
      // This means the vision model couldn't see the cat or analyze the image properly
      const fallback =
        language === 'en'
          ? `⚠️ Image Analysis Incomplete

I received a response from the vision model, but it couldn't detect a cat or provide useful analysis from the image.

**Possible reasons:**
- The image doesn't contain a cat
- The image quality is too low or unclear
- The image is corrupted or invalid

**What you can do:**
1. Verify the image contains a cat
2. Try a clearer, well-lit photo
3. Describe what you see in the image manually

I'm here to help with sensor data and text-based questions.`
          : `⚠️ 圖像分析不完整

我收到了視覺模型的回應，但它無法偵測到貓咪或提供有用的分析。

**可能原因：**
- 圖片中沒有貓咪
- 圖片品質太低或不清楚
- 圖片損壞或無效

**您可以：**
1. 確認圖片中確實有貓咪
2. 嘗試更清晰、光線充足的照片
3. 手動描述您在圖片中看到的內容

我隨時可以協助感測器數據和文字問題。`
      return { summary: null, directResponse: fallback }
    }
  }

  return {
    summary: summaries.length ? summaries.join('\n\n---\n\n') : null,
  }
}

function buildToolResultPrompt(log: ToolExecutionLog, language: LanguageCode) {
  const outputLine = log.output?.trim()

  if (language === 'en') {
    if (log.tool === 'analyzeImage') {
      const summary = outputLine || 'Vision summary unavailable.'
      return log.success
        ? `Vision tool completed. Only rely on this summary when describing the photo:\n${summary}\nIf the summary says the cat is missing, unclear, or the frame is invalid, explicitly say you could not see the cat and ask for another description or image. Never invent posture, lighting, or objects that are not listed above. Tie these vision notes back to sensor data for warm, practical guidance.`
        : `Vision analysis failed: ${log.message}.${outputLine ? ` Details:\n${outputLine}` : ''} Apologise, explain you will fall back to sensors/text only, and invite the user to provide a clearer photo or describe the scene manually.`
    }

    if (log.tool === 'analyzeDocument') {
      const summary = outputLine || 'Document summary unavailable.'
      return log.success
        ? `${summary}\nUse this document overview when responding. Mention that you reviewed the uploaded document, highlight the most relevant finding, and tie it back to the user’s current question checking for consistency.`
        : `Document analysis failed: ${log.message}.${outputLine ? ` Details:\n${outputLine}` : ''} Explain you read the document but encountered an error, and proceed with sensor/text data instead.`
    }

    if (log.tool === 'createCareTask') {
      return log.success
        ? `Care task created successfully. Summarise what was scheduled (title, category, timing) and invite the user to tick it off once completed.`
        : `Task creation failed: ${log.message}.${outputLine ? ` Details:\n${outputLine}` : ''} Explain what went wrong and propose adding the reminder manually.`
    }

    if (log.tool === 'switchToProModel') {
      return log.success
        ? `Pro model engaged. Let the user know you’re switching to the higher-tier reasoning engine, briefly explain why it’s helpful here, and confirm you’ll continue with the upgraded model.`
        : `Switching to the pro model failed: ${log.message}.${outputLine ? ` Details:\n${outputLine}` : ''} Reassure the user you’ll continue with the standard model and invite them to proceed.`
    }

    if (log.tool === 'searchWeb') {
      const prefix = log.message ? `${log.message}\n` : ''
      return log.success
        ? `${prefix}Here are curated search findings. Present them as a numbered list — for each result name the source, highlight the key feline-care insight, and state one concrete action the user can try. Call out any result you discarded for safety or relevance. After the list, connect those ideas back to the user’s current data or routines and invite them to follow up if they want deeper guidance. End with a reminder that online sources may be incomplete and that you’ll prioritise local sensor facts if conflicts arise.\n${outputLine ?? 'No summaries available.'}`
        : `Web search failed: ${log.message}.${outputLine ? ` Details:\n${outputLine}` : ''} Tell the user why it was blocked (safety rules, missing cat-care context, or network issues), remind them to enable search and switch to the pro model if needed, and suggest manual follow-ups or alternative steps grounded in existing data.`
    }

    return log.success
      ? `Tool ${log.tool} executed successfully. Result: ${log.message}.${outputLine ? ` Summary:\n${outputLine}` : ''} Summarise this outcome for the user, extend it with next steps, and keep the tone supportive.`
      : `Tool ${log.tool} failed. Reason: ${log.message}.${outputLine ? ` Details:\n${outputLine}` : ''} Explain the issue to the user and suggest a manual follow-up.`
  }

  if (log.tool === 'analyzeImage') {
    const summary = outputLine || '無視覺摘要'
    return log.success
      ? `視覺工具完成，以下是摘要，描述照片時只能引用這些資訊：\n${summary}\n若摘要指出沒看到貓咪、畫面模糊或內容無法辨識，請直接說「看不清楚」，並請使用者再提供照片或改用文字，絕對不要捏造貓咪的姿勢、燈光或物件。最後把這些觀察與感測數據結合，提供溫暖又務實的照護建議。`
      : `影像分析失敗：${log.message}。${outputLine ? `詳細資訊：\n${outputLine}\n` : ''}請向使用者致歉，說明會改用感測資料與文字資訊，並邀請對方換一張更清楚的照片或直接描述狀況。`
  }

  if (log.tool === 'analyzeDocument') {
    const summary = outputLine || '無文件摘要'
    return log.success
      ? `文件分析完成，以下是重點摘要：\n${summary}\n請說明你已閱讀該文件，並將摘要中最相關的內容與使用者提問連結，確認是否需依據文件進行調整。`
      : `文件分析失敗：${log.message}。${outputLine ? `詳細資訊：\n${outputLine}\n` : ''}請告知使用者無法讀取該文件，並改從感測或文字資料回應。`
  }

  if (log.tool === 'createCareTask') {
    return log.success
      ? `已建立照護任務。請向使用者說明任務內容（名稱、類別、預定時間），並提醒完成後記得勾選。`
      : `建立照護任務失敗，原因：${log.message}。${outputLine ? `詳細資訊：\n${outputLine}\n` : ''}請建議使用者改以手動方式記下提醒。`
  }

  if (log.tool === 'switchToProModel') {
    return log.success
      ? `已切換至 Pro 模型。請告知使用者我們會改用較高階的推理能力，簡述這麼做的理由，並確認接下來的回覆將以 Pro 模型提供。`
      : `切換 Pro 模型失敗，原因：${log.message}。${outputLine ? `詳細資訊：\n${outputLine}\n` : ''}請安撫使用者仍會以標準模型繼續服務，並邀請對方持續對話。`
  }

  if (log.tool === 'searchWeb') {
    const prefix = log.message ? `${log.message}\n` : ''
    return log.success
      ? `${prefix}請用條列方式逐項說明搜尋結果：每一點都要寫出來源名稱、學到的照護重點，並提供一個可立即採取的行動。若有因安全或無關而排除的結果，要明確說明。列完後，把這些建議和使用者目前的感測數據或日常習慣串連起來，提醒外部資訊可能不完整，若與本機感測或紀錄衝突時要以本機資料為準，最後再邀請對方告訴你是否需要更深入的協助。\n${outputLine ?? '無摘要'}`
      : `搜尋失敗，原因：${log.message}。${outputLine ? `詳細資訊：\n${outputLine}\n` : ''}請告知使用者受限原因（例如安全規則、缺少貓咪照護語境或網路問題），提醒若要搜尋需開啟搜尋模式並切換到 Pro 模型，並提出其它可行的查詢方式或根據現有資料進行的手動調查建議。`
  }

  return log.success
    ? `工具 ${log.tool} 執行成功，結果：${log.message}。${outputLine ? `分析摘要：\n${outputLine}\n` : ''}請向使用者說明變更並提醒後續注意事項。`
    : `工具 ${log.tool} 執行失敗，原因：${log.message}。${outputLine ? `詳細資訊：\n${outputLine}\n` : ''}請向使用者描述問題並建議後續動作。`
}

function ensureFriendlyClosing(text: string, language: LanguageCode) {
  const trimmed = text.trim()
  if (!trimmed) return text

  const closing =
    language === 'en'
      ? 'Let me know if you need anything else—I’m right here for you! 😊'
      : '有需要我就在這裡，別擔心！😊'

  const normalized = trimmed.replace(/\s+/g, ' ').toLowerCase()
  const alreadyHasClosing = language === 'en'
    ? normalized.includes('let me know if you need anything else')
    : normalized.includes('有需要我就在這裡')

  if (alreadyHasClosing || trimmed.length > 80) {
    return trimmed
  }

  return `${trimmed}\n\n${closing}`
}

function limitResponseLength(text: string, language: LanguageCode): string {
  const limit = language === 'en' ? 1200 : 900
  const normalized = text.trim()
  if (normalized.length <= limit) {
    return normalized
  }
  const truncated = normalized.slice(0, limit)
  const safe = truncated.replace(/\s+\S*$/, '').trim()
  return safe.length ? `${safe}…` : `${normalized.slice(0, limit)}…`
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function sendAlertNotification(
  alert: AutomationAlert,
  context?: PushNotificationContext,
): Promise<PushDeliverySummary> {
  const summary: PushDeliverySummary = {
    web: { targeted: 0, sent: 0, failed: 0 },
    native: { targeted: 0, sent: 0, failed: 0 },
  }
  const payload = buildNotificationPayload(alert, context)
  const payloadString = JSON.stringify(payload)

  if (pushNotificationsEnabled) {
    const subscriptions = listPushSubscriptions()
    summary.web.targeted = subscriptions.length
    let lastError: string | null = null

    for (let index = 0; index < subscriptions.length; index += PUSH_BATCH_SIZE) {
      const batch = subscriptions.slice(index, index + PUSH_BATCH_SIZE)
      await Promise.all(
        batch.map(async ({ endpoint, subscription }) => {
          try {
            await webPush.sendNotification(subscription as any, payloadString)
            summary.web.sent += 1
          } catch (error: unknown) {
            summary.web.failed += 1
            lastError = error instanceof Error ? error.message : String(error)
            const statusCode = (error as { statusCode?: number }).statusCode
            if (statusCode === 404 || statusCode === 410) {
              logger.warn('[push] Removing expired subscription', endpoint)
              removePushSubscription(endpoint)
            } else {
              logger.warn('[push] Failed to deliver notification', endpoint, error)
            }
          }
        }),
      )
      if (index + PUSH_BATCH_SIZE < subscriptions.length && PUSH_BATCH_DELAY_MS > 0) {
        await delay(PUSH_BATCH_DELAY_MS)
      }
    }

    recordPushDelivery('web', { success: summary.web.sent, failure: summary.web.failed, error: lastError })
  }

  if (nativePushService) {
    const nativeResult = await nativePushService.send({
      body: payload.body,
      severity: alert.severity,
      fallbackTitle: payload.title,
      data: Object.fromEntries(
        Object.entries(payload.data).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]),
      ),
    })
    summary.native.targeted = nativeResult.apns.targeted + nativeResult.fcm.targeted
    summary.native.sent = nativeResult.apns.sent + nativeResult.fcm.sent
    summary.native.failed = Math.max(summary.native.targeted - summary.native.sent, 0)
    recordPushDelivery('native', {
      success: summary.native.sent,
      failure: summary.native.failed,
      error: nativeResult.error ?? null,
    })
  }

  return summary
}

if (latestSnapshot && !storedSettings) {
  currentSettings = latestSnapshot.settings
  persistSettings(currentSettings)
}

async function applySettings(next: SmartHomeSettings) {
  const release = await snapshotMutex.acquire()
  try {
    currentSettings = { ...next }
    persistSettings(currentSettings)
    if (latestSnapshot) {
      latestSnapshot = {
        ...latestSnapshot,
        settings: currentSettings,
        status: deriveStatus(latestSnapshot.reading, currentSettings),
      }
      const targetCatId = latestSnapshot.catId ?? activeCatId
      latestSnapshotsByCat.set(targetCatId, latestSnapshot)
      persistSnapshot(latestSnapshot, HISTORY_LIMIT, targetCatId)
    }
    pushSettingsToHardware(currentSettings)
  } finally {
    release()
  }
}

function scheduleBehaviorProfileRefresh(catId: string) {
  const existing = pendingBehaviorRefreshTimers.get(catId)
  if (existing) {
    clearTimeout(existing)
  }
  const handle = setTimeout(() => {
    pendingBehaviorRefreshTimers.delete(catId)
    try {
      refreshBehaviorProfile(catId)
    } catch (error) {
      logger.warn('[behavior] Failed to refresh profile for cat', catId, error)
    }
  }, BEHAVIOR_REFRESH_DELAY_MS)
  pendingBehaviorRefreshTimers.set(catId, handle)
}

async function applySnapshot(catId: string, snapshot: SmartHomeSnapshot) {
  const release = await snapshotMutex.acquire()
  try {
    const normalized = snapshot.catId ? snapshot : { ...snapshot, catId }
    latestSnapshotsByCat.set(catId, normalized)
    if (catId === activeCatId) {
      latestSnapshot = normalized
    }
    persistSnapshot(normalized, HISTORY_LIMIT, catId)
    scheduleBehaviorProfileRefresh(catId)
  } finally {
    release()
  }
}

async function handleIncomingReading(catId: string, reading: SmartHomeReading, settingsOverride?: SmartHomeSettings) {
  const previousSnapshot = latestSnapshotsByCat.get(catId) ?? null
  const activeSettings = settingsOverride ?? currentSettings
  const normalized: SmartHomeReading = {
    ...reading,
    timestamp: reading.timestamp,
  }

  if (normalized.audio) {
    normalized.audio.volumePercent = Math.max(0, Math.min(100, normalized.audio.volumePercent))
    latestAudioStatus = { ...normalized.audio }
  } else if (latestAudioStatus) {
    normalized.audio = { ...latestAudioStatus }
  }

  if (normalized.uvFan) {
    latestUvFanStatus = { ...normalized.uvFan }
  } else if (latestUvFanStatus) {
    normalized.uvFan = { ...latestUvFanStatus }
  }

  if (normalized.vision) {
    updateCameraRuntimeFromReading(normalized.vision)
    latestVisionStatus = getCameraRuntime()
  } else if (latestVisionStatus) {
    normalized.vision = { ...latestVisionStatus }
  }

  if (
    normalized.vision?.inference &&
    normalized.vision.inference.catDetected &&
    normalized.vision.inference.probability >= 0.5 &&
    normalized.catPresent === false
  ) {
    normalized.catPresent = true
  }

  const capacity = Math.max(0, activeSettings.waterBowlLevelTargetMl)
  const hasValidIntake =
    typeof normalized.waterIntakeMl === 'number' && Number.isFinite(normalized.waterIntakeMl) && normalized.waterIntakeMl >= 0

  if (typeof normalized.waterLevelPercent === 'number' && Number.isFinite(normalized.waterLevelPercent)) {
    const clamped = Math.min(100, Math.max(0, normalized.waterLevelPercent))
    normalized.waterLevelPercent = clamped
    if (!hasValidIntake || normalized.waterIntakeMl > capacity) {
      const remainingMl = (capacity * clamped) / 100
      normalized.waterIntakeMl = capacity > 0 ? Math.max(0, capacity - remainingMl) : 0
    }
  } else if (hasValidIntake && capacity > 0 && normalized.waterIntakeMl <= capacity) {
    const remaining = capacity - normalized.waterIntakeMl
    normalized.waterLevelPercent = Math.max(0, Math.min(100, (remaining / capacity) * 100))
  }

  if (typeof normalized.ambientLightPercent === 'number') {
    normalized.ambientLightPercent = Math.max(0, Math.min(100, normalized.ambientLightPercent))
  }

  const catThreshold = getCatPresenceThresholdKg()

  if (typeof normalized.catPresent !== 'boolean') {
    normalized.catPresent = normalized.catWeightKg >= catThreshold
  }

  if (typeof normalized.waterLevelPercent === 'number') {
    const waterPercent = Math.round(normalized.waterLevelPercent)
    if (normalized.waterLevelPercent < 10) {
      pushAlert({ key: 'waterLevelCritical', variables: { percent: waterPercent }, severity: 'critical' })
    } else if (normalized.waterLevelPercent < 25) {
      pushAlert({ key: 'waterLevelLow', variables: { percent: waterPercent }, severity: 'warning' })
    }
  }

  if (typeof normalized.ambientLightPercent === 'number' && normalized.catPresent) {
    const brightnessPercent = Math.round(normalized.ambientLightPercent)
    if (normalized.ambientLightPercent < 15) {
      pushAlert({ key: 'brightnessLow', severity: 'warning' })  // 修正: info → warning (觸發推播)
    } else if (normalized.ambientLightPercent > 90) {
      pushAlert({ key: 'brightnessHigh', variables: { percent: brightnessPercent }, severity: 'warning' })
    }
  }

  const nowInside = normalized.catPresent ?? normalized.catWeightKg >= catThreshold
  const wasInside = previousSnapshot
    ? previousSnapshot.reading.catPresent ?? previousSnapshot.reading.catWeightKg >= catThreshold
    : null
  if (wasInside === true && nowInside === false) {
    pushAlert({ key: 'catLeft', severity: 'info' })
  }

  if (nowInside === false && normalized.lastFeedingMinutesAgo > 360) {
    pushAlert({ key: 'catAwayTooLong', severity: 'warning' })
  }

  evaluateAlertRules(normalized)

  const snapshot = buildSnapshot(normalized, activeSettings)
  const enrichedSnapshot = snapshot.catId ? snapshot : { ...snapshot, catId }
  await applySnapshot(catId, enrichedSnapshot)
  if (catId === activeCatId) {
    latestSnapshot = enrichedSnapshot
  }
  logger.info('[snapshot] stored', enrichedSnapshot.reading.timestamp, 'for cat', catId)
  return enrichedSnapshot
}

serialBridge = maybeStartSerialBridge((reading) => {
  logger.info('[serial] received reading from Arduino')
  void handleIncomingReading(activeCatId, reading)
})

if (serialBridge) {
  pushSettingsToHardware(currentSettings)
  if (currentCalibration) {
    pushCalibrationToHardware(currentCalibration)
  }
}

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  if (!username || !password) {
    res.status(400).json({ ok: false, message: 'missing-credentials' })
    return
  }

  // 🔒 安全改進：現在使用 bcrypt 異步驗證密碼
  const user = await authenticateUser(username, password)
  if (!user) {
    res.status(401).json({ ok: false, message: 'invalid-credentials' })
    return
  }

  const token = issueSession(user)
  res.json({
    ok: true,
    data: {
      token,
      user: getPublicUser(user),
    },
  })
})

app.post('/api/auth/logout', (req, res) => {
  invalidateSession(req.authToken)
  res.json({ ok: true })
})

app.get('/api/auth/me', (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  res.json({ ok: true, data: { user: getPublicUser(req.authUser) } })
})

app.get('/health', (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  const chatMetrics = getChatMetrics()
  const isDeveloper = req.authUser?.role === 'developer'
  const base = {
    status: 'healthy',
    lastSnapshotAt: latestSnapshot?.reading.timestamp ?? null,
    historyCount: loadHistory(HISTORY_LIMIT, activeCatId).length,
    llmTimeoutMs: aiConfig.request.overallMs,
    chat: {
      provider: chatMetrics.provider,
      source: isDeveloper ? chatMetrics.source ?? null : null,
      durationMs: chatMetrics.durationMs,
      updatedAt: chatMetrics.updatedAt,
      error: isDeveloper ? chatMetrics.error ?? null : null,
    },
    activeCatId,
    cats: listCats(),
  }

  const data = isDeveloper
    ? {
        ...base,
        toolEvents: getRecentToolEvents(5),
        pinnedToolEvents: getPinnedToolEvents(),
        alertRules: alertRulesCache,
        notifications: {
          fixes: listNotificationFixes(5),
        },
      }
    : {
        ...base,
        toolEvents: [],
        pinnedToolEvents: [],
        alertRules: [],
        notifications: {
          fixes: [],
        },
      }

  res.json({ ok: true, data })
})

app.get('/api/tool-events/pinned', (req, res) => {
  if (!requireDeveloper(req, res)) {
    return
  }
  res.json({ ok: true, data: getPinnedToolEvents() })
})

app.post('/api/tool-events/pinned', (req, res) => {
  if (!requireDeveloper(req, res)) {
    return
  }
  const normalized = normalizeToolEventPayload(req.body)
  if (!normalized) {
    res.status(400).json({ ok: false, message: 'invalid-tool-event' })
    return
  }

  if (PINNED_TOOL_EVENTS.has(normalized.timestamp)) {
    res.json({ ok: true, data: getPinnedToolEvents() })
    return
  }

  const pinnedAt = new Date().toISOString()
  const entry = { ...normalized, pinnedAt }
  PINNED_TOOL_EVENTS.set(normalized.timestamp, entry)
  savePinnedToolEvent({ ...normalized, pinnedAt })
  enforcePinnedLimit()

  res.json({ ok: true, data: getPinnedToolEvents() })
})

app.delete('/api/tool-events/pinned/:timestamp', (req, res) => {
  if (!requireDeveloper(req, res)) {
    return
  }
  const { timestamp } = req.params
  if (!timestamp) {
    res.status(400).json({ ok: false, message: 'missing-timestamp' })
    return
  }
  if (!PINNED_TOOL_EVENTS.has(timestamp)) {
    res.status(404).json({ ok: false, message: 'pinned-event-not-found' })
    return
  }
  PINNED_TOOL_EVENTS.delete(timestamp)
  removePinnedToolEvent(timestamp)
  res.json({ ok: true, data: getPinnedToolEvents() })
})

app.get('/api/alert-rules', (_req, res) => {
  res.json({ ok: true, data: alertRulesCache })
})

app.post('/api/alert-rules', (req, res) => {
  const validation = validateAlertRule(req.body)
  if (!validation.ok) {
    res.status(400).json({ ok: false, message: validation.message })
    return
  }

  const { metric, comparison, threshold, severity, message } = validation.value

  // Apply additional checks for metric using existing SET
  if (!ALERT_RULE_METRICS.has(metric as AlertRule['metric'])) {
    res.status(400).json({ ok: false, message: 'invalid-metric' })
    return
  }

  const payload = {
    metric: metric as AlertRule['metric'],
    comparison: comparison as AlertRule['comparison'],
    threshold,
    severity: severity as AlertRule['severity'],
    message,
    enabled: true,
  }

  const rule = createAlertRule(payload)
  refreshAlertRules()
  res.status(201).json({ ok: true, data: rule })
})

app.patch('/api/alert-rules/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, message: 'invalid-id' })
    return
  }

  const validation = validateAlertRule(req.body)
  if (!validation.ok) {
    res.status(400).json({ ok: false, message: validation.message })
    return
  }

  const { comparison, threshold, severity, message } = validation.value
  const enabled = typeof req.body.enabled === 'boolean' ? req.body.enabled : true

  const payload = {
    comparison: comparison as AlertRule['comparison'],
    threshold,
    severity: severity as AlertRule['severity'],
    message,
    enabled,
  }

  updateAlertRule({ id, ...payload })
  refreshAlertRules()
  const updated = alertRulesCache.find((rule) => rule.id === id)
  if (!updated) {
    res.status(404).json({ ok: false, message: 'alert-rule-not-found' })
    return
  }
  res.json({ ok: true, data: updated })
})

app.delete('/api/alert-rules/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, message: 'invalid-id' })
    return
  }
  removeAlertRule(id)
  refreshAlertRules()
  res.json({ ok: true, data: alertRulesCache })
})

app.get('/api/memories/keywords', (req, res) => {
  if (!requireDeveloper(req, res)) {
    return
  }
  const limitParam = req.query.limit
  const limit = typeof limitParam === 'string' ? Number(limitParam) : 20
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 50) : 20
  res.json({ ok: true, data: getMemoryKeywordStats(safeLimit) })
})

app.use('/api/chat/favorites', createChatFavoritesRouter(chatFavoritesService))



app.post('/api/chat/ultra', chatLimiter, async (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }

  const requestedLanguage = typeof req.body?.language === 'string' ? req.body.language : undefined
  const rememberLanguage = req.body?.rememberLanguage === true
  const resolvedLanguage = resolveRequestLanguage(requestedLanguage)
  if (rememberLanguage && (requestedLanguage === 'zh' || requestedLanguage === 'en')) {
    setPersistedLanguage(requestedLanguage)
  }

  await runWithLanguageContext(resolvedLanguage, async () => {
    const connection = new SSEConnection(res, crypto.randomUUID())

    try {
      const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
      if (!message) {
        connection.sendError(
          resolvedLanguage === 'en'
            ? 'Please enter a question before using Ultra mode.'
            : '請先輸入問題再使用 Ultra 模式。',
        )
        return
      }

      const requestedCatId =
        typeof req.body?.catId === 'string' && req.body.catId.trim().length > 0
          ? req.body.catId.trim()
          : activeCatId

      let snapshotForChat =
        latestSnapshotsByCat.get(requestedCatId) ?? loadLatestSnapshot(requestedCatId) ?? latestSnapshot
      if (snapshotForChat && snapshotForChat.catId !== requestedCatId) {
        snapshotForChat = { ...snapshotForChat, catId: requestedCatId }
      }
      if (snapshotForChat) {
        latestSnapshotsByCat.set(requestedCatId, snapshotForChat)
      }

      // 🐾 Fetch pet profile if provided
      const petProfileId = typeof req.body?.petProfileId === 'string' && req.body.petProfileId.trim().length > 0
        ? req.body.petProfileId.trim()
        : null
      const petProfile = petProfileId ? getPetProfile(petProfileId) : null
      if (petProfileId && !petProfile) {
        logger.warn(`[chat-ultra] Pet profile not found: ${petProfileId}, continuing without pet profile`)
      }

      const memoryRecords: MemoryEntry[] = listMemories(6).map((entry) => {
        const type: MemoryType =
          entry.type === 'conversation' || entry.type === 'setting' || entry.type === 'note' ? (entry.type as MemoryType) : 'note'
        return {
          id: entry.id,
          type,
          content: entry.content,
          source: entry.source,
          createdAt: entry.createdAt ?? new Date().toISOString(),
        }
      })
      const conversationHistory = loadHistory(12, requestedCatId)

      type IncomingAttachment = {
        type?: string
        data?: string
        dataUrl?: string
        mimeType?: string
        filename?: string
      }
      const rawAttachment = req.body?.attachment as IncomingAttachment | undefined
      const fileAttachmentIds = Array.isArray(req.body?.fileAttachments)
        ? (req.body.fileAttachments as unknown[]).filter(
            (value): value is string => typeof value === 'string' && value.trim().length > 0,
          )
        : []
      const fileAttachmentSummary = buildFileAttachmentSummary(fileAttachmentIds)
      const fileVisionContext = buildFileAttachmentVisionContext(fileAttachmentIds, resolvedLanguage)

      let visionSummary: string | null = fileVisionContext.visionSummary
      let hasImageAttachment = fileVisionContext.hasImageAttachment
      if (
        rawAttachment &&
        typeof rawAttachment === 'object' &&
        rawAttachment.type === 'image' &&
        (typeof rawAttachment.data === 'string' || typeof (rawAttachment as Record<string, unknown>).dataUrl === 'string')
      ) {
        hasImageAttachment = true
        try {
          const base64Payload =
            (typeof rawAttachment.data === 'string' && rawAttachment.data) ||
            ((rawAttachment as Record<string, unknown>).dataUrl as string)
          const analysis = await analyzeImageWithQwen({
            imageBase64: base64Payload,
            mimeType: typeof rawAttachment.mimeType === 'string' ? rawAttachment.mimeType : undefined,
            prompt: message,
            language: resolvedLanguage,
          })
          const analysisText = typeof analysis.text === 'string' ? analysis.text.trim() : ''
          visionSummary = analysisText
            ? visionSummary
              ? `${visionSummary}\n\n---\n\n${analysisText}`
              : analysisText
            : visionSummary
        } catch (error) {
          logger.warn('[chat-ultra] Vision analysis failed', { error })
        }
      }

      const reasoningEffort =
        typeof req.body?.reasoningEffort === 'string' &&
        ['low', 'medium', 'high'].includes(req.body.reasoningEffort)
          ? (req.body.reasoningEffort as ReasoningEffort)
          : 'high'

      connection.sendPhase(
        'analyzing_data',
        resolvedLanguage === 'en' ? 'Gathering latest cat data…' : '正在整理最新的貓屋資料…',
      )

      const startTime = Date.now()

      connection.sendPhase(
        'retrieving_memory',
        resolvedLanguage === 'en' ? 'PhiLia093 drafting first pass…' : 'PhiLia093 正在撰寫初稿…',
      )
      const proDraft = await generateChatContent({
        question: message,
        language: resolvedLanguage,
        snapshot: snapshotForChat,
        history: conversationHistory,
        catId: requestedCatId,
        memories: memoryRecords,
        modelPreference: 'pro',
        reasoningEffort,
        enableSearch: false,
        personaTier: 'pro',
        isDeveloperMode: req.authUser.role === 'developer',
        hasImageAttachment,
        visionSummary,
        hasFileAttachment: Boolean(fileAttachmentSummary),
        fileAttachmentSummary,
        petProfile,
      })

      connection.sendPhase(
        'generating_response',
        resolvedLanguage === 'en' ? 'Balanced layer reviewing…' : '平衡層正在審查…',
      )
      const reviewPrompt =
        resolvedLanguage === 'en'
          ? `You are Meme. Review this draft and list 3 concise improvements.

Question: ${message}
Draft: ${proDraft.text}`
          : `你是 Meme，請審查下列草稿並列出三點簡潔改善建議。

問題：${message}
草稿：${proDraft.text}`
      const standardReview = await generateChatContent({
        question: reviewPrompt,
        language: resolvedLanguage,
        snapshot: snapshotForChat,
        history: conversationHistory,
        catId: requestedCatId,
        memories: memoryRecords,
        modelPreference: 'standard',
        reasoningEffort: 'medium',
        enableSearch: false,
        personaTier: 'standard',
        isDeveloperMode: req.authUser.role === 'developer',
        petProfile,
      })

      connection.sendPhase(
        'generating_response',
        resolvedLanguage === 'en' ? 'Elysia synthesizing final answer…' : 'Elysia 正在整合最終答案…',
      )
      const finalPrompt =
        resolvedLanguage === 'en'
          ? `You are Elysia. Original question: ${message}
First draft:
${proDraft.text}
Balanced review:
${standardReview.text}
Update the answer accordingly.`
          : `你是 Elysia。原始問題：${message}
初稿：
${proDraft.text}
平衡審查：
${standardReview.text}
請根據審查重新整理最終答覆。`
      const finalResult = await generateChatContent({
        question: finalPrompt,
        language: resolvedLanguage,
        snapshot: snapshotForChat,
        history: conversationHistory,
        catId: requestedCatId,
        memories: memoryRecords,
        modelPreference: 'pro',
        reasoningEffort,
        enableSearch: false,
        personaTier: 'ultra',
        isDeveloperMode: req.authUser.role === 'developer',
        hasImageAttachment,
        visionSummary,
        hasFileAttachment: Boolean(fileAttachmentSummary),
        fileAttachmentSummary,
        petProfile,
      })

      const finalText = finalResult.text && finalResult.text.trim().length > 0 ? finalResult.text.trim() : proDraft.text

      connection.sendPhase(
        'streaming_text',
        resolvedLanguage === 'en' ? 'Streaming Ultra response…' : '正在輸出 Ultra 回覆…',
      )
      await TextStreamer.streamText(connection, finalText, 30)

      const totalDurationMs = Date.now() - startTime
      connection.sendDone({
        totalTokens: finalResult.usage?.totalTokens ?? finalText.length,
        totalDurationMs,
        proFirstOutput: {
          text: proDraft.text,
          thinkingText: proDraft.thinking ?? null,
          outputTokens: proDraft.usage?.completionTokens ?? proDraft.text.length,
          promptTokens: proDraft.usage?.promptTokens ?? message.length,
        },
        proFinalOutput: {
          text: finalText,
          thinkingText: finalResult.thinking ?? null,
          outputTokens: finalResult.usage?.completionTokens ?? finalText.length,
          promptTokens: finalResult.usage?.promptTokens ?? message.length,
        },
        standardReview: {
          concerns: standardReview.text
            ? standardReview.text.split(/\n+/).filter((line) => line.trim().length > 0)
            : [],
        },
        toolSummary: [],
        developer: finalResult.thinking ? { thinking: finalResult.thinking } : null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ultra request failed'
      logger.error('[chat-ultra] Failed to generate response', { error: message })
      connection.sendError(
        resolvedLanguage === 'en'
          ? `Ultra mode failed: ${message}`
          : `Ultra 模式失敗：${message}`,
      )
    } finally {
      connection.send({ type: 'metadata', data: { closing: true } })
      connection.close()
    }
  })
})



app.get('/api/reports/professional', (req, res) => {
  const reportCatId = typeof req.query.catId === 'string' && req.query.catId.trim().length > 0 ? req.query.catId.trim() : activeCatId
  const snapshot = loadLatestSnapshot(reportCatId)
  const history = loadHistory(Math.max(HISTORY_LIMIT, 96), reportCatId)
  const alerts = loadAutomationAlerts(10)
  const report = buildProfessionalCareReport({
    snapshot,
    history,
    alerts,
    settings: currentSettings,
    language: getPreferredLanguage(),
  })
  res.json({ ok: true, data: report })
})

app.get('/api/analytics/insights', (req, res) => {
  const insightsCatId = typeof req.query.catId === 'string' && req.query.catId.trim().length > 0 ? req.query.catId.trim() : activeCatId
  const snapshot = loadLatestSnapshot(insightsCatId)
  const history = loadHistory(Math.max(HISTORY_LIMIT, 96), insightsCatId)
  const insights = deriveCareInsights(getPreferredLanguage(), snapshot, history, currentSettings)
  res.json({
    ok: true,
    data: {
      generatedAt: new Date().toISOString(),
      sampleCount: history.length,
      insights,
    },
  })
})

app.get('/api/analytics/forecast', (req, res) => {
  const forecastCatId = typeof req.query.catId === 'string' && req.query.catId.trim().length > 0 ? req.query.catId.trim() : activeCatId
  const history = loadHistory(Math.max(HISTORY_LIMIT, 120), forecastCatId)
  const forecast = deriveBehaviorForecast(getPreferredLanguage(), history)
  res.json({ ok: true, data: forecast })
})

app.get('/api/behavior/profile', (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  const profileCatId =
    typeof req.query.catId === 'string' && req.query.catId.trim().length > 0 ? req.query.catId.trim() : activeCatId
  try {
    const profile = ensureBehaviorProfile(profileCatId)
    res.json({ ok: true, data: profile })
  } catch (error) {
    logger.error('[behavior] Failed to load behavior profile', error)
    res.status(500).json({ ok: false, message: 'behavior-profile-unavailable' })
  }
})

app.post('/api/behavior/profile/refresh', (req, res) => {
  if (!requireDeveloper(req, res)) {
    return
  }
  const profileCatId =
    typeof req.body?.catId === 'string' && req.body.catId.trim().length > 0 ? req.body.catId.trim() : activeCatId
  try {
    const profile = refreshBehaviorProfile(profileCatId)
    res.json({ ok: true, data: profile })
  } catch (error) {
    logger.error('[behavior] Failed to refresh behavior profile', error)
    res.status(500).json({ ok: false, message: 'behavior-profile-refresh-failed' })
  }
})

app.get('/api/knowledge/articles', (req, res) => {
  const queryRaw = typeof req.query.q === 'string' ? req.query.q : ''

  // Validate and sanitize query parameter
  const queryValidation = validateQueryString(queryRaw)
  if (!queryValidation.ok && queryRaw.length > 0) {
    res.status(400).json({ ok: false, message: queryValidation.message })
    return
  }
  const query = queryValidation.ok ? queryValidation.value : ''

  const tagsRaw = typeof req.query.tags === 'string' ? req.query.tags : ''
  const parsedTags = tagsRaw
    .split(/[,;]/)
    .map((tag) => sanitizeString(tag))
    .filter((tag) => tag.length > 0 && tag.length <= VALIDATION_LIMITS.MAX_SHORT_TEXT_LENGTH)

  const limitParam = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 5
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 10) : 5

  const articles =
    query.trim().length > 0 || parsedTags.length > 0
      ? retrieveKnowledgeArticles(getPreferredLanguage(), query, limit, parsedTags)
      : listKnowledgeArticles(getPreferredLanguage()).slice(0, limit)

  res.json({ ok: true, data: articles })
})

// ═══════════════════════════════════════════════════════════════════════
// 📁 File Upload APIs
// ═══════════════════════════════════════════════════════════════════════

app.post('/api/files/upload', generalLimiter, (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  void handleFileUpload(req, res)
})

app.post('/api/files/:id/analyze', generalLimiter, (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  void handleFileAnalyze(req, res)
})

app.get('/api/files', (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  void handleFileList(req, res)
})

app.delete('/api/files/:id', (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  void handleFileDelete(req, res)
})

app.get('/api/files/:id/download', (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  void handleFileDownload(req, res)
})

// ═══════════════════════════════════════════════════════════════════════

app.get('/api/tasks', (req, res) => {
  const limitParam = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 50
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50
  const tasks = listCareTasks(limit)
  res.json({ ok: true, data: tasks })
})

app.post('/api/tasks', (req, res) => {
  if (!ensureAdminAuthorized(req, res)) {
    return
  }

  const validation = validateTask(req.body)
  if (!validation.ok) {
    res.status(400).json({ ok: false, message: validation.message })
    return
  }

  const { title, description, category, dueDate } = validation.value
  const safeDescription = description ?? ''
  const { metadata } = req.body ?? {}

  // Additional validation for metadata
  if (metadata && typeof metadata !== 'object') {
    res.status(400).json({ ok: false, message: 'invalid-metadata' })
    return
  }

  const taskPayload: Parameters<typeof createCareTask>[0] = {
    title,
    description: safeDescription,
    category: category as CareInsightCategory | 'general',
    source: 'user',
  }

  if (dueDate && dueDate.length > 0) {
    taskPayload.dueAt = dueDate
  }
  if (metadata && typeof metadata === 'object') {
    taskPayload.metadata = metadata as Record<string, unknown>
  }

  const task = createCareTask(taskPayload)
  res.status(201).json({ ok: true, data: task })
})

app.post('/api/tasks/suggest', (req, res) => {
  if (!ensureAdminAuthorized(req, res)) {
    return
  }
  const snapshot = loadLatestSnapshot(activeCatId)
  const history = loadHistory(Math.max(HISTORY_LIMIT, 96), activeCatId)
  const suggestions = suggestCareTasks(getPreferredLanguage(), snapshot, history)
  const existingTasks = listCareTasks(100)
  const pendingKeys = new Set(
    existingTasks
      .filter((task) => task.status === 'pending')
      .map((task) => `${task.category}|${task.title}`),
  )
  const created: CareTask[] = []
  for (const suggestion of suggestions) {
    const key = `${suggestion.category}|${suggestion.title}`
    if (pendingKeys.has(key)) continue
    pendingKeys.add(key)
    const suggestionPayload: Parameters<typeof createCareTask>[0] = {
      title: suggestion.title,
      description: suggestion.description,
      category: suggestion.category,
      source: 'ai',
    }
    if (suggestion.dueAt) {
      suggestionPayload.dueAt = suggestion.dueAt
    }
    const metadata: Record<string, unknown> = suggestion.metadata ? { ...suggestion.metadata } : {}
    if (suggestion.urgency) {
      metadata.urgency = suggestion.urgency
    }
    if (Object.keys(metadata).length > 0) {
      suggestionPayload.metadata = metadata
    }
    const task = createCareTask(suggestionPayload)
    created.push(task)
  }
  res.json({
    ok: true,
    data: {
      generatedAt: new Date().toISOString(),
      created,
      suggestions,
    },
  })
})

app.patch('/api/tasks/:id', (req, res) => {
  if (!ensureAdminAuthorized(req, res)) {
    return
  }
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, message: 'invalid-task-id' })
    return
  }
  const { status } = req.body ?? {}
  if (typeof status !== 'string' || !CARE_TASK_STATUS_VALUES.has(status as CareTaskStatus)) {
    res.status(400).json({ ok: false, message: 'invalid-task-status' })
    return
  }
  const updated = updateCareTaskStatus(id, status as CareTaskStatus)
  if (!updated) {
    res.status(404).json({ ok: false, message: 'task-not-found' })
    return
  }
  res.json({ ok: true, data: updated })
})

app.delete('/api/tasks/:id', (req, res) => {
  if (!ensureAdminAuthorized(req, res)) {
    return
  }
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, message: 'invalid-task-id' })
    return
  }
  removeCareTask(id)
  res.json({ ok: true })
})

app.get('/api/plugins', (req, res) => {
  if (!ensureDeveloperOrAdmin(req, res)) {
    return
  }
  res.json({ ok: true, data: listCarePlugins() })
})

app.post('/api/plugins', (req, res) => {
  if (!ensureDeveloperOrAdmin(req, res)) {
    return
  }

  const { capabilities, enabled, metadata, apiBaseUrl: apiBaseUrlRaw } = req.body ?? {}

  // Prepare validation payload with required apiBaseUrl (use placeholder if empty)
  const validationPayload = {
    ...req.body,
    apiBaseUrl: typeof apiBaseUrlRaw === 'string' && apiBaseUrlRaw.trim().length > 0
      ? apiBaseUrlRaw
      : 'http://placeholder.local', // Placeholder for validation
  }

  // Only validate if apiBaseUrl is provided and non-empty
  if (typeof apiBaseUrlRaw === 'string' && apiBaseUrlRaw.trim().length > 0) {
    const validation = validatePlugin(validationPayload)
    if (!validation.ok) {
      res.status(400).json({ ok: false, message: validation.message })
      return
    }
  } else {
    // Still validate name and description without apiBaseUrl
    if (typeof req.body?.name !== 'string' || sanitizeString(req.body.name).length === 0) {
      res.status(400).json({ ok: false, message: 'plugin-name-required' })
      return
    }
    if (req.body?.name && sanitizeString(req.body.name).length > VALIDATION_LIMITS.MAX_SHORT_TEXT_LENGTH) {
      res.status(400).json({ ok: false, message: 'plugin-name-too-long' })
      return
    }
    if (req.body?.description && sanitizeString(req.body.description).length > VALIDATION_LIMITS.MAX_CONTENT_LENGTH) {
      res.status(400).json({ ok: false, message: 'plugin-description-too-long' })
      return
    }
  }

  // Additional validation for other fields
  if (capabilities && !Array.isArray(capabilities)) {
    res.status(400).json({ ok: false, message: 'plugin-capabilities-invalid' })
    return
  }
  if (metadata && typeof metadata !== 'object') {
    res.status(400).json({ ok: false, message: 'plugin-metadata-invalid' })
    return
  }

  const normalizedCapabilities = Array.isArray(capabilities)
    ? capabilities.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : []

  const pluginPayload: Parameters<typeof upsertCarePlugin>[0] = {
    name: sanitizeString(req.body.name),
    enabled: typeof enabled === 'boolean' ? enabled : true,
  }

  if (normalizedCapabilities.length > 0) {
    pluginPayload.capabilities = normalizedCapabilities
  }
  if (typeof req.body.description === 'string') {
    const trimmedDescription = sanitizeString(req.body.description)
    if (trimmedDescription.length > 0) {
      pluginPayload.description = trimmedDescription
    }
  }
  if (typeof apiBaseUrlRaw === 'string') {
    const trimmedBase = apiBaseUrlRaw.trim()
    pluginPayload.apiBaseUrl = trimmedBase.length > 0 ? trimmedBase : null
  }
  if (metadata && typeof metadata === 'object') {
    pluginPayload.metadata = metadata as Record<string, unknown>
  }

  const plugin = upsertCarePlugin(pluginPayload)
  res.status(201).json({ ok: true, data: plugin })
})

app.patch('/api/plugins/:id', (req, res) => {
  if (!ensureDeveloperOrAdmin(req, res)) {
    return
  }
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, message: 'invalid-plugin-id' })
    return
  }
  const { enabled } = req.body ?? {}
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ ok: false, message: 'plugin-enabled-required' })
    return
  }
  const updated = updateCarePluginEnabled(id, enabled)
  if (!updated) {
    res.status(404).json({ ok: false, message: 'plugin-not-found' })
    return
  }
  res.json({ ok: true, data: updated })
})

app.delete('/api/plugins/:id', (req, res) => {
  if (!ensureDeveloperOrAdmin(req, res)) {
    return
  }
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, message: 'invalid-plugin-id' })
    return
  }
  deleteCarePlugin(id)
  res.json({ ok: true })
})

// ============================================
// 🐾 Pet Profiles API
// ============================================

app.get('/api/pet-profiles', (_req, res) => {
  try {
    const profiles = listPetProfiles()
    res.json({ ok: true, data: profiles })
  } catch (error) {
    logger.error('[api] Failed to list pet profiles', { error })
    res.status(500).json({ ok: false, message: 'internal-error' })
  }
})

app.get('/api/pet-profiles/:id', (req, res) => {
  try {
    const { id } = req.params
    const profile = getPetProfile(id)
    if (!profile) {
      res.status(404).json({ ok: false, message: 'profile-not-found' })
      return
    }
    res.json({ ok: true, data: profile })
  } catch (error) {
    logger.error('[api] Failed to get pet profile', { error })
    res.status(500).json({ ok: false, message: 'internal-error' })
  }
})

app.post('/api/pet-profiles', (req, res) => {
  if (!ensureDeveloperOrAdmin(req, res)) {
    return
  }
  try {
    const { type, name, customLabel, icon, temperatureRangeMin, temperatureRangeMax, humidityRangeMin, humidityRangeMax, waterTarget, feedingSchedule } = req.body ?? {}

    // Validate required fields
    if (!type || !name) {
      res.status(400).json({ ok: false, message: 'missing-required-fields' })
      return
    }

    // Validate type
    const validTypes = ['cat', 'dog', 'bird', 'custom']
    if (!validTypes.includes(type)) {
      res.status(400).json({ ok: false, message: 'invalid-pet-type' })
      return
    }

    const profile = createPetProfile({
      type,
      name,
      customLabel,
      icon,
      temperatureRangeMin,
      temperatureRangeMax,
      humidityRangeMin,
      humidityRangeMax,
      waterTarget,
      feedingSchedule,
    })

    res.json({ ok: true, data: profile })
  } catch (error) {
    logger.error('[api] Failed to create pet profile', { error })
    res.status(500).json({ ok: false, message: 'internal-error' })
  }
})

app.put('/api/pet-profiles/:id', (req, res) => {
  if (!ensureDeveloperOrAdmin(req, res)) {
    return
  }
  try {
    const { id } = req.params
    const { name, customLabel, icon, temperatureRangeMin, temperatureRangeMax, humidityRangeMin, humidityRangeMax, waterTarget, feedingSchedule } = req.body ?? {}

    const profile = updatePetProfile(id, {
      name,
      customLabel,
      icon,
      temperatureRangeMin,
      temperatureRangeMax,
      humidityRangeMin,
      humidityRangeMax,
      waterTarget,
      feedingSchedule,
    })

    if (!profile) {
      res.status(404).json({ ok: false, message: 'profile-not-found' })
      return
    }

    res.json({ ok: true, data: profile })
  } catch (error) {
    logger.error('[api] Failed to update pet profile', { error })
    res.status(500).json({ ok: false, message: 'internal-error' })
  }
})

app.delete('/api/pet-profiles/:id', (req, res) => {
  if (!ensureDeveloperOrAdmin(req, res)) {
    return
  }
  try {
    const { id } = req.params

    // Prevent deletion of the default profile
    if (id === 'default') {
      res.status(400).json({ ok: false, message: 'cannot-delete-default-profile' })
      return
    }

    const deleted = deletePetProfile(id)
    if (!deleted) {
      res.status(404).json({ ok: false, message: 'profile-not-found' })
      return
    }

    res.json({ ok: true })
  } catch (error) {
    logger.error('[api] Failed to delete pet profile', { error })
    res.status(500).json({ ok: false, message: 'internal-error' })
  }
})

app.get('/api/diagnostics/report', (_req, res) => {
  const report = buildDiagnosticReport()
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="smart-cat-home-report.txt"')
  res.send(report)
})

app.post('/api/diagnostics/notifications/fix', (req, res) => {
  const { step, success, message } = req.body ?? {}
  if (!isNotificationFixStep(step) || typeof success !== 'boolean') {
    res.status(400).json({ ok: false, message: 'invalid-payload' })
    return
  }
  const normalizedMessage = typeof message === 'string' && message.trim().length > 0 ? message.trim() : undefined
  const log = recordNotificationFix(step, success, normalizedMessage)
  res.json({ ok: true, data: log })
})

app.get('/api/settings', (_req, res) => {
  res.json({ ok: true, data: currentSettings })
})

app.post('/api/settings', async (req, res) => {
  if (!ensureAdminAuthorized(req, res)) {
    return
  }

  const incoming = req.body
  if (!isSmartHomeSettings(incoming)) {
    res.status(400).json({ ok: false, message: 'invalid-settings-payload' })
    return
  }

  const previous = { ...currentSettings }
  await applySettings(incoming)
  recordSettingsMemory(previous, currentSettings, 'api:updateSettings')

  // 🤖 Handle auto mode toggle
  if (typeof incoming.autoMode === 'boolean' && incoming.autoMode !== previous.autoMode) {
    if (incoming.autoMode) {
      // Enable auto mode
      startAutoMode(
        () => latestSnapshot,
        async (toolCall) => {
          const result = await executeToolCall(toolCall, { modelTier: null })
          return result.log
        },
      )
      logger.info('[auto-mode] Enabled by user')
    } else {
      // Disable auto mode
      stopAutoMode()
      logger.info('[auto-mode] Disabled by user')
    }
  }

  res.json({ ok: true, data: currentSettings })
})

app.get('/api/audio/status', (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  const snapshot = latestSnapshot ?? latestSnapshotsByCat.get(activeCatId) ?? null
  const status = snapshot?.reading.audio ?? latestAudioStatus ?? null
  res.json({ ok: true, data: status })
})

app.post('/api/audio/play', (req, res) => {
  if (!ensureAdminAuthorized(req, res)) {
    return
  }
  const rawPattern = typeof req.body?.pattern === 'string' ? req.body.pattern : 'call-cat'
  const pattern = rawPattern.trim().length > 0 ? rawPattern.trim() : 'call-cat'
  const repeatRaw =
    typeof req.body?.repeat === 'number'
      ? req.body.repeat
      : typeof req.body?.repeat === 'string'
        ? Number.parseInt(req.body.repeat, 10)
        : 1
  const repeat = Number.isFinite(repeatRaw) && repeatRaw > 0 ? Math.min(10, Math.max(1, repeatRaw)) : 1
  try {
    triggerAudioPattern(pattern, repeat)
    res.json({ ok: true, data: latestAudioStatus })
  } catch (error) {
    logger.error('[audio] play command failed', error)
    res.status(500).json({ ok: false, message: safeErrorMessage(error) })
  }
})

app.post('/api/audio/stop', (req, res) => {
  if (!ensureAdminAuthorized(req, res)) {
    return
  }
  try {
    stopAudioPlayback()
    res.json({ ok: true, data: latestAudioStatus })
  } catch (error) {
    logger.error('[audio] stop command failed', error)
    res.status(500).json({ ok: false, message: safeErrorMessage(error) })
  }
})

app.post('/api/audio/config', (req, res) => {
  if (!ensureAdminAuthorized(req, res)) {
    return
  }
  const body = req.body ?? {}
  const muted =
    typeof body.muted === 'boolean'
      ? body.muted
      : typeof body.muted === 'string'
        ? body.muted.toLowerCase() === 'true'
        : undefined
  const volumeRaw =
    typeof body.volumePercent === 'number'
      ? body.volumePercent
      : typeof body.volumePercent === 'string'
        ? Number.parseFloat(body.volumePercent)
        : typeof body.volume === 'number'
          ? body.volume
          : typeof body.volume === 'string'
            ? Number.parseFloat(body.volume)
            : undefined
  const pattern = typeof body.pattern === 'string' ? body.pattern : undefined
  const repeat =
    typeof body.repeat === 'number'
      ? body.repeat
      : typeof body.repeat === 'string'
        ? Number.parseInt(body.repeat, 10)
        : undefined

  if (typeof muted === 'undefined' && typeof volumeRaw === 'undefined' && typeof pattern === 'undefined') {
    res.status(400).json({ ok: false, message: 'audio-config-empty' })
    return
  }

  try {
    updateAudioConfiguration({
      muted,
      volumePercent: typeof volumeRaw === 'number' && Number.isFinite(volumeRaw) ? volumeRaw : undefined,
      pattern,
      repeat,
    })
    res.json({ ok: true, data: latestAudioStatus })
  } catch (error) {
    logger.error('[audio] config update failed', error)
    res.status(500).json({ ok: false, message: safeErrorMessage(error) })
  }
})

function parseBooleanInput(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false
    }
  }
  return undefined
}

function parseDurationInput(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return undefined
}

type HardwareResultStatus = 'success' | 'error'

interface HardwareCommandResultPayload {
  id: number
  status: HardwareResultStatus
  message?: string
}

function normalizeHardwareResults(input: unknown): HardwareCommandResultPayload[] {
  if (!Array.isArray(input)) {
    return []
  }

  const normalized: HardwareCommandResultPayload[] = []
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const rawId = (entry as { id?: unknown }).id
    const parsedId =
      typeof rawId === 'number'
        ? rawId
        : typeof rawId === 'string'
          ? Number.parseInt(rawId, 10)
          : Number.NaN
    if (!Number.isFinite(parsedId) || parsedId <= 0) {
      continue
    }
    const rawStatus = typeof (entry as { status?: unknown }).status === 'string'
      ? (entry as { status?: string }).status.trim().toLowerCase()
      : ''
    if (rawStatus !== 'success' && rawStatus !== 'error') {
      continue
    }
    const rawMessage = (entry as { message?: unknown }).message
    const normalizedMessage =
      typeof rawMessage === 'string' && rawMessage.trim().length > 0
        ? rawMessage.trim().slice(0, 200)
        : undefined
    normalized.push({
      id: parsedId,
      status: rawStatus,
      message: normalizedMessage,
    })
  }
  return normalized
}

app.get('/api/uv-fan/status', (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  const snapshot = latestSnapshot ?? latestSnapshotsByCat.get(activeCatId) ?? null
  const status = snapshot?.reading.uvFan ?? latestUvFanStatus ?? null
  res.json({ ok: true, data: status })
})

app.post('/api/uv-fan/state', (req, res) => {
  if (!ensureAdminAuthorized(req, res)) {
    return
  }
  const body = req.body ?? {}
  const uvOn = parseBooleanInput(body.uvOn)
  const fanOn = parseBooleanInput(body.fanOn)
  const autoMode = parseBooleanInput(body.autoMode)
  if (typeof uvOn === 'undefined' && typeof fanOn === 'undefined' && typeof autoMode === 'undefined') {
    res.status(400).json({ ok: false, message: 'uvfan-state-empty' })
    return
  }
  try {
    updateUvFanState({
      uvOn,
      fanOn,
      autoMode,
    })
    res.json({ ok: true, data: latestUvFanStatus })
  } catch (error) {
    logger.error('[uv-fan] Failed to apply state update', error)
    res.status(500).json({ ok: false, message: safeErrorMessage(error) })
  }
})

app.post('/api/uv-fan/cleaning/start', (req, res) => {
  if (!ensureAdminAuthorized(req, res)) {
    return
  }
  const duration =
    parseDurationInput(req.body?.durationMs) ??
    parseDurationInput(req.body?.duration) ??
    undefined
  try {
    startUvCleaning(duration)
    res.json({ ok: true, data: latestUvFanStatus })
  } catch (error) {
    logger.error('[uv-fan] Failed to start cleaning cycle', error)
    res.status(500).json({ ok: false, message: safeErrorMessage(error) })
  }
})

app.post('/api/uv-fan/cleaning/stop', (req, res) => {
  if (!ensureAdminAuthorized(req, res)) {
    return
  }
  try {
    stopUvCleaning()
    res.json({ ok: true, data: latestUvFanStatus })
  } catch (error) {
    logger.error('[uv-fan] Failed to stop cleaning cycle', error)
    res.status(500).json({ ok: false, message: safeErrorMessage(error) })
  }
})

app.get('/api/feeder/status', (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  const snapshot = latestSnapshot ?? latestSnapshotsByCat.get(activeCatId) ?? null
  const status = snapshot?.reading.feeder ?? null
  res.json({ ok: true, data: status })
})

app.post('/api/feeder/feed', (req, res) => {
  // TEMPORARY: Admin check disabled for testing
  // if (!ensureAdminAuthorized(req, res)) {
  //   return
  // }
  const body = req.body ?? {}
  const targetGrams =
    typeof body.targetGrams === 'number' && Number.isFinite(body.targetGrams)
      ? body.targetGrams
      : undefined
  const minGrams =
    typeof body.minGrams === 'number' && Number.isFinite(body.minGrams)
      ? body.minGrams
      : undefined
  try {
    startFeederCycleCommand({ targetGrams, minGrams })
    const snapshot = latestSnapshot ?? latestSnapshotsByCat.get(activeCatId) ?? null
    res.json({ ok: true, data: snapshot?.reading.feeder ?? null })
  } catch (error) {
    logger.error('[feeder] Failed to trigger feeder cycle', error)
    res.status(500).json({ ok: false, message: safeErrorMessage(error) })
  }
})

app.post('/api/feeder/stop', (req, res) => {
  // TEMPORARY: Admin check disabled for testing
  // if (!ensureAdminAuthorized(req, res)) {
  //   return
  // }
  try {
    stopFeederCycleCommand()
    const snapshot = latestSnapshot ?? latestSnapshotsByCat.get(activeCatId) ?? null
    res.json({ ok: true, data: snapshot?.reading.feeder ?? null })
  } catch (error) {
    logger.error('[feeder] Failed to stop feeder cycle', error)
    res.status(500).json({ ok: false, message: safeErrorMessage(error) })
  }
})

app.get('/api/hydration/status', (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  const snapshot = latestSnapshot ?? latestSnapshotsByCat.get(activeCatId) ?? null
  const status = snapshot?.reading.hydration ?? null
  res.json({ ok: true, data: status })
})

app.post('/api/hydration/pump', (req, res) => {
  if (!ensureAdminAuthorized(req, res)) {
    return
  }
  const duration =
    typeof req.body?.durationMs === 'number' && Number.isFinite(req.body.durationMs)
      ? req.body.durationMs
      : undefined
  try {
    triggerHydrationPump(duration)
    const snapshot = latestSnapshot ?? latestSnapshotsByCat.get(activeCatId) ?? null
    res.json({ ok: true, data: snapshot?.reading.hydration ?? null })
  } catch (error) {
    logger.error('[hydration] Failed to trigger pump', error)
    res.status(500).json({ ok: false, message: safeErrorMessage(error) })
  }
})

app.get('/api/camera/status', (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  res.json({ ok: true, data: getCameraRuntime() })
})

app.post('/api/camera/refresh', async (req, res) => {
  if (!ensureAdminAuthorized(req, res)) {
    return
  }
  const status = await pollCameraStatus()
  if (status) {
    patchLatestVisionStatus(status)
    res.json({ ok: true, data: getCameraRuntime() })
    return
  }
  res.status(503).json({ ok: false, message: 'camera-offline', data: getCameraRuntime() })
})

app.get('/api/camera/snapshot', async (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  const snapshot = await fetchCameraSnapshotBuffer()
  if (!snapshot) {
    res.status(503).json({ ok: false, message: 'camera-snapshot-unavailable' })
    return
  }
  patchLatestVisionStatus(getCameraRuntime())
  res.setHeader('Content-Type', snapshot.contentType)
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.send(snapshot.buffer)
})

app.get('/camera-proxy/snapshot.jpg', async (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  const { snapshotUrl, apiKey } = getCameraProxyTargets()
  if (!snapshotUrl) {
    res.status(503).json({ ok: false, message: 'camera-proxy-unconfigured' })
    return
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const headers: Record<string, string> = {}
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }
    const response = await fetch(snapshotUrl, { signal: controller.signal, headers })
    clearTimeout(timeout)
    if (!response.ok) {
      res.status(502).json({ ok: false, message: `camera-proxy-snapshot-${response.status}` })
      return
    }
    const arrayBuffer = await response.arrayBuffer()
    res.setHeader('Content-Type', response.headers.get('content-type') ?? 'image/jpeg')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.send(Buffer.from(arrayBuffer))
  } catch (error) {
    clearTimeout(timeout)
    logger.error('[camera-proxy] Snapshot fetch failed', error)
    if (!res.headersSent) {
      res.status(502).json({ ok: false, message: 'camera-proxy-snapshot-failed' })
    }
  }
})

app.get('/camera-proxy/stream', async (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  const { streamUrl, apiKey } = getCameraProxyTargets()
  if (!streamUrl) {
    res.status(503).json({ ok: false, message: 'camera-proxy-unconfigured' })
    return
  }
  const controller = new AbortController()
  const cleanup = () => controller.abort()
  req.on('close', cleanup)
  try {
    const headers: Record<string, string> = {}
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }
    const upstream = await fetch(streamUrl, { signal: controller.signal, headers })
    if (!upstream.ok || !upstream.body) {
      req.off('close', cleanup)
      res.status(502).json({ ok: false, message: `camera-proxy-stream-${upstream.status}` })
      return
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    const nodeStream = Readable.fromWeb(upstream.body as unknown as ReadableStream)
    nodeStream.on('error', (error) => {
      logger.error('[camera-proxy] Stream pipeline error', error)
      controller.abort()
      if (!res.headersSent) {
        res.status(502).json({ ok: false, message: 'camera-proxy-stream-failed' })
      } else {
        res.end()
      }
    })
    nodeStream.pipe(res)
    nodeStream.on('close', () => {
      req.off('close', cleanup)
    })
  } catch (error) {
    logger.error('[camera-proxy] Stream fetch failed', error)
    req.off('close', cleanup)
    if (!res.headersSent) {
      res.status(502).json({ ok: false, message: 'camera-proxy-stream-failed' })
    }
  }
})

app.post('/api/camera/events', (req, res) => {
  if (!ensureHardwareAuthorized(req, res)) {
    return
  }
  const body = req.body ?? {}
  if (typeof body.catDetected !== 'boolean') {
    res.status(400).json({ ok: false, message: 'catDetected-required' })
    return
  }

  const eventPayload = {
    deviceId: typeof body.deviceId === 'string' ? body.deviceId : undefined,
    catDetected: body.catDetected,
    probability:
      typeof body.probability === 'number'
        ? body.probability
        : typeof body.probability === 'string'
          ? Number.parseFloat(body.probability)
          : undefined,
    mean:
      typeof body.mean === 'number'
        ? body.mean
        : typeof body.mean === 'string'
          ? Number.parseFloat(body.mean)
          : undefined,
    stdDev:
      typeof body.stdDev === 'number'
        ? body.stdDev
        : typeof body.stdDev === 'string'
          ? Number.parseFloat(body.stdDev)
          : undefined,
    edgeDensity:
      typeof body.edgeDensity === 'number'
        ? body.edgeDensity
        : typeof body.edgeDensity === 'string'
          ? Number.parseFloat(body.edgeDensity)
          : undefined,
    timestampMs:
      typeof body.timestampMs === 'number'
        ? body.timestampMs
        : typeof body.timestamp === 'number'
          ? body.timestamp
          : undefined,
    timestampIso:
      typeof body.timestampIso === 'string'
        ? body.timestampIso
        : typeof body.timestamp === 'string'
          ? body.timestamp
          : undefined,
    modelId: typeof body.modelId === 'string' ? body.modelId : undefined,
  }

  const runtime = ingestCameraEvent(eventPayload)
  patchLatestVisionStatus(runtime)
  res.json({ ok: true, data: getCameraRuntime() })
})

app.get('/api/snapshot/latest', (req, res) => {
  const queryCatId = typeof req.query.catId === 'string' && req.query.catId.trim().length > 0 ? req.query.catId.trim() : activeCatId
  const snapshot = latestSnapshotsByCat.get(queryCatId) ?? null
  if (!snapshot) {
    res.status(404).json({ ok: false, message: 'snapshot-not-found' })
    return
  }
  const enriched: SmartHomeSnapshot = {
    ...snapshot,
    reading: {
      ...snapshot.reading,
      ...(snapshot.reading.audio ? {} : latestAudioStatus ? { audio: { ...latestAudioStatus } } : {}),
      ...(snapshot.reading.vision ? {} : latestVisionStatus ? { vision: { ...latestVisionStatus } } : {}),
    },
  }
  res.json({ ok: true, data: enriched })
})

app.post('/api/snapshots', async (req, res) => {
  if (!ensureHardwareAuthorized(req, res)) {
    return
  }

  try {
    const { reading, settings, catId: rawCatId, catProfile } = req.body ?? {}
    const hardwareResults = normalizeHardwareResults(req.body?.hardwareResults)

    if (hardwareResults.length > 0) {
      for (const result of hardwareResults) {
        try {
          const status = result.status === 'success' ? 'completed' : 'failed'
          const updated = completeHardwareCommand(result.id, status, result.message)
          if (!updated) {
            logger.debug('[hardware] Inline hardware result ignored (no pending command)', result.id)
          }
        } catch (error) {
          logger.warn('[hardware] Failed to apply inline hardware result', result.id, error)
        }
      }
    }

    if (!isSmartHomeReading(reading)) {
      res.status(400).json({ ok: false, message: 'invalid-reading' })
      return
    }

    const requestedCatId = typeof rawCatId === 'string' && rawCatId.trim().length > 0 ? rawCatId.trim() : activeCatId
    if (!catRegistry.has(requestedCatId)) {
      const fallbackName =
        (catProfile && typeof catProfile.name === 'string' && catProfile.name.trim().length > 0
          ? catProfile.name.trim()
          : `Cat ${requestedCatId}`)
      const created = upsertCat({
        id: requestedCatId,
        name: fallbackName,
        avatarUrl: typeof catProfile?.avatarUrl === 'string' ? catProfile.avatarUrl : null,
        breed: typeof catProfile?.breed === 'string' ? catProfile.breed : null,
        birthdate: typeof catProfile?.birthdate === 'string' ? catProfile.birthdate : null,
        weightKg: typeof catProfile?.weightKg === 'number' ? catProfile.weightKg : null,
        notes: typeof catProfile?.notes === 'string' ? catProfile.notes : null,
        tags: Array.isArray(catProfile?.tags) ? catProfile.tags : null,
      })
      catRegistry.set(created.id, created)
    }

    if (!catRegistry.has(activeCatId)) {
      activeCatId = requestedCatId
    }

    let activeSettings = currentSettings
    if (settings && isSmartHomeSettings(settings)) {
      activeSettings = settings
      await applySettings(settings)
    }

    const normalizedReading: SmartHomeReading = {
      ...reading,
      timestamp: reading.timestamp,
    }

    const snapshot = await handleIncomingReading(requestedCatId, normalizedReading, activeSettings)
    const inlineCommands = claimHardwareCommandsBatch(3).map(serializeHardwareCommand)
    res.json({
      ok: true,
      data: snapshot,
      commands: inlineCommands.length > 0 ? inlineCommands : undefined,
    })
  } catch (error) {
    logger.error('[snapshots] Failed to process snapshot:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to process snapshot data'
    res.status(500).json({
      ok: false,
      message: errorMessage,
      error: 'SNAPSHOT_PROCESSING_ERROR',
    })
  }
})

app.get('/api/history', (req, res) => {
  const queryCatId = typeof req.query.catId === 'string' && req.query.catId.trim().length > 0 ? req.query.catId.trim() : activeCatId
  const history = loadHistory(HISTORY_LIMIT, queryCatId)
  res.json({ ok: true, data: history })
})

app.get('/api/cats', (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  const cats = listCats()
  cats.forEach((cat) => catRegistry.set(cat.id, cat))
  res.json({ ok: true, data: { cats, activeCatId } })
})

app.post('/api/cats', (req, res) => {
  if (!requireDeveloper(req, res)) {
    return
  }

  const id = typeof req.body?.id === 'string' && req.body.id.trim().length > 0 ? req.body.id.trim() : undefined
  const validation = validateCatPayload(req.body)
  if (!validation.ok) {
    res.status(400).json({ ok: false, message: validation.message })
    return
  }

  const cat = upsertCat({ id, ...validation.value })
  catRegistry.set(cat.id, cat)

  if (req.body?.setActive === true) {
    activeCatId = cat.id
    latestSnapshot = latestSnapshotsByCat.get(cat.id) ?? null
  }

  res.status(201).json({ ok: true, data: cat })
})

app.patch('/api/cats/:id', (req, res) => {
  if (!requireDeveloper(req, res)) {
    return
  }

  const catId = req.params.id.trim()
  const validation = validateCatPayload(req.body)
  if (!validation.ok) {
    res.status(400).json({ ok: false, message: validation.message })
    return
  }

  const existing = getCat(catId)
  if (!existing) {
    res.status(404).json({ ok: false, message: 'cat-not-found' })
    return
  }

  const updated = upsertCat({ id: catId, ...validation.value })
  catRegistry.set(updated.id, updated)
  if (updated.id === activeCatId) {
    latestSnapshot = latestSnapshotsByCat.get(updated.id) ?? latestSnapshot
  }
  res.json({ ok: true, data: updated })
})

app.post('/api/cats/:id/select', (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }

  const requested = req.params.id.trim()
  const cat = catRegistry.get(requested) ?? getCat(requested)
  if (!cat) {
    res.status(404).json({ ok: false, message: 'cat-not-found' })
    return
  }
  catRegistry.set(cat.id, cat)
  activeCatId = cat.id
  const snapshot = latestSnapshotsByCat.get(cat.id) ?? loadLatestSnapshot(cat.id)
  if (snapshot) {
    const normalized = snapshot.catId ? snapshot : { ...snapshot, catId: cat.id }
    latestSnapshotsByCat.set(cat.id, normalized)
    latestSnapshot = normalized
  } else {
    latestSnapshot = null
  }

  try {
    ensureBehaviorProfile(activeCatId)
  } catch (error) {
    logger.warn('[behavior] Failed to ensure profile after cat select', error)
  }

  res.json({ ok: true, data: { activeCatId, snapshot: latestSnapshot } })
})

app.delete('/api/cats/:id', (req, res) => {
  if (!requireDeveloper(req, res)) {
    return
  }

  const catId = req.params.id.trim()
  if (catId === DEFAULT_CAT_ID) {
    res.status(400).json({ ok: false, message: 'cannot-delete-default-cat' })
    return
  }

  const existing = getCat(catId)
  if (!existing) {
    res.status(404).json({ ok: false, message: 'cat-not-found' })
    return
  }

  const removed = removeCat(catId)
  if (!removed) {
    res.status(500).json({ ok: false, message: 'cat-delete-failed' })
    return
  }

  catRegistry.delete(catId)
  latestSnapshotsByCat.delete(catId)
  const pending = pendingBehaviorRefreshTimers.get(catId)
  if (pending) {
    clearTimeout(pending)
    pendingBehaviorRefreshTimers.delete(catId)
  }
  if (activeCatId === catId) {
    activeCatId = catRegistry.has(DEFAULT_CAT_ID)
      ? DEFAULT_CAT_ID
      : catRegistry.values().next()?.value?.id ?? DEFAULT_CAT_ID
    latestSnapshot = latestSnapshotsByCat.get(activeCatId) ?? null
  }

  res.json({ ok: true })
})

app.get('/api/alerts/recent', (_req, res) => {
  res.json({ ok: true, data: recentAlerts })
})

/**
 * GET /api/auto-mode/status
 * Get current auto mode status and recent actions
 */
app.get('/api/auto-mode/status', (_req, res) => {
  try {
    const status = getAutoModeStatus()
    res.json({
      ok: true,
      autoMode: {
        enabled: currentSettings.autoMode,
        ...status,
      },
    })
  } catch (error) {
    logger.error('[auto-mode] Failed to get status:', error)
    res.status(500).json({
      ok: false,
      error: 'Failed to retrieve auto mode status',
    })
  }
})

app.get('/api/calibration', (_req, res) => {
  res.json({ ok: true, data: currentCalibration ?? {} })
})

app.post('/api/calibration', (req, res) => {
  if (!ensureAdminAuthorized(req, res)) {
    return
  }

  const normalized = normalizeCalibrationPayload(req.body)
  if (!normalized) {
    res.status(400).json({ ok: false, message: 'invalid-calibration-payload' })
    return
  }

  const previous = currentCalibration ? { ...currentCalibration } : null
  currentCalibration = normalized.profile
  if (normalized.changed) {
    saveCalibration(normalized.profile)
    recordCalibrationMemory(previous, normalized.profile, 'api:updateCalibration')

    // Generate summary before saving to history
    const summary = summarizeCalibrationAdjustment(getPreferredLanguage(), previous, normalized.profile)

    // Save to calibration history
    try {
      const changedFields = Object.keys(normalized.profile).filter((key) => {
        const prevValue = previous?.[key as keyof CalibrationProfile]
        const newValue = normalized.profile[key as keyof CalibrationProfile]
        return prevValue !== newValue
      })

      saveCalibrationHistory({
        calibration: normalized.profile,
        changeSummary: summary ?? null,
        changedFields: changedFields.length > 0 ? changedFields : null,
        changedBy: 'api',
        previousValues: previous ? (previous as Record<string, unknown>) : null,
        newValues: normalized.profile as Record<string, unknown>,
      })
    } catch (error) {
      logger.error('[calibration] Failed to save calibration history', error)
    }

    res.json({
      ok: true,
      data: {
        profile: currentCalibration,
        summary: summary ?? null,
      },
    })
  } else {
    res.json({
      ok: true,
      data: {
        profile: currentCalibration,
        summary: null,
      },
    })
  }
})

app.get('/api/calibration/history', (_req, res) => {
  try {
    const limit = Number.parseInt(_req.query.limit as string, 10) || 50
    const offset = Number.parseInt(_req.query.offset as string, 10) || 0
    const total = countCalibrationHistory()
    const history = getCalibrationHistory(limit, offset)

    res.json({
      ok: true,
      data: {
        items: history,
        total,
        limit,
        offset,
      },
    })
  } catch (error) {
    logger.error('[calibration] Failed to get calibration history', error)
    res.status(500).json({ ok: false, message: 'failed-to-get-history' })
  }
})

app.post('/api/calibration/rollback/:id', (req, res) => {
  if (!ensureAdminAuthorized(req, res)) {
    return
  }

  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, message: 'invalid-history-id' })
    return
  }

  try {
    const historyRecord = getCalibrationHistoryById(id)
    if (!historyRecord) {
      res.status(404).json({ ok: false, message: 'history-not-found' })
      return
    }

    const calibrationToRestore = JSON.parse(historyRecord.calibrationJson) as CalibrationProfile
    const previous = currentCalibration ? { ...currentCalibration } : null

    currentCalibration = calibrationToRestore
    saveCalibration(calibrationToRestore)
    recordCalibrationMemory(previous, calibrationToRestore, 'api:rollback')

    // Save rollback action to history
    saveCalibrationHistory({
      calibration: calibrationToRestore,
      changeSummary: `Rolled back to version #${id}`,
      changedBy: 'rollback',
      previousValues: previous ? (previous as Record<string, unknown>) : null,
      newValues: calibrationToRestore as Record<string, unknown>,
    })

    const summary = summarizeCalibrationAdjustment(getPreferredLanguage(), previous, calibrationToRestore)
    res.json({
      ok: true,
      data: {
        profile: currentCalibration,
        summary: summary ?? null,
      },
    })
  } catch (error) {
    logger.error('[calibration] Failed to rollback calibration', error)
    res.status(500).json({ ok: false, message: 'rollback-failed' })
  }
})

app.post('/api/hardware/commands', (req, res) => {
  if (!ensureAdminAuthorized(req, res)) {
    return
  }

  const type = typeof req.body?.type === 'string' ? req.body.type.trim() : ''
  if (!type) {
    res.status(400).json({ ok: false, message: 'command-type-required' })
    return
  }

  const allowedTypes = new Set([
    'updateSettings',
    'updateCalibration',
    'playAudioPattern',
    'stopAudio',
    'setAudioState',
    'setUvFanState',
    'startUvCleaning',
    'stopUvCleaning',
  ])
  if (!allowedTypes.has(type)) {
    res.status(400).json({ ok: false, message: 'unsupported-command-type' })
    return
  }

  const payload = req.body?.payload ?? null
  try {
    const command = enqueueHardwareCommand(type, payload)
    res.status(201).json({ ok: true, data: serializeHardwareCommand(command) })
  } catch (error) {
    logger.error('[hardware] Failed to enqueue hardware command', error)
    res.status(500).json({ ok: false, message: 'command-enqueue-failed' })
  }
})

app.get('/api/hardware/commands/pending', (req, res) => {
  if (!ensureHardwareAuthorized(req, res)) {
    return
  }

  const command = claimNextHardwareCommand()
  if (!command) {
    res.status(204).send()
    return
  }

  res.json({ ok: true, data: serializeHardwareCommand(command) })
})

app.post('/api/hardware/commands/:id/ack', (req, res) => {
  if (!ensureHardwareAuthorized(req, res)) {
    return
  }

  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, message: 'invalid-command-id' })
    return
  }

  const command = getHardwareCommandById(id)
  if (!command) {
    res.status(404).json({ ok: false, message: 'command-not-found' })
    return
  }

  const status = req.body?.status === 'success' ? 'completed' : req.body?.status === 'error' ? 'failed' : null
  if (!status) {
    res.status(400).json({ ok: false, message: 'invalid-status' })
    return
  }

  const message = typeof req.body?.message === 'string' ? req.body.message : undefined

  const updated = completeHardwareCommand(id, status, message)
  if (!updated) {
    res.status(409).json({ ok: false, message: 'command-status-conflict' })
    return
  }

  res.json({ ok: true, data: serializeHardwareCommand(updated) })
})

app.post('/api/preferences/language', (req, res) => {
  const language = req.body?.language
  if (language === 'zh' || language === 'en') {
    setPersistedLanguage(language)
    res.json({ ok: true, data: { language } })
    return
  }

  res.status(400).json({ ok: false, message: 'unsupported-language' })
})

app.get('/api/preferences/dashboard', (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  try {
    const layout = loadDashboardLayoutPreference(req.authUser.username)
    res.json({ ok: true, data: layout })
  } catch (error) {
    logger.error('[preferences] Failed to load dashboard layout', error)
    res.status(500).json({ ok: false, message: 'dashboard-preferences-load-failed' })
  }
})

app.post('/api/preferences/dashboard', (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  const hiddenPanels = Array.isArray(req.body?.hiddenPanels) ? req.body.hiddenPanels : undefined
  const panelOrder = Array.isArray(req.body?.panelOrder) ? req.body.panelOrder : undefined
  try {
    const layout = saveDashboardLayoutPreference(req.authUser.username, {
      hiddenPanels,
      panelOrder,
    })
    res.json({ ok: true, data: layout })
  } catch (error) {
    logger.error('[preferences] Failed to save dashboard layout', error)
    res.status(500).json({ ok: false, message: 'dashboard-preferences-save-failed' })
  }
})

app.post('/api/push-subscriptions', (req, res) => {
  const subscription = req.body?.subscription as StoredPushSubscription | undefined
  const nativeDevice = req.body?.nativeDevice as {
    token?: string
    platform?: string
    transport?: NativePushTransport
    metadata?: Record<string, unknown>
  } | undefined
  const language = req.body?.language

  const lang: LanguageCode = language === 'en' ? 'en' : 'zh'

  if (nativeDevice && typeof nativeDevice.token === 'string' && nativeDevice.token.trim().length > 0) {
    const platform = nativeDevice.platform === 'android' ? 'android' : 'ios'
    const preferredTransport = nativeDevice.transport === 'fcm' ? 'fcm' : nativeDevice.transport === 'apns' ? 'apns' : undefined
    const transport: NativePushTransport = preferredTransport ?? (platform === 'android' ? 'fcm' : 'apns')
    try {
      saveNativePushDevice({
        token: nativeDevice.token,
        platform,
        transport,
        language: lang,
        metadata: nativeDevice.metadata && typeof nativeDevice.metadata === 'object' ? nativeDevice.metadata : undefined,
      })
      res.json({ ok: true, mode: 'native' })
      return
    } catch (error) {
      logger.error('[push] Failed to persist native device token', error)
      res.status(500).json({ ok: false, message: 'native-push-registration-failed' })
      return
    }
  }

  if (!subscription || typeof subscription.endpoint !== 'string') {
    res.status(400).json({ ok: false, message: 'invalid-subscription' })
    return
  }

  try {
    savePushSubscription(subscription, lang)
    res.json({ ok: true, mode: 'web' })
  } catch (error) {
    logger.error('[push] Failed to persist subscription', error)
    res.status(500).json({ ok: false, message: 'push-subscription-save-failed' })
  }
})

app.get('/api/push/status', (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  const subscriptions = listPushSubscriptions()
  const nativeDevices = listNativePushDevices()
  const languageCounts = subscriptions.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.language] = (acc[entry.language] ?? 0) + 1
    return acc
  }, {})
  const transportCounts = nativeDevices.reduce<Record<string, number>>((acc, device) => {
    acc[device.transport] = (acc[device.transport] ?? 0) + 1
    return acc
  }, {})
  const lastNativeRegistered =
    nativeDevices.length > 0
      ? nativeDevices.reduce((latest, device) => (device.updatedAt > latest ? device.updatedAt : latest), nativeDevices[0].updatedAt)
      : null

  res.json({
    ok: true,
    data: {
      web: {
        enabled: pushNotificationsEnabled,
        vapidConfigured: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
        subscriptionCount: subscriptions.length,
        languages: languageCounts,
        stats: pushDeliveryMetrics.web,
      },
      native: {
        enabled: Boolean(nativePushService),
        deviceCount: nativeDevices.length,
        transports: transportCounts,
        lastRegisteredAt: lastNativeRegistered,
        stats: pushDeliveryMetrics.native,
      },
    },
  })
})

app.post('/api/push/test', async (req, res) => {
  if (!requireAuthenticated(req, res)) {
    return
  }
  if (!pushNotificationsEnabled && !nativePushService) {
    res.status(503).json({ ok: false, message: 'push-not-configured' })
    return
  }

  const severity: AutomationAlert['severity'] =
    req.body?.severity === 'critical' || req.body?.severity === 'info' ? req.body.severity : 'warning'
  const message =
    typeof req.body?.message === 'string' && req.body.message.trim().length > 0
      ? req.body.message.trim()
      : `Test alert from ${req.authUser?.displayName ?? 'Smart Cat Home'} at ${new Date().toLocaleString()}`
  const alert: AutomationAlert = {
    timestamp: new Date().toISOString(),
    message,
    severity,
  }

  try {
    const summary = await sendAlertNotification(alert, {
      test: true,
      url: typeof req.body?.url === 'string' ? req.body.url : undefined,
      title: typeof req.body?.title === 'string' ? req.body.title : undefined,
      action: typeof req.body?.action === 'string' ? req.body.action : undefined,
    })
    res.json({
      ok: true,
      data: summary,
    })
  } catch (error) {
    logger.error('[push] Test alert failed', error)
    res.status(500).json({ ok: false, message: 'push-test-failed' })
  }
})

app.get('/api/memories', (req, res) => {
  if (!requireDeveloper(req, res)) {
    return
  }
  const typeParam = typeof req.query?.type === 'string' ? req.query.type : undefined
  if (typeParam && !isMemoryType(typeParam)) {
    res.status(400).json({ ok: false, message: 'unsupported-memory-type' })
    return
  }
  const limitParam = Number.parseInt(typeof req.query?.limit === 'string' ? req.query.limit : '', 10)
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(100, limitParam)) : 20
  const memories = listMemories(limit, typeParam)
    .filter((entry) => isMemoryType(entry.type))
    .map((entry) => ({
      id: entry.id,
      type: entry.type as MemoryType,
      content: entry.content,
      source: entry.source,
      createdAt: entry.createdAt,
    }))
  res.json({ ok: true, data: memories })
})

app.post('/api/memories', (req, res) => {
  if (!requireDeveloper(req, res)) {
    return
  }

  const validation = validateMemory(req.body)
  if (!validation.ok) {
    res.status(400).json({ ok: false, message: validation.message })
    return
  }

  const { type, content, source } = validation.value
  const memory = addMemory({
    type,
    content,
    source,
  })
  res.status(201).json({ ok: true, data: memory })
})

app.patch('/api/memories/:id', (req, res) => {
  if (!requireDeveloper(req, res)) {
    return
  }
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, message: 'invalid-memory-id' })
    return
  }

  const content = typeof req.body?.content === 'string' ? sanitizeString(req.body.content) : ''
  if (content.length === 0) {
    res.status(400).json({ ok: false, message: 'invalid-memory-update-empty-content' })
    return
  }

  if (content.length > VALIDATION_LIMITS.MAX_CONTENT_LENGTH) {
    res.status(400).json({ ok: false, message: 'invalid-memory-update-content-too-long' })
    return
  }

  updateMemory(id, content)
  res.json({ ok: true })
})

app.delete('/api/memories/:id', (req, res) => {
  if (!requireDeveloper(req, res)) {
    return
  }
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, message: 'invalid-memory-id' })
    return
  }
  removeMemory(id)
  res.json({ ok: true })
})

// ==================== 知識提取 API ====================

app.post('/api/knowledge/extract', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const { messages, catId } = req.body

    if (!Array.isArray(messages)) {
      return res.status(400).json({ success: false, error: 'Messages must be an array' })
    }

    const resolvedCatId = typeof catId === 'string' ? catId : 'default'

    // 使用 AI 提取知識
    const result = await knowledgeExtractor.extractKnowledgeWithAI(
      messages,
      resolvedCatId,
      async (prompt) => {
        const chatResult = await generateChatContent({
          question: prompt,
          historyMessages: [],
          knowledgePrompt: '',
          personality: 'PhiLia093',
          modelConfig: { ...aiConfig.standard },
          provider: 'local',
          isDeveloper: false,
          enableSearch: false,
          language: 'zh'
        })
        return chatResult.text
      }
    )

    // 儲存知識
    for (const knowledge of result.knowledge) {
      knowledgeExtractor.saveKnowledge(knowledge)
    }

    res.json({
      success: true,
      result
    })
  } catch (error) {
    logger.error('[knowledge] Extract error:', error)
    res.status(500).json({ success: false, error: 'Failed to extract knowledge' })
  }
})

app.get('/api/knowledge', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const catId = typeof req.query.catId === 'string' ? req.query.catId : 'default'
    const limitParam = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(200, limitParam)) : 50

    const knowledge = knowledgeExtractor.getCatKnowledge(catId, limit)

    res.json({
      success: true,
      knowledge
    })
  } catch (error) {
    logger.error('[knowledge] List error:', error)
    res.status(500).json({ success: false, error: 'Failed to list knowledge' })
  }
})

app.patch('/api/knowledge/:id', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const { id } = req.params
    const updates = req.body

    knowledgeExtractor.updateKnowledge(id, updates)

    res.json({ success: true })
  } catch (error) {
    logger.error('[knowledge] Update error:', error)
    res.status(500).json({ success: false, error: 'Failed to update knowledge' })
  }
})

app.delete('/api/knowledge/:id', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const { id } = req.params
    knowledgeExtractor.deleteKnowledge(id)

    res.json({ success: true })
  } catch (error) {
    logger.error('[knowledge] Delete error:', error)
    res.status(500).json({ success: false, error: 'Failed to delete knowledge' })
  }
})

app.get('/api/knowledge/stats', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const catId = typeof req.query.catId === 'string' ? req.query.catId : undefined
    const stats = knowledgeExtractor.getKnowledgeStats(catId)

    res.json({
      success: true,
      stats
    })
  } catch (error) {
    logger.error('[knowledge] Stats error:', error)
    res.status(500).json({ success: false, error: 'Failed to get stats' })
  }
})

// ==================== 主動洞察 API ====================

app.get('/api/insights', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const catId = typeof req.query.catId === 'string' ? req.query.catId : undefined
    const insights = proactiveAssistant.getActiveInsights(catId)

    res.json({
      success: true,
      insights
    })
  } catch (error) {
    logger.error('[insights] List error:', error)
    res.status(500).json({ success: false, error: 'Failed to list insights' })
  }
})

app.post('/api/insights/check', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const catId = typeof req.body.catId === 'string' ? req.body.catId : undefined
    const result = await proactiveAssistant.checkProactiveInsights(catId)

    // 儲存新洞察
    for (const insight of result.insights) {
      proactiveAssistant.saveInsight(insight)
    }

    res.json({
      success: true,
      result
    })
  } catch (error) {
    logger.error('[insights] Check error:', error)
    res.status(500).json({ success: false, error: 'Failed to check insights' })
  }
})

app.post('/api/insights/:id/dismiss', async (req, res) => {
  if (!requireAuthenticated(req, res)) return

  try {
    const { id } = req.params
    proactiveAssistant.dismissInsight(id)

    res.json({ success: true })
  } catch (error) {
    logger.error('[insights] Dismiss error:', error)
    res.status(500).json({ success: false, error: 'Failed to dismiss insight' })
  }
})

app.post('/api/equipment/test', (req, res) => {
  const equipmentId = (req.body?.id as string | undefined) ?? 'unknown'
  const defaultResponse: EquipmentTestResponse = {
    id: equipmentId,
    success: false,
    latencyMs: 0,
    messageKey: 'equipment.status.backendMissing',
  }

  if (equipmentId === 'arduino') {
    if (latestSnapshot) {
      const lastTimestamp = new Date(latestSnapshot.reading.timestamp).getTime()
      const delta = Date.now() - lastTimestamp
      const online = Number.isFinite(delta) && delta < 5 * 60 * 1000
      res.json({
        ok: true,
        data: {
          id: equipmentId,
          success: online,
          latencyMs: online ? delta : 0,
          messageKey: online ? 'equipment.status.ok' : 'equipment.status.fail',
        },
      })
      return
    }

    res.json({ ok: true, data: { ...defaultResponse, messageKey: 'equipment.status.fail' } })
    return
  }

  res.json({ ok: true, data: defaultResponse })
})

// 🔒 對 AI 聊天端點套用特殊速率限制 (Apply special rate limit to AI chat)
app.post('/api/chat/suggestions', chatLimiter, async (req, res) => {
  const requestId = Math.random().toString(36).slice(2)
  logger.info(`[chat] ${requestId} start`)
  if (!requireAuthenticated(req, res)) {
    return
  }
  const isDeveloper = req.authUser.role === 'developer'

  // 檢測是否為 SSE 請求（可選）
  const acceptHeader = typeof req.headers.accept === 'string' ? req.headers.accept : ''
  const enableSse = acceptHeader.includes('text/event-stream')

  // 創建 SSE 連接（如果請求）
  const connectionId = enableSse && typeof req.body?.connectionId === 'string' && req.body.connectionId.trim().length > 0
    ? req.body.connectionId.trim()
    : requestId
  const connection = enableSse ? globalSSEPool.createConnection(res, connectionId) : null

  if (enableSse && !connection) {
    res.status(503).json({ ok: false, message: 'sse-connection-limit' })
    return
  }

  try {
    const requestedLanguage = typeof req.body?.language === 'string' ? req.body.language : undefined
    const rememberLanguage = req.body?.rememberLanguage === true
    const resolvedLanguage = resolveRequestLanguage(requestedLanguage)
    if (rememberLanguage && (requestedLanguage === 'zh' || requestedLanguage === 'en')) {
      setPersistedLanguage(requestedLanguage)
    }

    await runWithLanguageContext(resolvedLanguage, async () => {
      let modelPreference = (() => {
        if (typeof req.body?.modelPreference !== 'string') return undefined
        const raw = req.body.modelPreference.trim().toLowerCase()
        if (['pro', 'expert', 'advanced', 'better', 'smarter', 'bigger'].includes(raw)) return 'pro' as const
        if (['standard', 'balanced', 'default', 'regular'].includes(raw)) return 'standard' as const
        if (['auto', 'smart', 'adaptive'].includes(raw)) return 'auto' as const
        return undefined
      })()

      const reasoningEffort = (() => {
        if (typeof req.body?.reasoningEffort !== 'string') return undefined
        const raw = req.body.reasoningEffort.trim().toLowerCase()
        if (raw === 'low' || raw === 'medium' || raw === 'high') return raw as ReasoningEffort
        return undefined
      })()

      let enableSearch = (() => {
        const raw = req.body?.enableSearch
        if (typeof raw === 'boolean') return raw
        if (typeof raw === 'string') {
          const normalized = raw.trim().toLowerCase()
          if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
          if (['0', 'false', 'no', 'off'].includes(normalized)) return false
        }
        return false
      })()

      const requestIntentRaw =
        typeof req.body?.intent === 'string' ? req.body.intent.trim().toLowerCase() : ''
      const isMcpIntent = requestIntentRaw === 'mcp'

    const requestedCatId = typeof req.body?.catId === 'string' && req.body.catId.trim().length > 0 ? req.body.catId.trim() : activeCatId
    const initialSnapshotRaw = latestSnapshotsByCat.get(requestedCatId) ?? loadLatestSnapshot(requestedCatId)
    const initialSnapshot = initialSnapshotRaw
      ? initialSnapshotRaw.catId
        ? initialSnapshotRaw
        : { ...initialSnapshotRaw, catId: requestedCatId }
      : null
    if (initialSnapshot) {
      latestSnapshotsByCat.set(requestedCatId, initialSnapshot)
    }

    // 🐾 Fetch pet profile if provided
    const petProfileId = typeof req.body?.petProfileId === 'string' && req.body.petProfileId.trim().length > 0
      ? req.body.petProfileId.trim()
      : null
    const petProfile = petProfileId ? getPetProfile(petProfileId) : null
    if (petProfileId && !petProfile) {
      logger.warn(`[chat] Pet profile not found: ${petProfileId}, continuing without pet profile`)
    }

    const rawMessages: unknown[] = Array.isArray(req.body?.messages) ? req.body.messages : []
    const fileAttachmentIds = extractFileAttachmentIds(rawMessages)
    const {
      conversationMessages,
      imageAttachments: parsedImageAttachments,
      documentAttachments,
    } = parseConversationAttachments(rawMessages)
    const inlineImageAttachments = parsedImageAttachments.map(({ messageIndex: _index, ...rest }) => rest)
    const latestAttachment =
      inlineImageAttachments.length > 0 ? inlineImageAttachments[inlineImageAttachments.length - 1] : null
    const lastMessage = findLastMessageByRole(conversationMessages, 'user')
    let question = typeof lastMessage?.content === 'string' ? lastMessage.content : ''
    const trimmedQuestion = question.trim().toLowerCase()
    const needsDefaultPrompt =
      trimmedQuestion.length === 0 ||
      trimmedQuestion === '[image]' ||
      trimmedQuestion === '(image)' ||
      trimmedQuestion === 'image'

    if (needsDefaultPrompt) {
      question = getPreferredLanguage() === 'en'
        ? 'Please review the latest photo and share actionable, friendly cat-care guidance.'
        : '請針對剛才上傳的照片，說明你觀察到的重點，並提供實用、溫暖的照護建議。'
      if (lastMessage) {
        lastMessage.content = question
      } else {
        conversationMessages.push({ role: 'user', content: question })
      }
    }

    const userRequestedSearch = !isMcpIntent && indicatesWebSearch(question)
    if (userRequestedSearch && !enableSearch) {
      enableSearch = true
      if (!modelPreference || modelPreference === 'auto') {
        modelPreference = 'pro'
      }
      logger.info(`[chat] ${requestId} auto-enabled simple search based on user intent.`)
    }

    if (enableSearch && (!modelPreference || modelPreference === 'auto')) {
      modelPreference = 'pro'
    }

    const streamingUserRequestedSearchHint = !isMcpIntent && indicatesWebSearch(question)
    if (streamingUserRequestedSearchHint && !enableSearch) {
      enableSearch = true
      if (!modelPreference || modelPreference === 'auto') {
        modelPreference = 'pro'
      }
      logger.info(`[chat-stream] ${requestId} auto-enabled simple search based on user intent.`)
    }

    // 🔹 第2階段：調用記憶和歷史
    connection?.sendPhase('retrieving_memory', 'Loading memories and history...')

    let snapshotForChat = initialSnapshot
    let history = loadHistory(HISTORY_LIMIT, requestedCatId)
    const relevantMemories = loadRelevantMemories(question, 5)
    const toolEvents: ToolExecutionLog[] = []
    let documentSummary: string | null = null
    if (documentAttachments.length > 0) {
      for (const docAttachment of documentAttachments) {
        const validation = validateDocumentUpload({
          dataUrl: docAttachment.dataUrl,
          mimeType: docAttachment.mimeType,
          filename: docAttachment.filename,
        })
        if (!validation.ok) {
          logger.warn(`[chat-stream] Document validation failed: ${validation.message}`)
          connection?.sendError(validation.message, validation.error ?? 'invalid-document')
          connection?.close()
          globalSSEPool.closeConnection(connectionId)
          return
        }
        try {
          const summary = await summarizeDocumentAttachmentBeforeChat({
            attachment: {
              dataUrl: validation.value.dataUrl,
              mimeType: validation.value.mimeType,
              filename: validation.value.filename ?? docAttachment.filename,
              type: docAttachment.type,
            },
            requestedCatId,
            userId: req.authUser.username,
            toolEvents,
            connection,
          })
          documentSummary = documentSummary ? `${documentSummary}\n\n${summary}` : summary
        } catch (error) {
          logger.error('[document] Attachment processing failed', error)
          connection?.sendError(
            error instanceof Error ? error.message : 'document-processing-failed',
            'document-error',
          )
          connection?.close()
          globalSSEPool.closeConnection(connectionId)
          return
        }
      }
    }
    if (documentSummary) {
      conversationMessages.push({ role: 'system', content: documentSummary })
    }

    const fileAttachmentSummary = buildFileAttachmentSummary(fileAttachmentIds)
    const fileVisionContext = buildFileAttachmentVisionContext(fileAttachmentIds, getPreferredLanguage())

    // 🆕 FIX: 將文件上傳摘要注入到對話上下文中,讓 AI 能夠引用這些文件的分析結果
    if (fileAttachmentSummary) {
      conversationMessages.push({ role: 'system', content: fileAttachmentSummary })
      logger.info(`[fileAttachment] Injected file summary for ${fileAttachmentIds.length} files into conversation`)
    }

    let hasImageAttachment = inlineImageAttachments.length > 0 || fileVisionContext.hasImageAttachment
    let visionSummary: string | null = fileVisionContext.visionSummary
    let visionNotice: string | null = null

    if (inlineImageAttachments.length > 0) {
      connection?.sendPhase(
        'executing_tool',
        getPreferredLanguage() === 'en' ? 'Analyzing photo...' : '正在解析照片...',
      )
      const visionPrefetch = await analyzeImageAttachmentsBeforeChat({
        attachments: inlineImageAttachments,
        question,
        language: getPreferredLanguage(),
        toolEvents,
        connection,
      })
      if (visionPrefetch.directResponse) {
        const trimmedNotice = visionPrefetch.directResponse.trim()
        if (trimmedNotice.length > 0) {
          const processed = limitResponseLength(
            ensureFriendlyClosing(trimmedNotice, getPreferredLanguage()),
            getPreferredLanguage(),
          )
          visionNotice = processed
          logger.info('[VISION DEBUG] Vision prefetch generated notice instead of summary:', {
            responseLength: processed.length,
            responsePreview: processed.substring(0, 100) + '...',
          })
        }
      }
      if (visionPrefetch.summary) {
        visionSummary = visionSummary
          ? `${visionSummary}\n\n---\n\n${visionPrefetch.summary}`
          : visionPrefetch.summary
      }
      if (visionNotice) {
        const combined = [visionSummary, visionNotice].filter((chunk) => chunk && chunk.trim().length > 0).join('\n\n---\n\n')
        visionSummary = combined || visionSummary
      }
    }

    // 🔴 CRITICAL: Embed vision summary directly into user question
    // 🔧 FIX: Always embed vision results when available, regardless of user's message content
    if (visionSummary) {
      const originalQuestion = question.trim() || (getPreferredLanguage() === 'en'
        ? 'Please analyze this image and provide care recommendations.'
        : '請分析這張圖片並提供照護建議。')

      const rewritten = getPreferredLanguage() === 'en'
        ? `Here is what I see in the photo:

${visionSummary}

User's question: ${originalQuestion}

Please:
1. First, briefly describe what you see in 1-2 sentences
2. Then answer the user's question with 3-4 practical care tips (keep it concise and friendly)`
        : `這是我在照片中看到的：

${visionSummary}

用戶問題：${originalQuestion}

請：
1. 首先，用1-2句話簡短描述你看到的畫面
2. 然後回答用戶的問題並給出3-4個實用的照護建議（保持簡潔溫暖）`

      logger.info('[VISION DEBUG] (streaming) Embedding vision into user question:', {
        original: question.substring(0, 100),
        hadOriginalQuestion: question.trim().length > 0,
        visionSummaryLength: visionSummary.length,
        newQuestionLength: rewritten.length,
        reason: 'Image attachment detected - always embed vision analysis'
      })

      question = rewritten
      if (lastMessage) lastMessage.content = question
    }

    if (visionNotice) {
      const noticeInstruction =
        getPreferredLanguage() === 'en'
          ? `Vision assistant note (explain this to the user before other guidance):\n${visionNotice}`
          : `視覺助理備註（請先向使用者說明再提供其它建議）：\n${visionNotice}`
      conversationMessages.push({ role: 'system', content: noticeInstruction })
    }

    if (hasImageAttachment && visionSummary) {
      connection?.sendPhase(
        'generating_response',
        getPreferredLanguage() === 'en' ? 'Merging vision context...' : '整合視覺結果...',
      )
    }

    // 🔹 第3階段：生成回應
    connection?.sendPhase('generating_response', 'Generating AI response...')

    let pendingSearchHint = streamingUserRequestedSearchHint
    let remainingSearchCalls = MAX_SEARCH_CALLS_PER_REQUEST
    let lastSearchOutput: string | null = null

    let chatResult = await generateChatContent({
      question,
      language: getPreferredLanguage(),
      snapshot: snapshotForChat,
      history,
      catId: requestedCatId,
      originalMessages: conversationMessages,
      hasImageAttachment,
      hasDocumentAttachment: Boolean(documentSummary),
      documentSummary,
      hasFileAttachment: Boolean(fileAttachmentSummary),
      fileAttachmentSummary,
      visionSummary,
      memories: relevantMemories,
      ...(modelPreference ? { modelPreference } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      enableSearch,
      isDeveloperMode: isDeveloper,
      userRequestedSearch: pendingSearchHint,
      petProfile,
    })

    // 工具調用迭代循環
    let iterations = 0
    let historyNeedsRefresh = false
    let overrideResponse: { text: string; skipClosing?: boolean } | null = null

    // 🔧 FIX: Track tool calls to detect duplicates and prevent infinite loops
    const executedToolCalls = new Set<string>()
    let consecutiveFailures = 0
    const MAX_CONSECUTIVE_FAILURES = 2
    let forceTextResponseOnNextIteration = false  // 🆕 Flag to force text-only response after successful tool

    while (chatResult.toolCall && iterations < MAX_TOOL_CALL_ITERATIONS) {
      const toolCall = chatResult.toolCall
      const isSearchTool = SEARCH_TOOL_NAMES.has(toolCall.tool)
      connection?.sendPhase('executing_tool', `Executing tool: ${toolCall.tool}...`)

      const toolArgsForHistory = toolCall.args ?? {}

      // 🔧 FIX: Generate unique key for this tool call (tool name + normalized args)
      const toolCallKey = `${toolCall.tool}:${JSON.stringify(toolCall.args || {})}`

      // 🔧 FIX: Check for duplicate tool calls
      if (executedToolCalls.has(toolCallKey)) {
        const language = getPreferredLanguage()
        const duplicateMessage =
          language === 'en'
            ? `I've already tried searching for that information, but couldn't find specific results. Let me provide general guidance based on standard cat care principles instead.`
            : `我已經嘗試搜尋過相關資訊但未能找到具體結果，讓我根據標準貓咪照護原則為您提供通用建議。`
        logger.info(`[ai] Detected duplicate tool call: ${toolCall.tool}, stopping iteration (iteration ${iterations})`)
        connection?.sendTool(toolCall.tool, toolCall.args, { error: duplicateMessage })
        overrideResponse = { text: duplicateMessage, skipClosing: false }
        break
      }
      executedToolCalls.add(toolCallKey)

      if (isSearchTool && remainingSearchCalls <= 0) {
        const language = getPreferredLanguage()
        const limitInstruction =
          language === 'en'
            ? 'You have reached the per-request search quota. Begin your reply by noting you will use the findings already gathered, then convert the summary below into 3-4 actionable tips that answer the question. Reference notable sources inline (e.g., (ASPCA)) and do not ask for additional searches.'
            : '本輪搜尋額度已用罄。請先說明會改用現有搜尋結果，再根據下方摘要整理 3-4 個可執行建議以回答問題，必要時以括號標註資料來源（如：(ASPCA)），且不要再要求搜尋。'
        if (lastSearchOutput && lastSearchOutput.trim()) {
          connection?.sendTool(toolCall.tool, toolCall.args, {
            error:
              language === 'en'
                ? 'Search quota reached; reusing collected findings.'
                : '搜尋額度已達上限，改用既有結果。',
          })
          conversationMessages.push({ role: 'system', content: limitInstruction })
          conversationMessages.push({
            role: 'assistant',
            content:
              language === 'en'
                ? `🔎 Search summary:\n${lastSearchOutput}`
                : `🔎 搜尋摘要：\n${lastSearchOutput}`,
          })
          pendingSearchHint = false
          enableSearch = false
          chatResult = await generateChatContent({
            question,
            language,
            snapshot: snapshotForChat,
            history,
            catId: requestedCatId,
            originalMessages: conversationMessages,
            hasImageAttachment,
            hasDocumentAttachment: Boolean(documentSummary),
            documentSummary,
            hasFileAttachment: Boolean(fileAttachmentSummary),
            fileAttachmentSummary,
            visionSummary,
            memories: relevantMemories,
            ...(modelPreference ? { modelPreference } : {}),
            ...(reasoningEffort ? { reasoningEffort } : {}),
            enableSearch,
            isDeveloperMode: isDeveloper,
            userRequestedSearch: false,
          })
          iterations += 1
          continue
        }
        const limitMessage =
          language === 'en'
            ? 'I already gathered online sources for this request, so I will finish the answer with those findings.'
            : '本輪允許的搜尋次數已達上限，我會改用既有的資料整理回覆，不再重新搜尋。'
        connection?.sendTool(toolCall.tool, toolCall.args, { error: limitMessage })
        overrideResponse = { text: limitMessage, skipClosing: false }
        pendingSearchHint = false
        break
      }

      if (isSearchTool && !enableSearch) {
        const startedAt = Date.now()
        const logMessage =
          getPreferredLanguage() === 'en'
            ? 'Web search disabled for this request. Please enable the search toggle and switch to the pro model before trying again.'
            : '本次對話的網頁搜尋已關閉，請開啟搜尋模式並切換至 Pro 模型後再試。'
        const log: ToolExecutionLog = {
          tool: 'searchWeb',
          success: false,
          message: logMessage,
          args: toolArgsForHistory,
          durationMs: Date.now() - startedAt,
        }
        toolEvents.push(log)
        recordToolEvent(log)
        connection?.sendTool(toolCall.tool, toolCall.args, { error: logMessage })
        overrideResponse = { text: logMessage, skipClosing: false }
        break
      }

      const execution = await executeToolCall(toolCall, {
        modelTier: chatResult.modelTier ?? null,
        userQuestion: question,
        imageAttachment: latestAttachment,
        enableSearch,
        language: getPreferredLanguage(),
      })
      logger.info(
        `[chat-stream] ${requestId} tool ${toolCall.tool} -> ${execution.log.success ? 'success' : 'fail'} (${execution.log.durationMs ?? 0}ms)`,
      )
      toolEvents.push(execution.log)
      recordToolEvent(execution.log)
      connection?.sendTool(toolCall.tool, toolCall.args, execution.log)

      if (toolCall.tool === 'switchToProModel' && execution.log.success) {
        modelPreference = 'pro'
      }

      // 🔧 FIX: Detect empty or failed results BEFORE processing search tool output
      // This prevents setting lastSearchOutput with empty results
      // Check if search tool returned no useful results (handles both plain text and JSON responses)

      // 🔍 DEBUG: Log detection attempt
      if (isSearchTool && execution.log.success) {
        logger.info(`[ai] DEBUG: Checking if tool ${toolCall.tool} returned empty result`)
        logger.info(`[ai] DEBUG: Output preview: ${(execution.log.output || '').substring(0, 200)}...`)
        logger.info(`[ai] DEBUG: Output length: ${(execution.log.output || '').length}`)
      }

      const hasEmptyOrUselessResult =
        execution.log.success &&
        isSearchTool &&
        (() => {
          const output = execution.log.output
          if (!output || output.trim().length < 10) {
            logger.info(`[ai] Tool ${toolCall.tool} returned null or very short output`)
            return true
          }

          // 🔧 FIX: Check for common "no results" patterns in plain text
          const lowerOutput = output.toLowerCase()
          const noResultPatterns = [
            /no\s+(relevant\s+)?(results?|matches?|information|resources?|data)\s+(found|available|came up)/i,
            /couldn['']t\s+find\s+(any|specific|relevant)/i,
            /unable\s+to\s+(find|locate|retrieve)/i,
            /search\s+returned\s+(no|empty)/i,
            /沒有.*?(結果|資訊|資料)/,
            /找不到.*?(相關|具體)/,
            /搜尋.*?(為空|失敗|無結果)/,
          ]

          for (const pattern of noResultPatterns) {
            if (pattern.test(lowerOutput)) {
              logger.info(`[ai] Tool ${toolCall.tool} output contains "no results" pattern: ${pattern}`)
              return true
            }
          }

          // 🔧 FIX: Check if MCP response is a JSON with empty results
          try {
            const parsed = JSON.parse(output.trim())
            logger.info(`[ai] DEBUG: Successfully parsed JSON, checking for empty arrays`)
            // Check for common empty result patterns in MCP responses
            if (parsed.results && Array.isArray(parsed.results) && parsed.results.length === 0) {
              logger.info(`[ai] Tool ${toolCall.tool} returned JSON with empty results array`)
              return true
            }
            if (parsed.items && Array.isArray(parsed.items) && parsed.items.length === 0) {
              logger.info(`[ai] Tool ${toolCall.tool} returned JSON with empty items array`)
              return true
            }
            // Check for explicit "no results" messages in JSON
            if (parsed.message && /no.*(result|match|found)/i.test(parsed.message)) {
              logger.info(`[ai] Tool ${toolCall.tool} returned "no results" message in JSON`)
              return true
            }
            logger.info(`[ai] DEBUG: JSON has content, not empty`)
          } catch (e) {
            logger.info(`[ai] DEBUG: JSON parse failed, checking for truncated JSON`)
            // Not valid JSON - check if it looks like truncated JSON with empty results
            if (output.includes('"results": []') || output.includes('"items": []')) {
              logger.info(`[ai] Tool ${toolCall.tool} returned truncated JSON with empty array`)
              return true
            }

            // Not JSON, check plain text length as last resort
            if (output.trim().length < 50) {
              logger.info(`[ai] Tool ${toolCall.tool} returned very short plain text (${output.trim().length} chars)`)
              return true
            }
            logger.info(`[ai] DEBUG: Output is not JSON and not empty (length: ${output.trim().length})`)
          }

          // 🔧 NEW FIX: Check for IRRELEVANT results (not just empty results)
          // If the search returned content but it's about a completely different topic,
          // treat it as useless. This catches cases like searching "suzumi cat" but
          // getting results about "Nick Suzuki" (hockey player) or "Arctic Cat" (snowmobiles).
          const queryText = (toolCall.args?.query || toolCall.args?.q || '').toString().toLowerCase()
          if (queryText && output.length > 100) {
            logger.info(`[ai] DEBUG: Checking relevance for query: "${queryText}"`)

            // Extract meaningful keywords (ignore common words, length > 2)
            const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'be', 'how', 'what', 'when', 'where', 'why', 'who', 'can', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'over'])
            const queryKeywords = queryText
              .split(/[\s\-_,\.]+/)
              .filter(word => word.length > 2 && !stopWords.has(word))

            logger.info(`[ai] DEBUG: Query keywords to check: ${JSON.stringify(queryKeywords)}`)

            if (queryKeywords.length > 0) {
              // Check how many query keywords appear in the output
              const matchedKeywords = queryKeywords.filter(keyword => {
                const found = lowerOutput.includes(keyword)
                logger.info(`[ai] DEBUG: Checking keyword "${keyword}" in output: ${found}`)
                return found
              })

              const matchRatio = matchedKeywords.length / queryKeywords.length
              logger.info(`[ai] DEBUG: Keyword match ratio: ${matchedKeywords.length}/${queryKeywords.length} (${(matchRatio * 100).toFixed(1)}%)`)

              // 🔧 CRITICAL FIX: Multi-layer relevance checking
              // 1. First check: If less than 70% of keywords match, likely irrelevant
              //    (Raised from 50% because common words like "cat", "take", "care" can appear in unrelated content)
              if (matchRatio < 0.7) {
                logger.info(`[ai] Tool ${toolCall.tool} returned IRRELEVANT results (only ${(matchRatio * 100).toFixed(1)}% of query keywords found, threshold is 70%)`)
                logger.info(`[ai] DEBUG: Matched keywords: ${JSON.stringify(matchedKeywords)}`)
                logger.info(`[ai] DEBUG: This likely means search proxy returned wrong results`)
                return true
              }

              // 2. Second check: If query has specialized terms (length > 5 or capitalized),
              //    at least ONE specialized term must match
              const originalQuery = (toolCall.args?.query || toolCall.args?.q || '').toString()
              const queryWords = originalQuery.split(/[\s\-_,\.]+/)
              const specializedTerms = queryKeywords.filter((word, idx) => {
                const originalWord = queryWords[idx] || ''
                // A term is "specialized" if: length > 5, OR starts with capital letter
                return word.length > 5 || /^[A-Z]/.test(originalWord)
              })

              if (specializedTerms.length > 0) {
                const hasSpecializedMatch = specializedTerms.some(term => lowerOutput.includes(term))
                logger.info(`[ai] DEBUG: Specialized terms in query: ${JSON.stringify(specializedTerms)}`)
                logger.info(`[ai] DEBUG: At least one specialized term matched: ${hasSpecializedMatch}`)

                if (!hasSpecializedMatch) {
                  logger.info(`[ai] Tool ${toolCall.tool} returned IRRELEVANT results (no specialized terms matched)`)
                  logger.info(`[ai] DEBUG: Example: searching "suzumi cat" but got "Arctic Cat" snowmobile or "Nick Suzuki" hockey player`)
                  return true
                }
              }

              logger.info(`[ai] DEBUG: ${(matchRatio * 100).toFixed(1)}% of keywords found, results appear relevant`)
            }
          }

          logger.info(`[ai] DEBUG: No empty result patterns matched`)
          return false
        })()

      logger.info(`[ai] DEBUG: hasEmptyOrUselessResult = ${hasEmptyOrUselessResult}`)

      if (hasEmptyOrUselessResult) {
        consecutiveFailures += 1
        logger.info(`[ai] Tool ${toolCall.tool} returned empty/useless result (iteration ${iterations}), consecutive failures: ${consecutiveFailures}`)
      } else if (execution.log.success) {
        consecutiveFailures = 0  // Reset on successful result with useful output
      }

      // 🔧 FIX: Process search tool output ONLY if result is not empty
      // This ensures we only save useful search results
      if (isSearchTool && execution.log.success && !hasEmptyOrUselessResult) {
        remainingSearchCalls = Math.max(0, remainingSearchCalls - 1)
        pendingSearchHint = false

        // Save the search output and add system message
        if (execution.log.output && execution.log.output.trim()) {
          lastSearchOutput = execution.log.output
          const language = getPreferredLanguage()

          // 🔧 IMPROVED: Format search results in a more prominent way
          // Use numbered list, clear boundaries, and explicit instructions
          const formattedResults = execution.log.output
            .split('\n')
            .filter(line => line.trim())
            .map((line, idx) => {
              // If line already starts with number, keep it
              if (/^\d+\./.test(line.trim())) return line
              // Otherwise add numbering
              return `${idx + 1}. ${line}`
            })
            .join('\n')

          const summary =
            language === 'en'
              ? `╔═══════════════════════════════════════════════════════════╗
║              SEARCH RESULTS RECEIVED                      ║
╚═══════════════════════════════════════════════════════════╝

📋 The searchWeb tool has returned the following information:

${formattedResults}

╔═══════════════════════════════════════════════════════════╗
║          ✅ MANDATORY INSTRUCTIONS ✅                      ║
╚═══════════════════════════════════════════════════════════╝

You MUST follow these rules:
1. READ the search results above carefully
2. CITE specific information from the results in your response
3. If results seem unrelated, EXPLAIN why they might be relevant or ask clarifying questions
4. NEVER say "I couldn't find information" when results are provided above
5. Respond in PLAIN TEXT - no JSON, no tool calls
6. Start your response with "Based on the search results..." or similar phrase

Example: "Based on the search results, I found that 'Suzumi' appears in 'Neko no Suzumi', which is..."`
              : `╔═══════════════════════════════════════════════════════════╗
║              收到搜尋結果                                  ║
╚═══════════════════════════════════════════════════════════╝

📋 searchWeb 工具已回傳以下資訊：

${formattedResults}

╔═══════════════════════════════════════════════════════════╗
║          ✅ 強制執行指令 ✅                                ║
╚═══════════════════════════════════════════════════════════╝

你必須遵守以下規則：
1. 仔細閱讀上方的搜尋結果
2. 在回覆中引用結果的具體資訊
3. 若結果看似無關，說明為何可能相關或提出釐清問題
4. 絕不在上方有提供結果時說「我查不到資訊」
5. 使用純文字回應 - 不要 JSON、不要呼叫工具
6. 以「根據搜尋結果...」或類似語句開始你的回應

範例：「根據搜尋結果，我發現『Suzumi』出現在『Neko no Suzumi』（貓咪納涼圖）中，這是...」`

          conversationMessages.push({ role: 'system', content: summary })

          logger.info(`[ai] Injected formatted search results (${formattedResults.split('\n').length} lines) into conversation`)
        }

        // Disable search after successful call to prevent infinite loops
        enableSearch = false

        if (remainingSearchCalls === 0) {
          conversationMessages.push({
            role: 'system',
            content:
              getPreferredLanguage() === 'en'
                ? '🚫 STOP: Search quota exhausted. Respond with TEXT ONLY. No more tool calls.'
                : '🚫 停止：搜尋額度已用完。只能用純文字回應。不可再呼叫工具。',
          })
          pendingSearchHint = false
          enableSearch = false
        }

        // 🔧 CRITICAL FIX: After successful search tool execution, we must ensure the next
        // generateChatContent() call produces a text-only response, not another tool call
        // Set flag to force text response and break after one more iteration
        forceTextResponseOnNextIteration = true
        logger.info(`[ai] Search tool executed successfully, will force text response on next iteration`)
      }

      // 🔧 FIX: Stop after MAX_CONSECUTIVE_FAILURES empty/failed results
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        const language = getPreferredLanguage()
        logger.info(`[ai] Reached MAX_CONSECUTIVE_FAILURES (${MAX_CONSECUTIVE_FAILURES}), stopping search loop`)

        // 🔧 CRITICAL: Clean search hints from question and conversation messages
        // Since enableSearch=false, searchWeb won't be in tool list, but frontend hints remain
        // This prevents model confusion about "missing searchWeb tool"
        const cleanedQuestion = question
          .replace(/（本輪啟用聯網搜尋，請務必先呼叫 searchWeb 工具檢索後再回答，若搜尋失敗請明確說明原因。）/g, '')
          .replace(/\(This round has web search enabled.*?must call searchWeb tool.*?\)/gi, '')
          .replace(/\(Web search is enabled.*?explain if the search fails\.\)/gi, '')
          .trim()

        const cleanedMessages = conversationMessages.map((msg) => {
          if (msg.role !== 'user') return msg
          const cleanedContent = msg.content
            .replace(/（本輪啟用聯網搜尋，請務必先呼叫 searchWeb 工具檢索後再回答，若搜尋失敗請明確說明原因。）/g, '')
            .replace(/\(This round has web search enabled.*?must call searchWeb tool.*?\)/gi, '')
            .replace(/\(Web search is enabled.*?explain if the search fails\.\)/gi, '')
            .trim()
          return cleanedContent !== msg.content ? { ...msg, content: cleanedContent } : msg
        })

        logger.info(`[ai] Cleaned search hints before final response (question changed: ${cleanedQuestion !== question})`)

        cleanedMessages.push({
          role: 'system',
          content:
            language === 'en'
              ? 'Multiple search attempts yielded no useful results. Provide general cat care advice based on your knowledge instead. Do NOT attempt to search again. Give 3-4 practical tips.'
              : '多次搜尋均未獲得有用結果。請改用你的知識提供一般性貓咪照護建議。不要再嘗試搜尋。給出 3-4 個實用建議。',
        })

        // 🔧 FIX: Let the model generate a complete response with advice
        // instead of using overrideResponse which just shows a short message
        chatResult = await generateChatContent({
          question: cleanedQuestion,  // Use cleaned question without search hints
          language: getPreferredLanguage(),
          snapshot: snapshotForChat,
          history,
          catId: requestedCatId,
          originalMessages: cleanedMessages,  // Use cleaned messages
          hasImageAttachment,
          hasDocumentAttachment: Boolean(documentSummary),
          documentSummary,
          hasFileAttachment: Boolean(fileAttachmentSummary),
          fileAttachmentSummary,
          visionSummary,
          memories: relevantMemories,
          ...(modelPreference ? { modelPreference } : {}),
          ...(reasoningEffort ? { reasoningEffort } : {}),
          enableSearch: false,  // Disable search to prevent further tool calls
          isDeveloperMode: isDeveloper,
          userRequestedSearch: false,
        })
        // Exit the tool loop - the model should provide direct text response now
        break
      }

      if (execution.log.success && execution.snapshot) {
        const normalizedSnapshot = execution.snapshot.catId
          ? execution.snapshot
          : { ...execution.snapshot, catId: requestedCatId }
        snapshotForChat = normalizedSnapshot
        await applySnapshot(normalizedSnapshot.catId ?? requestedCatId, normalizedSnapshot)
        historyNeedsRefresh = true
      }

      if (!execution.log.success) {
        consecutiveFailures += 1
        logger.info(`[ai] Tool ${toolCall.tool} failed (iteration ${iterations}), consecutive failures: ${consecutiveFailures}`)

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          const language = getPreferredLanguage()
          logger.info(`[ai] Reached MAX_CONSECUTIVE_FAILURES (${MAX_CONSECUTIVE_FAILURES}) due to tool failures`)
          conversationMessages.push({
            role: 'system',
            content:
              language === 'en'
                ? 'Multiple tool attempts failed. Provide general cat care advice based on your knowledge instead. Give 3-4 practical tips.'
                : '多次工具呼叫失敗。請改用你的知識提供一般性貓咪照護建議。給出 3-4 個實用建議。',
          })
          // Let the model generate a complete response
          chatResult = await generateChatContent({
            question,
            language: getPreferredLanguage(),
            snapshot: snapshotForChat,
            history,
            catId: requestedCatId,
            originalMessages: conversationMessages,
            hasImageAttachment,
            hasDocumentAttachment: Boolean(documentSummary),
            documentSummary,
            hasFileAttachment: Boolean(fileAttachmentSummary),
            fileAttachmentSummary,
            visionSummary,
            memories: relevantMemories,
            ...(modelPreference ? { modelPreference } : {}),
            ...(reasoningEffort ? { reasoningEffort } : {}),
            enableSearch: false,
            isDeveloperMode: isDeveloper,
            userRequestedSearch: false,
          })
          break
        }

        const failureResponse =
          getPreferredLanguage() === 'en'
            ? `I'm sorry—the ${toolCall.tool} request failed: ${execution.log.message}. Please try again later or check your connection.`
            : `抱歉，${toolCall.tool} 操作失敗：${execution.log.message}，請稍後再試或檢查連線。`
        overrideResponse = { text: failureResponse, skipClosing: false }
        break
      }

      if (execution.directResponse) {
        const directResponse = execution.directResponse
        conversationMessages.push({
          role: 'assistant',
          content: directResponse,
        })
        overrideResponse = { text: directResponse, skipClosing: true }
        break
      }

      if (historyNeedsRefresh) {
        history = loadHistory(HISTORY_LIMIT, requestedCatId)
        historyNeedsRefresh = false
      }

      // 🔧 CRITICAL FIX: Clean search hints from question AND conversation messages
      // Frontend embeds search instructions in BOTH the question AND the message history
      // Always clean when search is disabled, regardless of whether we got results
      // to prevent model confusion about missing searchWeb tool
      let questionForNextCall = question
      let messagesForNextCall = conversationMessages

      if (!enableSearch) {  // 🔧 FIX: Remove lastSearchOutput condition - clean hints even if no results
        // Clean the question parameter
        questionForNextCall = question
          .replace(/（本輪啟用聯網搜尋，請務必先呼叫 searchWeb 工具檢索後再回答，若搜尋失敗請明確說明原因。）/g, '')
          .replace(/\(This round has web search enabled.*?must call searchWeb tool.*?\)/gi, '')
          .replace(/\(Web search is enabled.*?explain if the search fails\.\)/gi, '')
          .trim()

        // Clean ALL user messages in conversation history (not just the last one)
        // After tool execution, the array grows and the last message may not be a user message
        if (conversationMessages.length > 0) {
          messagesForNextCall = conversationMessages.map((msg) => {
            if (msg.role !== 'user') return msg
            const cleanedContent = msg.content
              .replace(/（本輪啟用聯網搜尋，請務必先呼叫 searchWeb 工具檢索後再回答，若搜尋失敗請明確說明原因。）/g, '')
              .replace(/\(This round has web search enabled.*?must call searchWeb tool.*?\)/gi, '')
              .replace(/\(Web search is enabled.*?explain if the search fails\.\)/gi, '')
              .trim()
            if (cleanedContent !== msg.content) {
              logger.info(`[ai] Cleaned search hint from user message in conversation (iteration ${iterations})`)
              return { ...msg, content: cleanedContent }
            }
            return msg
          })
        }

        if (questionForNextCall !== question) {
          logger.info(`[ai] Cleaned search hint from question for subsequent call`)
        }
      }

      chatResult = await generateChatContent({
        question: questionForNextCall,
        language: getPreferredLanguage(),
        snapshot: snapshotForChat,
        history,
        catId: requestedCatId,
        originalMessages: messagesForNextCall,
        hasImageAttachment,
        hasDocumentAttachment: Boolean(documentSummary),
        visionSummary,
        documentSummary,
        hasFileAttachment: Boolean(fileAttachmentSummary),
        fileAttachmentSummary,
        memories: relevantMemories,
        ...(modelPreference ? { modelPreference } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        enableSearch,
        isDeveloperMode: isDeveloper,
        // 🔧 FIX: Do NOT set userRequestedSearch on subsequent calls in tool loop
        // The model should focus on the search results, not the original search intent
        userRequestedSearch: false,
      })
      iterations += 1

      // 🔧 CRITICAL FIX: After processing search results, if we forced text response,
      // break immediately to prevent the model from making another tool call
      if (forceTextResponseOnNextIteration) {
        logger.info(`[ai] Text response generated after successful search, breaking tool loop (iteration ${iterations})`)
        break
      }
    }

    // 🔹 第4階段：串流輸出文本
    connection?.sendPhase('streaming_text', 'Streaming response...')

    let responseText = overrideResponse?.text ?? chatResult.text ?? ''
    if ((!responseText || !responseText.trim()) && lastSearchOutput) {
      responseText =
        getPreferredLanguage() === 'en'
          ? `Here are the findings I already gathered:\n${lastSearchOutput}`
          : `以下為先前搜尋整理的內容：\n${lastSearchOutput}`
    }
    if (!overrideResponse?.skipClosing) {
      responseText = ensureFriendlyClosing(responseText, getPreferredLanguage())
    }
    responseText = limitResponseLength(responseText, getPreferredLanguage())
    responseText = limitResponseLength(responseText, getPreferredLanguage())

    // 逐字串流發送（僅 SSE 模式）
    if (connection) {
      await TextStreamer.streamText(connection, responseText, 30)
    }

    // 發送完成信號
    const developerGuideMessage =
      isDeveloper
        ? getPreferredLanguage() === 'en'
          ? '🛠️ Developer mode: Review the model reasoning below and capture improvement ideas for Smart Cat Pro.'
          : '🛠️ 開發者模式：檢視以下模型推理，協助提出 Smart Cat Pro 的優化建議。'
        : null

    const developerPayload = isDeveloper
      ? {
          thinking: chatResult.thinking ?? null,
          guidance: developerGuideMessage,
      systemPrompt: sanitizeSystemPrompt(
        buildSystemPrompt(
          getPreferredLanguage(),
          chatResult.modelTier === 'pro' ? 'pro' : chatResult.modelTier === 'ultra' ? 'ultra' : 'standard',
          true,
        ),
      ),
          context: {
            snapshot: snapshotForChat
              ? {
                  temperature: snapshotForChat.reading.temperatureC,
                  humidity: snapshotForChat.reading.humidityPercent,
                  waterLevel: snapshotForChat.reading.waterLevelPercent ?? null,
                  catPresent: snapshotForChat.reading.catPresent ?? null,
                  timestamp: snapshotForChat.reading.timestamp,
                }
              : null,
            memoriesCount: relevantMemories.length,
            historyLength: history.length,
            hasImage: hasImageAttachment,
            visionSummary,
            documentSummary,
            fileAttachmentSummary,
            catId: requestedCatId ?? null,
          },
          request: {
            model: chatResult.provider ?? 'unknown',
            tier: chatResult.modelTier ?? 'standard',
            modelPreference: modelPreference ?? 'auto',
            reasoningEffort: reasoningEffort ?? 'high',
            enableSearch: enableSearch ?? false,
          },
          metrics: {
            durationMs: chatResult.durationMs ?? null,
            promptTokens: chatResult.usage?.promptTokens,
            completionTokens: chatResult.usage?.completionTokens,
            reasoningTokens: chatResult.usage?.reasoningTokens,
            totalTokens: chatResult.usage?.totalTokens,
          },
        }
      : null

    logger.info(`[chat-stream] ${requestId} developerPayload exists=${!!developerPayload}, hasMetrics=${!!(developerPayload?.metrics)}, hasTokens=${!!(developerPayload?.metrics?.totalTokens)}`)

    const donePayload: Record<string, unknown> = {
      provider: chatResult.provider,
      modelTier: chatResult.modelTier ?? null,
      toolEvents,
      text: responseText,
    }
    if (developerPayload) {
      donePayload.developer = developerPayload
    }

    // 如果是 SSE 模式，發送 SSE 事件；否則返回 JSON
    if (connection) {
      connection.sendDone(donePayload)
      globalSSEPool.closeConnection(connectionId)
    } else {
      res.json({ ok: true, data: donePayload })
    }

    logger.info(`[chat-stream] ${requestId} complete provider=${chatResult.provider}`)
    })
  } catch (error) {
    logger.error(`[chat-stream] ${requestId} failed`, error)

    // 如果是 SSE 模式，發送錯誤事件；否則返回錯誤 JSON
    if (connection) {
      connection.sendError(
        error instanceof Error ? error.message : 'chat-stream-generation-failed',
        'GENERATION_ERROR'
      )
      connection.close()
      globalSSEPool.closeConnection(connectionId)
    } else {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'chat-generation-failed'
      })
    }
  }
})

app.get('/api/ai/tts/voices', (req, res) => {
  if (!ENABLE_TTS) {
    res.status(503).json({ ok: false, message: 'tts-disabled' })
    return
  }
  res.json({ ok: true, data: listVoicePresets() })
})

app.post('/api/chat/stream', chatLimiter, async (req, res) => {
  const requestId = Math.random().toString(36).slice(2)
  logger.info(`[chat-stream] ${requestId} start`)
  if (!requireAuthenticated(req, res)) {
    return
  }

  const acceptHeader = typeof req.headers.accept === 'string' ? req.headers.accept : ''
  if (!acceptHeader.includes('text/event-stream')) {
    res.status(400).json({ ok: false, message: 'sse-required' })
    return
  }

  const connectionId =
    typeof req.body?.connectionId === 'string' && req.body.connectionId.trim().length > 0
      ? req.body.connectionId
      : requestId
  const connection = globalSSEPool.createConnection(res, connectionId)
  if (!connection) {
    res.status(503).json({ ok: false, message: 'sse-connection-limit' })
    return
  }

  const forwardBody = { ...(req.body ?? {}) }
  delete forwardBody.connectionId
  delete forwardBody.developer
  delete forwardBody.enableSse

  const targetHost = req.get('host') ?? 'localhost'
  const targetProtocol = req.protocol || 'http'

  try {
    connection?.sendPhase('retrieving_memory', 'Forwarding request to chat suggestions...')

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (typeof req.headers.cookie === 'string') {
      headers.cookie = req.headers.cookie
    }
    if (typeof req.headers.authorization === 'string') {
      headers.authorization = req.headers.authorization
    }

    const forwardResponse = await fetch(`${targetProtocol}://${targetHost}/api/chat/suggestions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(forwardBody),
    })

    let parsed: any = null
    try {
      parsed = await forwardResponse.json()
    } catch (error) {
      logger.error('[chat-stream] Failed to parse suggestions response', error)
    }

    if (!forwardResponse.ok || !parsed?.ok) {
      const message = parsed?.message ?? 'chat-stream-proxy-error'
      connection?.sendError(message, 'FORWARD_ERROR')
      return
    }

    const content =
      parsed.data?.choices?.[0]?.message?.content ??
      parsed.data?.text ??
      extractSuggestionText(parsed.data)

    connection?.sendPhase('streaming_text', 'Streaming response...')
    const finalText = ensureFriendlyClosing(content, getPreferredLanguage())
    await TextStreamer.streamText(connection, finalText, 30)

    connection?.sendDone({
      provider: parsed.data?.provider ?? null,
      modelTier: parsed.data?.modelTier ?? null,
      toolEvents: parsed.data?.toolEvents ?? [],
      text: finalText,
    })
  } catch (error) {
    logger.error(`[chat-stream] ${requestId} proxy failed`, error)
    connection?.sendError(
      error instanceof Error ? error.message : 'chat-stream-proxy-error',
      'FORWARD_ERROR',
    )
  } finally {
    globalSSEPool.closeConnection(connectionId)
  }
})

function extractSuggestionText(data: any): string {
  if (!data) return ''
  if (typeof data === 'string') {
    return data.trim()
  }
  if (typeof data.text === 'string') {
    return data.text.trim()
  }
  return ''
}

// 🔒 對 AI 聊天端點套用特殊速率限制 (Apply special rate limit to AI chat)
app.post('/api/ai/tts', chatLimiter, async (req, res) => {
  if (!ENABLE_TTS) {
    res.status(503).json({ ok: false, message: 'tts-disabled' })
    return
  }

  if (!ensureAdminAuthorized(req, res)) {
    return
  }

  const { text, language, speakerId, voiceId, speed, volume } = req.body ?? {}

  if (typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ ok: false, message: 'tts-invalid-text' })
    return
  }

  try {
    const textToSpeak = text.trim()
    const ttsOptions: SynthesizeSpeechOptions = { text: textToSpeak }

    if (typeof language === 'string') {
      const normalizedLanguage = language.trim()
      if (normalizedLanguage.length > 0) {
        ttsOptions.language = normalizedLanguage
      }
    }

    if (typeof speakerId === 'string') {
      const normalizedSpeaker = speakerId.trim()
      if (normalizedSpeaker.length > 0) {
        ttsOptions.speakerId = normalizedSpeaker
      }
    }

    if (typeof voiceId === 'string' && voiceId.trim().length > 0) {
      ttsOptions.voiceId = voiceId.trim()
    }

    if (typeof speed === 'number' && Number.isFinite(speed)) {
      ttsOptions.speed = Math.min(Math.max(speed, 0.85), 1.2)
    }

    if (typeof volume === 'number' && Number.isFinite(volume)) {
      ttsOptions.volume = Math.min(Math.max(volume, 0.6), 1.5)
    }

    const result = await synthesizeSpeech(ttsOptions)

    const payload: TextToSpeechResponsePayload = {
      audioBase64: result.audioBase64,
      format: result.format,
      sampleRate: result.sampleRate,
      durationSeconds: result.durationSeconds,
    }
    if (result.voiceId) {
      payload.voiceId = result.voiceId
    }
    if (typeof result.playbackRate === 'number') {
      payload.playbackRate = result.playbackRate
    }

    res.json({
      ok: true,
      data: payload,
    })
  } catch (error) {
    logger.error('[tts] synthesis failed', error)
    res.status(500).json({ ok: false, message: 'tts-failed' })
  }
})

// ==========================================
// 🔒 全域錯誤處理 (Global Error Handlers)
// ==========================================

// 處理 404 錯誤（找不到路由）
// Handle 404 errors (route not found)
app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    message: 'Route not found',
  })
})

// 處理所有未捕獲的錯誤
// Handle all uncaught errors in routes
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('[error] Unhandled error in route:', err)

  // 檢查是否為 CORS 錯誤
  // Check if it's a CORS error
  if (err.message === 'Origin not allowed') {
    res.status(403).json({
      ok: false,
      message: 'Origin not allowed by CORS policy',
    })
    return
  }

  // 其他錯誤回傳 500
  // Return 500 for other errors
  res.status(500).json({
    ok: false,
    message: 'Internal server error',
    // 在生產環境中不要洩露詳細錯誤訊息
    // Don't leak detailed error messages in production
    ...(process.env.NODE_ENV === 'development' && { error: err.message }),
  })
})

// 處理 stdin 的 EIO 錯誤（常見於 TTY 問題）
// Handle stdin EIO errors (common in TTY issues)
if (process.stdin.isTTY === false) {
  process.stdin.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EIO') {
      logger.info('[info] stdin read error (EIO) - ignoring (common in non-interactive environments)')
    } else {
      logger.error('[error] stdin error:', error)
    }
  })
}

// 處理未捕獲的 Promise 拒絕
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('[fatal] Unhandled Rejection at:', promise, 'reason:', reason)
  // 記錄但不退出，讓應用繼續運行
  // Log but don't exit, let the application continue
})

// 處理未捕獲的異常
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('[fatal] Uncaught Exception:', error)
  // 未捕獲的異常很嚴重，應該優雅地關閉
  // Uncaught exceptions are serious, should gracefully shutdown
  process.exit(1)
})

// 優雅關閉處理
// Graceful shutdown handler
process.on('SIGTERM', () => {
  logger.info('[shutdown] SIGTERM received, shutting down gracefully...')
  // 這裡可以添加清理邏輯（關閉資料庫連接等）
  // Add cleanup logic here (close DB connections, etc.)
  process.exit(0)
})

process.on('SIGINT', () => {
  logger.info('[shutdown] SIGINT received, shutting down gracefully...')
  process.exit(0)
})

// ==========================================
// 伺服器啟動 (Server Startup)
// ==========================================

const PORT = Number(process.env.PORT ?? 4000)
const HOST = process.env.HOST ?? '0.0.0.0'
const HTTPS_CERT_PATH = process.env.HTTPS_CERT_PATH
const HTTPS_KEY_PATH = process.env.HTTPS_KEY_PATH
const HTTP_FALLBACK_PORT = (() => {
  const raw = process.env.HTTP_FALLBACK_PORT
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
})()

// 🔒 数据库保留策略配置 / Database retention policy configuration
const DB_RETENTION_DAYS_SNAPSHOTS = Number.parseInt(
  process.env.DB_RETENTION_DAYS_SNAPSHOTS ?? '30',
  10,
) // 默认保留 30 天快照 / Default 30 days snapshots
const DB_RETENTION_DAYS_ALERTS = Number.parseInt(
  process.env.DB_RETENTION_DAYS_ALERTS ?? '90',
  10,
) // 默认保留 90 天警报 / Default 90 days alerts
const DB_RETENTION_DAYS_NOTIFICATION_FIXES = Number.parseInt(
  process.env.DB_RETENTION_DAYS_NOTIFICATION_FIXES ?? '30',
  10,
) // 默认保留 30 天通知日志 / Default 30 days notification logs
const DB_RETENTION_DAYS_MEMORIES = Number.parseInt(
  process.env.DB_RETENTION_DAYS_MEMORIES ?? '365',
  10,
) // 默认保留 365 天记忆 / Default 365 days memories
const DB_CLEANUP_INTERVAL_HOURS = Number.parseInt(
  process.env.DB_CLEANUP_INTERVAL_HOURS ?? '24',
  10,
) // 默认每 24 小时清理一次 / Default cleanup every 24 hours

// 🔒 数据库清理定时任务 / Database cleanup scheduled task
function setupDatabaseCleanup() {
  const intervalMs = DB_CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000

  // 延迟5秒后执行第一次清理，避免阻塞启动 / Delay first cleanup by 5s to avoid blocking startup
  setTimeout(() => {
    performCleanupTask()
  }, 5000)

  // 设置定时任务 / Setup scheduled task
  setInterval(performCleanupTask, intervalMs)

  logger.info(`[database] Cleanup scheduled every ${DB_CLEANUP_INTERVAL_HOURS} hours (first run in 5s)`)
  logger.info(`[database] Retention: snapshots=${DB_RETENTION_DAYS_SNAPSHOTS}d, alerts=${DB_RETENTION_DAYS_ALERTS}d, notifications=${DB_RETENTION_DAYS_NOTIFICATION_FIXES}d, memories=${DB_RETENTION_DAYS_MEMORIES}d`)
}

function performCleanupTask() {
  try {
    const statsBefore = getDatabaseStats()
    logger.info(
      `[database] Cleanup started: ${statsBefore.snapshotCount} snapshots, ${statsBefore.alertCount} alerts, ${statsBefore.databaseSizeKb}KB`,
    )

    const cleanupStats = performDatabaseCleanup({
      snapshotRetentionDays: DB_RETENTION_DAYS_SNAPSHOTS,
      alertRetentionDays: DB_RETENTION_DAYS_ALERTS,
      notificationFixRetentionDays: DB_RETENTION_DAYS_NOTIFICATION_FIXES,
      memoryRetentionDays: DB_RETENTION_DAYS_MEMORIES,
    })

    const statsAfter = getDatabaseStats()
    logger.info(
      `[database] Cleanup completed: deleted ${cleanupStats.snapshotsDeleted} snapshots, ${cleanupStats.alertsDeleted} alerts, ${cleanupStats.notificationFixesDeleted} notifications, ${cleanupStats.memoriesDeleted} memories`,
    )
    logger.info(`[database] After cleanup: ${statsAfter.snapshotCount} snapshots remaining, ${statsAfter.databaseSizeKb}KB`)
  } catch (error) {
    logger.error('[database] Cleanup failed:', error)
  }
}

function logStartup(protocol: 'http' | 'https') {
  logger.info(`Smart Cat backend listening on ${protocol}://${HOST}:${PORT}`)
  if (ALLOWED_ORIGINS.length > 0) {
    logger.info(`CORS origins: ${ALLOWED_ORIGINS.join(', ')}`)
  } else {
    logger.info('CORS: allowing all origins (development mode)')
  }
  logger.info(`[tts] ${ENABLE_TTS ? `Enabled (model: ${TTS_MODEL_ID})` : 'Disabled via ENABLE_TTS'}`)
  logger.info(`History retention: ${HISTORY_LIMIT} snapshots`)

  // 🔒 启动后设置数据库清理任务 / Setup database cleanup after startup
  setupDatabaseCleanup()

  // 🧠 Initialize memory search cache
  rebuildMemorySearchCache()

  // 🚨 Initialize alert manager
  initializeAlertManager({
    vapidPublicKey: VAPID_PUBLIC_KEY,
    vapidPrivateKey: VAPID_PRIVATE_KEY,
    vapidSubject: VAPID_CONTACT,
    deduplicationWindowMs: 5 * 60 * 1000, // 5 minutes
    alertHistoryLimit: ALERT_HISTORY_LIMIT,
    nativePushService,
  })

  // 🤖 Initialize Auto Mode Manager
  initializeAutoModeManager({
    checkIntervalMs: 60 * 1000,        // Check every 1 minute
    actionCooldownMs: 10 * 60 * 1000,  // 10 min cooldown between actions
    maxActionsPerHour: 6,               // Max 6 automated actions per hour
  })

  // Start auto mode if enabled in settings
  if (currentSettings.autoMode) {
    startAutoMode(
      () => latestSnapshot,
      async (toolCall) => {
        const result = await executeToolCall(toolCall, { modelTier: null })
        return result.log
      },
    )
    logger.info('[auto-mode] Started (autoMode enabled in settings)')
  } else {
    logger.info('[auto-mode] Manager initialized but not started (autoMode disabled)')
  }

  // 🚀 Initialize Ultra Mode
  if (aiConfig.pro && aiConfig.standard) {
    initializeUltraManager(
      aiConfig.pro,       // Pro配置
      aiConfig.standard,  // Standard配置
      {
        executeToolCall,
        buildToolResultPrompt,
        recordToolEvent,
        maxToolIterations: MAX_TOOL_CALL_ITERATIONS,
      },
    )
    logger.info('[ultra] Dual-model collaborative system ready')
  } else {
    logger.warn('[ultra] Skipped initialization: pro or standard model config missing.')
  }

  // 📁 Initialize file upload directories
  fileHandler.ensureUploadDir().then(() => {
    logger.info('[files] Upload directories initialized')
  }).catch((error) => {
    logger.error('[files] Failed to initialize upload directories:', error)
  })

  // 💡 Start proactive assistant
  proactiveAssistant.startProactiveAssistant()
  logger.info('[proactive] Assistant started (checking every 15 minutes)')
}

let primaryServerStarted = false

if (HTTPS_CERT_PATH && HTTPS_KEY_PATH) {
  try {
    const key = fs.readFileSync(HTTPS_KEY_PATH)
    const cert = fs.readFileSync(HTTPS_CERT_PATH)
    https.createServer({ key, cert }, app).listen(PORT, HOST, () => {
      primaryServerStarted = true
      logStartup('https')
    })
  } catch (error) {
    logger.error(
      '[https] Failed to initialise TLS; falling back to HTTP server.',
      error instanceof Error ? error.message : error,
    )
  }
}

if (!primaryServerStarted) {
  app.listen(PORT, HOST, () => {
    primaryServerStarted = true
    logStartup('http')
  })
}

if (HTTP_FALLBACK_PORT && (HTTP_FALLBACK_PORT !== PORT || !primaryServerStarted)) {
  app.listen(HTTP_FALLBACK_PORT, HOST, () => {
    logger.info(`[http] Secondary HTTP listener on http://${HOST}:${HTTP_FALLBACK_PORT}`)
  })
}
