import type { Language } from '../i18n/translations'
import type {
  SmartHomeSettings,
  CalibrationProfile,
  BackendHealth,
  MemoryEntry,
  MemoryType,
  ToolEventSummary,
  NotificationFixEntry,
  AlertRule,
  ChatFavoriteEntry,
  MemoryKeywordStat,
  ProfessionalCareReport,
  TextToSpeechResponse,
  CareInsight,
  BehaviorForecast,
  BehaviorProfile,
  CareTask,
  CarePlugin,
  KnowledgeArticle,
  VoicePresetSummary,
  CareTaskStatus,
  CareInsightCategory,
  CatProfile,
  AudioStatus,
  UvFanStatus,
  VisionStatus,
  DashboardLayoutPreference,
  AiToolName,
  McpToolsResponse,
  McpInvocationResult,
  FeederStatus,
  HydrationStatus,
  PushStatusSummary,
  PetProfile,
  PetType,
} from '../types/smartHome'
import type { AuthUser } from '../types/auth'
import { getAuthToken, clearAuthState } from './authState'

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
const rawBaseUrlMap = import.meta.env.VITE_API_BASE_URL_MAP ?? ''

function parseBaseUrlMap(input: string): Record<string, string> {
  if (!input || typeof input !== 'string') return {}
  const map: Record<string, string> = {}
  for (const entry of input.split(/[,;\n]/)) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const [key, value] = trimmed.split('=').map((part) => part.trim())
    if (!key || !value) continue
    map[key.toLowerCase()] = value
  }
  return map
}

const baseUrlMap = parseBaseUrlMap(rawBaseUrlMap)
const rawAdminHeader = (import.meta.env.VITE_ADMIN_API_KEY ?? '').trim()
const ADMIN_HEADER_VALUE =
  rawAdminHeader.length > 0
    ? rawAdminHeader.toLowerCase().startsWith('bearer ')
      ? rawAdminHeader
      : `Bearer ${rawAdminHeader}`
    : ''

function resolveApiBaseUrl(): string {
  if (Object.keys(baseUrlMap).length === 0) {
    return rawBaseUrl
  }

  let hostKey = ''
  let hostnameKey = ''
  if (typeof window !== 'undefined') {
    hostKey = window.location.host.toLowerCase()
    hostnameKey = window.location.hostname.toLowerCase()
    if (hostKey && baseUrlMap[hostKey]) {
      return baseUrlMap[hostKey]
    }
  }

  if (hostnameKey && baseUrlMap[hostnameKey]) {
    return baseUrlMap[hostnameKey]
  }

  if (baseUrlMap.default) {
    return baseUrlMap.default
  }

  if (baseUrlMap['*']) {
    return baseUrlMap['*']
  }

  return rawBaseUrl
}

export const API_BASE_URL = resolveApiBaseUrl()
export const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_BASE_URL ?? ''
export const OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL ?? ''
export const CAMERA_SNAPSHOT_ENDPOINT = '/api/camera/snapshot'

type HardwareProfileHeader = {
  id: string
  label: string
}

let activeHardwareProfile: HardwareProfileHeader | null = null

export function setHardwareProfileHeader(profile: { id: string; label?: string } | null) {
  if (!profile) {
    activeHardwareProfile = null
    return
  }
  const trimmedId = profile.id.trim()
  if (!trimmedId) {
    activeHardwareProfile = null
    return
  }
  activeHardwareProfile = {
    id: trimmedId,
    label: profile.label?.trim() && profile.label.trim().length > 0 ? profile.label.trim() : trimmedId,
  }
}

export interface ApiResult {
  ok: boolean
  status?: number
  message?: string
}

export interface ApiResultWithData<T> extends ApiResult {
  data?: T
}

async function request<T>(
  path: string,
  init: RequestInit,
): Promise<ApiResultWithData<T>> {
  if (!API_BASE_URL) {
    console.warn('[backend] Missing VITE_API_BASE_URL, skipping request for', path)
    return { ok: false, message: 'API base URL not configured' }
  }

  // 🚀 Add request timeout to prevent hanging requests. Match backend's worst-case (Pro + fallback ≈ 180s)
  // so長時推理或搜尋不會被前端先中止，維持與後端協調的等待時間。
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 180000)

  try {
    const headers = new Headers(init.headers ?? {})
    const token = getAuthToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    if (ADMIN_HEADER_VALUE.length > 0 && !headers.has('x-smartcat-admin')) {
      headers.set('x-smartcat-admin', ADMIN_HEADER_VALUE)
    }
    if (activeHardwareProfile) {
      headers.set('x-smartcat-hardware', activeHardwareProfile.id)
      headers.set('x-smartcat-hardware-label', activeHardwareProfile.label)
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      cache: 'no-store',
      ...init,
      headers,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      if (response.status === 401) {
        clearAuthState()
      }
      return {
        ok: false,
        status: response.status,
        message: text || response.statusText,
      }
    }

    let data: unknown
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => undefined)
    }

    const payload =
      data && typeof data === 'object' && data !== null && 'data' in (data as Record<string, unknown>)
        ? (data as { data: unknown }).data
        : data
    const message =
      data && typeof data === 'object' && data !== null && 'message' in (data as Record<string, unknown>)
        ? String((data as { message: unknown }).message ?? '')
        : undefined
    return {
      ok: true,
      status: response.status,
      data: payload as T,
      message: message && message.length > 0 ? message : undefined,
    }
  } catch (error) {
    clearTimeout(timeoutId)
    console.warn('[backend] Request failed', path, error)
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export function getJson<T>(path: string): Promise<ApiResultWithData<T>> {
  return request<T>(path, { method: 'GET' })
}

export function postJson<T>(path: string, body: unknown): Promise<ApiResultWithData<T>> {
  return request<T>(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

export function patchJson<T>(path: string, body: unknown): Promise<ApiResultWithData<T>> {
  return request<T>(path, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

export function deleteRequest<T>(path: string): Promise<ApiResultWithData<T>> {
  return request<T>(path, { method: 'DELETE' })
}

export async function saveLanguagePreference(language: Language) {
  return postJson('/api/preferences/language', { language })
}

type WebPushSubscription = ReturnType<PushSubscription['toJSON']>

export interface NativePushRegistrationPayload {
  token: string
  platform: 'ios' | 'android'
  transport?: 'apns' | 'fcm'
  metadata?: Record<string, unknown>
}

export type PushRegistrationRequest =
  | {
      language: Language
      subscription: WebPushSubscription
    }
  | {
      language: Language
      nativeDevice: NativePushRegistrationPayload
    }

export async function registerPushSubscription(payload: PushRegistrationRequest) {
  return postJson('/api/push-subscriptions', payload)
}

export interface CatUpsertPayload {
  id?: string
  name: string
  avatarUrl?: string | null
  breed?: string | null
  birthdate?: string | null
  weightKg?: number | null
  notes?: string | null
  tags?: string[] | null
  setActive?: boolean
}

export async function fetchCats() {
  const response = await getJson<{ cats: CatProfile[]; activeCatId: string }>('/api/cats')
  if (!response.ok) {
    throw new Error(response.message ?? 'cats-fetch-failed')
  }
  return response.data ?? { cats: [], activeCatId: 'default' }
}

export async function createCatProfile(payload: CatUpsertPayload) {
  const response = await postJson<CatProfile>('/api/cats', payload)
  if (!response.ok) {
    throw new Error(response.message ?? 'cat-create-failed')
  }
  return response.data
}

export async function updateCatProfile(id: string, payload: CatUpsertPayload) {
  const response = await patchJson<CatProfile>(`/api/cats/${encodeURIComponent(id)}`, payload)
  if (!response.ok) {
    throw new Error(response.message ?? 'cat-update-failed')
  }
  return response.data
}

export async function selectActiveCat(id: string) {
  const response = await postJson<{ activeCatId: string; snapshot: unknown }>(`/api/cats/${encodeURIComponent(id)}/select`, {})
  if (!response.ok) {
    throw new Error(response.message ?? 'cat-select-failed')
  }
  return response.data
}

export async function deleteCatProfile(id: string) {
  const response = await deleteRequest(`/api/cats/${encodeURIComponent(id)}`)
  if (!response.ok) {
    throw new Error(response.message ?? 'cat-delete-failed')
  }
  return response.data
}

export interface ChatAttachmentPayload {
  type?: 'image' | 'pdf' | 'word'
  dataUrl: string
  mimeType?: string
  filename?: string
}

export interface ChatMessagePayload {
  role: 'user' | 'assistant' | 'system'
  content: string
  imageBase64?: string
  attachment?: ChatAttachmentPayload
}

export interface ChatSuggestionResponse {
  provider?: string
  modelTier?: 'standard' | 'pro' | null
  durationMs?: number | null
  choices?: Array<{ message?: ChatMessagePayload }>
  toolEvents?: Array<{
    tool: AiToolName
    success: boolean
    message: string
    args?: unknown
    durationMs?: number
    output?: string
  }>
  developer?: {
    thinking?: string | null
    guidance?: string | null
    systemPrompt?: string | null
    context?: {
      snapshot?: {
        temperature: number
        humidity: number
        waterLevel: number
        catPresent: boolean
        timestamp: string
      } | null
      memoriesCount?: number
      historyLength?: number
      hasImage?: boolean
      catId?: string | null
    }
    request?: {
      model?: string
      tier?: string
      modelPreference?: string
      reasoningEffort?: string
      enableSearch?: boolean
    }
    metrics?: {
      durationMs?: number | null
    }
  }
}

export async function fetchChatSuggestions(
  messages: ChatMessagePayload[],
  language: Language,
  modelPreference?: 'standard' | 'pro' | 'auto',
  reasoningEffort?: 'low' | 'medium' | 'high',
  options?: { enableSearch?: boolean; catId?: string; intent?: 'default' | 'mcp' },
) {
  if (API_BASE_URL) {
    const payload: Record<string, unknown> = { messages, language }
    if (modelPreference) {
      payload.modelPreference = modelPreference
    }
    if (reasoningEffort) {
      payload.reasoningEffort = reasoningEffort
    }
    if (typeof options?.enableSearch === 'boolean') {
      payload.enableSearch = options.enableSearch
    }
    if (options?.catId) {
      payload.catId = options.catId
    }
    if (options?.intent) {
      payload.intent = options.intent
    }
    return postJson<ChatSuggestionResponse>(
      '/api/chat/suggestions',
      payload,
    )
  }

  if (OLLAMA_BASE_URL && OLLAMA_MODEL) {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages,
          stream: false,
        }),
      })

      if (!response.ok) {
        const message = await response.text().catch(() => response.statusText)
        return { ok: false, status: response.status, message }
      }

      const data = (await response.json()) as {
        message?: ChatMessagePayload
      }

      return {
        ok: true,
        status: 200,
        data: data.message
          ? { choices: [{ message: data.message }] }
          : { choices: [] },
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return {
    ok: false,
    message:
      'No AI backend configured. Set VITE_API_BASE_URL or VITE_OLLAMA_BASE_URL/VITE_OLLAMA_MODEL.',
  }
}

export function fetchMcpTools() {
  return getJson<McpToolsResponse>('/api/mcp/tools')
}

export function invokeMcpTool(tool: string, args: Record<string, unknown>) {
  return postJson<McpInvocationResult>('/mcp/invoke', { tool, args })
}

export async function requestTextToSpeech(payload: {
  text: string
  language?: string
  speakerId?: string
  voiceId?: string
  speed?: number
  volume?: number
  tone?: string
}) {
  return postJson<TextToSpeechResponse>('/api/ai/tts', payload)
}

export async function fetchProfessionalReport(language?: string) {
  const params = new URLSearchParams()
  if (language) params.set('language', language)
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  const result = await getJson<ProfessionalCareReport>(`/api/reports/professional${suffix}`)
  if (!result.ok || !result.data) {
    throw new Error(result.message ?? 'Failed to load care report')
  }
  return result.data
}

interface CareInsightsResponse {
  generatedAt: string
  sampleCount: number
  insights: CareInsight[]
}

export async function fetchCareInsights(catId?: string | null, language?: string): Promise<CareInsightsResponse> {
  const params = new URLSearchParams()
  if (catId) {
    params.set('catId', catId)
  }
  if (language) {
    params.set('language', language)
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  const response = await getJson<CareInsightsResponse>(`/api/analytics/insights${suffix}`)
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-fetch-insights')
  }
  return response.data
}

export async function fetchBehaviorForecast(catId?: string | null, language?: string): Promise<BehaviorForecast> {
  const params = new URLSearchParams()
  if (catId) {
    params.set('catId', catId)
  }
  if (language) {
    params.set('language', language)
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  const response = await getJson<BehaviorForecast>(`/api/analytics/forecast${suffix}`)
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-fetch-forecast')
  }
  return response.data
}

export async function fetchBehaviorProfile(catId?: string | null): Promise<BehaviorProfile | null> {
  const params = new URLSearchParams()
  if (catId) {
    params.set('catId', catId)
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  const response = await getJson<BehaviorProfile | null>(`/api/behavior/profile${suffix}`)
  if (!response.ok) {
    throw new Error(response.message ?? 'failed-to-fetch-behavior-profile')
  }
  return response.data ?? null
}

export async function fetchDashboardPreferences(): Promise<DashboardLayoutPreference | null> {
  const response = await getJson<DashboardLayoutPreference | null>('/api/preferences/dashboard')
  if (!response.ok) {
    throw new Error(response.message ?? 'failed-to-fetch-dashboard-preferences')
  }
  return response.data ?? null
}

export async function saveDashboardPreferences(update: {
  hiddenPanels?: string[]
  panelOrder?: string[]
}): Promise<DashboardLayoutPreference> {
  const response = await postJson<DashboardLayoutPreference>('/api/preferences/dashboard', update)
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-save-dashboard-preferences')
  }
  return response.data
}

export function fetchAudioStatus() {
  return getJson<AudioStatus | null>('/api/audio/status')
}

export function playAudioPattern(pattern: string, repeat?: number) {
  const payload: Record<string, unknown> = { pattern }
  if (typeof repeat === 'number' && Number.isFinite(repeat)) {
    payload.repeat = repeat
  }
  return postJson<AudioStatus>('/api/audio/play', payload)
}

export function stopAudioPattern() {
  return postJson<AudioStatus>('/api/audio/stop', {})
}

export function updateAudioConfiguration(payload: {
  muted?: boolean
  volumePercent?: number
  pattern?: string
  repeat?: number
}) {
  return postJson<AudioStatus>('/api/audio/config', payload)
}

export function fetchUvFanStatus() {
  return getJson<UvFanStatus | null>('/api/uv-fan/status')
}

export function setUvFanState(payload: { uvOn?: boolean; fanOn?: boolean; autoMode?: boolean }) {
  return postJson<UvFanStatus>('/api/uv-fan/state', payload)
}

export function startUvCleaning(durationMs?: number) {
  const body: Record<string, number> = {}
  if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0) {
    body.durationMs = Math.round(durationMs)
  }
  return postJson<UvFanStatus>('/api/uv-fan/cleaning/start', Object.keys(body).length > 0 ? body : {})
}

export function stopUvCleaning() {
  return postJson<UvFanStatus>('/api/uv-fan/cleaning/stop', {})
}

export function fetchFeederStatus() {
  return getJson<FeederStatus | null>('/api/feeder/status')
}

export function startFeederCycle(payload?: { targetGrams?: number; minGrams?: number }) {
  return postJson<FeederStatus | null>('/api/feeder/feed', payload && Object.keys(payload).length > 0 ? payload : {})
}

export function stopFeederCycle() {
  return postJson<FeederStatus | null>('/api/feeder/stop', {})
}

export function fetchHydrationStatus() {
  return getJson<HydrationStatus | null>('/api/hydration/status')
}

export function triggerHydrationPump(durationMs?: number) {
  const body = typeof durationMs === 'number' && Number.isFinite(durationMs) ? { durationMs } : {}
  return postJson<HydrationStatus | null>('/api/hydration/pump', body)
}

export function fetchCameraStatus() {
  return getJson<VisionStatus>('/api/camera/status')
}

export function refreshCameraStatus() {
  return postJson<VisionStatus>('/api/camera/refresh', {})
}

export function buildCameraSnapshotUrl(cacheBuster = true) {
  if (!API_BASE_URL) {
    return ''
  }
  const base = `${API_BASE_URL}${CAMERA_SNAPSHOT_ENDPOINT}`
  if (!cacheBuster) {
    return base
  }
  return `${base}?ts=${Date.now()}`
}

export async function fetchKnowledgeArticles(query?: string, tags?: string[]): Promise<KnowledgeArticle[]> {
  const params = new URLSearchParams()
  if (query && query.trim().length > 0) {
    params.set('q', query.trim())
  }
  if (tags && tags.length > 0) {
    params.set('tags', tags.join(','))
  }
  const suffix = params.toString().length > 0 ? `?${params.toString()}` : ''
  const response = await getJson<KnowledgeArticle[]>(`/api/knowledge/articles${suffix}`)
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-fetch-knowledge')
  }
  return response.data
}

export async function fetchCareTasks(limit = 50): Promise<CareTask[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  const response = await getJson<CareTask[]>(`/api/tasks?${params.toString()}`)
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-fetch-tasks')
  }
  return response.data
}

export async function createCareTaskRequest(task: {
  title: string
  description: string
  category?: CareInsightCategory | 'general'
  dueAt?: string | null
  metadata?: Record<string, unknown>
}): Promise<CareTask> {
  const response = await postJson<CareTask>('/api/tasks', task)
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-create-task')
  }
  return response.data
}

export async function updateCareTaskStatusRequest(id: number, status: CareTaskStatus): Promise<CareTask> {
  const response = await request<CareTask>(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-update-task')
  }
  return response.data
}

export async function deleteCareTaskRequest(id: number): Promise<void> {
  const response = await request(`/api/tasks/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(response.message ?? 'failed-to-delete-task')
  }
}

interface TaskSuggestionResponse {
  generatedAt: string
  created: CareTask[]
  suggestions: Array<{ title: string; description: string; category: CareInsightCategory | 'general' }>
}

export async function requestTaskSuggestions(): Promise<TaskSuggestionResponse> {
  const response = await postJson<TaskSuggestionResponse>('/api/tasks/suggest', {})
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-suggest-tasks')
  }
  return response.data
}

export async function fetchCarePlugins(): Promise<CarePlugin[]> {
  const response = await getJson<CarePlugin[]>('/api/plugins')
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-fetch-plugins')
  }
  return response.data
}

interface LoginSuccessPayload {
  token: string
  user: AuthUser
}

export async function loginRequest(username: string, password: string): Promise<LoginSuccessPayload> {
  const response = await postJson<LoginSuccessPayload>('/api/auth/login', { username, password })
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'login-failed')
  }
  const { token, user } = response.data
  if (!token || !user) {
    throw new Error('login-response-invalid')
  }
  return response.data
}

export async function logoutRequest(): Promise<void> {
  const response = await postJson('/api/auth/logout', {})
  if (!response.ok) {
    throw new Error(response.message ?? 'logout-failed')
  }
}

export async function fetchCurrentUserProfile(): Promise<AuthUser> {
  const response = await getJson<{ user: AuthUser }>('/api/auth/me')
  if (!response.ok || !response.data?.user) {
    throw new Error(response.message ?? 'profile-fetch-failed')
  }
  return response.data.user
}

export async function registerOrUpdatePlugin(plugin: {
  name: string
  description?: string
  capabilities?: string[]
  apiBaseUrl?: string
  enabled?: boolean
  metadata?: Record<string, unknown>
}): Promise<CarePlugin> {
  const response = await postJson<CarePlugin>('/api/plugins', plugin)
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-save-plugin')
  }
  return response.data
}

export async function updatePluginEnabled(id: number, enabled: boolean): Promise<CarePlugin> {
  const response = await request<CarePlugin>(`/api/plugins/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-toggle-plugin')
  }
  return response.data
}

export async function deletePlugin(id: number): Promise<void> {
  const response = await request(`/api/plugins/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(response.message ?? 'failed-to-delete-plugin')
  }
}

export async function fetchVoicePresets(): Promise<VoicePresetSummary[]> {
  const response = await getJson<VoicePresetSummary[]>('/api/ai/tts/voices')
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-fetch-voices')
  }
  return response.data
}

export async function fetchCalibrationProfile() {
  const response = await getJson<CalibrationProfile>('/api/calibration')
  if (response.ok) {
    return response.data ?? {}
  }
  throw new Error(response.message ?? 'calibration-fetch-failed')
}

export async function updateCalibrationProfile(payload: Partial<CalibrationProfile>) {
  const response = await postJson<{ profile: CalibrationProfile; summary?: string | null }>(
    '/api/calibration',
    payload,
  )
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'calibration-update-failed')
  }
  const profile = response.data.profile ?? {}
  const summary = response.data.summary ?? null
  return { profile, summary }
}

export async function updateSmartHomeSettings(settings: SmartHomeSettings) {
  const response = await postJson<SmartHomeSettings>('/api/settings', settings)
  if (!response.ok) {
    throw new Error(response.message ?? 'settings-update-failed')
  }
  return response.data ?? settings
}

const EMPTY_CHAT_METRICS: BackendHealth['chat'] = {
  provider: null,
  source: null,
  durationMs: null,
  updatedAt: null,
  error: null,
}

export async function fetchBackendHealth(): Promise<BackendHealth> {
  const response = await getJson<BackendHealth>('/health')
  if (!response.ok) {
    throw new Error(response.message ?? 'health-fetch-failed')
  }
  return {
    status: response.data?.status ?? 'unknown',
    lastSnapshotAt: response.data?.lastSnapshotAt ?? null,
    historyCount: response.data?.historyCount ?? 0,
    chat: response.data?.chat ?? EMPTY_CHAT_METRICS,
    toolEvents: response.data?.toolEvents ?? [],
    pinnedToolEvents: response.data?.pinnedToolEvents ?? [],
    notifications: response.data?.notifications ?? { fixes: [] },
    alertRules: response.data?.alertRules ?? [],
  }
}

export async function pinToolEventSummary(event: ToolEventSummary) {
  const response = await postJson<ToolEventSummary[]>('/api/tool-events/pinned', event)
  if (!response.ok) {
    throw new Error(response.message ?? 'tool-event-pin-failed')
  }
  return response.data ?? []
}

export async function unpinToolEventSummary(timestamp: string) {
  const response = await request<ToolEventSummary[]>(`/api/tool-events/pinned/${encodeURIComponent(timestamp)}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(response.message ?? 'tool-event-unpin-failed')
  }
  return response.data ?? []
}

export async function fetchAlertRules() {
  const response = await getJson<AlertRule[]>('/api/alert-rules')
  if (!response.ok) {
    throw new Error(response.message ?? 'alert-rules-fetch-failed')
  }
  return response.data ?? []
}

export async function createAlertRule(payload: {
  metric: AlertRule['metric']
  comparison: AlertRule['comparison']
  threshold: number
  severity: AlertRule['severity']
  message?: string
  enabled?: boolean
}) {
  const response = await postJson<AlertRule>('/api/alert-rules', payload)
  if (!response.ok) {
    throw new Error(response.message ?? 'alert-rule-create-failed')
  }
  return response.data
}

export async function updateAlertRuleEntry(id: number, payload: {
  comparison: AlertRule['comparison']
  threshold: number
  severity: AlertRule['severity']
  message?: string
  enabled: boolean
}) {
  const response = await request<AlertRule>(`/api/alert-rules/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(response.message ?? 'alert-rule-update-failed')
  }
  return response.data
}

export async function deleteAlertRuleEntry(id: number) {
  const response = await request<AlertRule[]>(`/api/alert-rules/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(response.message ?? 'alert-rule-delete-failed')
  }
  return response.data ?? []
}

export async function fetchMemoryKeywords(limit = 20) {
  const response = await getJson<MemoryKeywordStat[]>(`/api/memories/keywords?limit=${limit}`)
  if (!response.ok) {
    throw new Error(response.message ?? 'memory-keywords-fetch-failed')
  }
  return response.data ?? []
}

export async function fetchChatFavorites() {
  const response = await getJson<ChatFavoriteEntry[]>('/api/chat/favorites')
  if (!response.ok) {
    throw new Error(response.message ?? 'chat-favorites-fetch-failed')
  }
  return response.data ?? []
}

export async function createChatFavorite(payload: {
  messageId?: string | null
  role: ChatFavoriteEntry['role']
  content: string
  metadata?: Record<string, unknown>
}) {
  const response = await postJson<ChatFavoriteEntry>('/api/chat/favorites', payload)
  if (!response.ok) {
    throw new Error(response.message ?? 'chat-favorite-create-failed')
  }
  return response.data
}

export async function deleteChatFavorite(id: number, messageId?: string | null) {
  const url = messageId
    ? `/api/chat/favorites/${id}?messageId=${encodeURIComponent(messageId)}`
    : `/api/chat/favorites/${id}`
  const response = await request(url, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(response.message ?? 'chat-favorite-delete-failed')
  }
}

export async function downloadDiagnosticReport(): Promise<Blob> {
  if (!API_BASE_URL) {
    throw new Error('API base URL not configured')
  }
  const response = await fetch(`${API_BASE_URL}/api/diagnostics/report`, {
    method: 'GET',
    credentials: 'include',
  })
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new Error(text || 'diagnostics-report-failed')
  }
  return await response.blob()
}

export async function logNotificationFixAttempt(payload: {
  step: NotificationFixEntry['step']
  success: boolean
  message?: string
}) {
  const response = await postJson<NotificationFixEntry>('/api/diagnostics/notifications/fix', payload)
  if (!response.ok) {
    throw new Error(response.message ?? 'notification-fix-log-failed')
  }
  return response.data
}

export async function fetchMemories(params: { type?: MemoryType; limit?: number } = {}) {
  const query = new URLSearchParams()
  if (params.type) query.set('type', params.type)
  if (params.limit) query.set('limit', String(params.limit))
  const response = await getJson<MemoryEntry[]>(`/api/memories${query.toString() ? `?${query.toString()}` : ''}`)
  if (!response.ok) {
    throw new Error(response.message ?? 'memories-fetch-failed')
  }
  return response.data ?? []
}

export async function createMemory(payload: { type: MemoryType; content: string; source?: string }) {
  const response = await postJson<MemoryEntry>('/api/memories', payload)
  if (!response.ok) {
    throw new Error(response.message ?? 'memory-create-failed')
  }
  return response.data
}

export async function updateMemoryEntry(id: number, content: string) {
  const response = await request(`/api/memories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!response.ok) {
    throw new Error(response.message ?? 'memory-update-failed')
  }
}

export async function deleteMemoryEntry(id: number) {
  const response = await request(`/api/memories/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(response.message ?? 'memory-delete-failed')
  }
}

// ==================== 知識提取 API ====================

export type KnowledgeType = 'fact' | 'habit' | 'health' | 'preference' | 'event'

export interface KnowledgeItem {
  id: string
  type: KnowledgeType
  content: string
  confidence: number
  importance: 'low' | 'medium' | 'high'
  tags: string[]
  relatedDate?: string
  createdAt: string
  source: string
  catId?: string
}

export async function extractKnowledge(messages: Array<{ role: string; content: string }>, catId?: string) {
  const response = await request('/api/knowledge/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, catId }),
  })

  if (!response.ok) {
    throw new Error('Failed to extract knowledge')
  }

  return response.data
}

export async function fetchKnowledge(catId?: string, limit?: number) {
  const params = new URLSearchParams()
  if (catId) params.append('catId', catId)
  if (limit) params.append('limit', limit.toString())

  const response = await request(`/api/knowledge?${params.toString()}`)

  if (!response.ok) {
    throw new Error('Failed to fetch knowledge')
  }

  return response.data?.knowledge || []
}

export async function updateKnowledge(id: string, updates: Partial<KnowledgeItem>) {
  const response = await request(`/api/knowledge/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })

  if (!response.ok) {
    throw new Error('Failed to update knowledge')
  }

  return response.data
}

export async function deleteKnowledge(id: string) {
  const response = await request(`/api/knowledge/${id}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error('Failed to delete knowledge')
  }

  return response.data
}

export async function fetchKnowledgeStats(catId?: string) {
  const params = new URLSearchParams()
  if (catId) params.append('catId', catId)

  const response = await request(`/api/knowledge/stats?${params.toString()}`)

  if (!response.ok) {
    throw new Error('Failed to fetch knowledge stats')
  }

  return response.data
}

// ==================== 主動洞察 API ====================

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
  createdAt: string
  expiresAt?: string
  dismissed: boolean
}

export async function fetchInsights(catId?: string) {
  const params = new URLSearchParams()
  if (catId) params.append('catId', catId)

  const response = await request(`/api/insights?${params.toString()}`)

  if (!response.ok) {
    throw new Error('Failed to fetch insights')
  }

  return response.data?.insights || []
}

export async function checkInsights(catId?: string) {
  const response = await request('/api/insights/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catId }),
  })

  if (!response.ok) {
    throw new Error('Failed to check insights')
  }

  return response.data
}

export async function dismissInsight(id: string) {
  const response = await request(`/api/insights/${id}/dismiss`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error('Failed to dismiss insight')
  }

  return response.data
}

export async function fetchPushStatusSummary(): Promise<PushStatusSummary> {
  const response = await getJson<PushStatusSummary>('/api/push/status')
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-fetch-push-status')
  }
  return response.data
}

export async function sendTestPushNotification(message?: string) {
  const payload = message && message.trim().length > 0 ? { message: message.trim() } : {}
  const response = await postJson('/api/push/test', payload)
  if (!response.ok) {
    throw new Error(response.message ?? 'push-test-failed')
  }
}

// ============================================
// 🐾 Pet Profiles API
// ============================================

export async function fetchPetProfiles(): Promise<PetProfile[]> {
  const response = await getJson<PetProfile[]>('/api/pet-profiles')
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-fetch-pet-profiles')
  }
  return response.data
}

export async function fetchPetProfile(id: string): Promise<PetProfile> {
  const response = await getJson<PetProfile>(`/api/pet-profiles/${id}`)
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-fetch-pet-profile')
  }
  return response.data
}

export async function createPetProfile(input: {
  type: PetType
  name: string
  customLabel?: string | null
  icon?: string | null
  temperatureRangeMin?: number
  temperatureRangeMax?: number
  humidityRangeMin?: number
  humidityRangeMax?: number
  waterTarget?: number
  feedingSchedule?: string
}): Promise<PetProfile> {
  const response = await postJson<PetProfile>('/api/pet-profiles', input)
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-create-pet-profile')
  }
  return response.data
}

export async function updatePetProfile(
  id: string,
  input: {
    name?: string
    customLabel?: string | null
    icon?: string | null
    temperatureRangeMin?: number
    temperatureRangeMax?: number
    humidityRangeMin?: number
    humidityRangeMax?: number
    waterTarget?: number
    feedingSchedule?: string
  },
): Promise<PetProfile> {
  const response = await putJson<PetProfile>(`/api/pet-profiles/${id}`, input)
  if (!response.ok || !response.data) {
    throw new Error(response.message ?? 'failed-to-update-pet-profile')
  }
  return response.data
}

export async function deletePetProfile(id: string): Promise<void> {
  const response = await deleteJson(`/api/pet-profiles/${id}`)
  if (!response.ok) {
    throw new Error(response.message ?? 'failed-to-delete-pet-profile')
  }
}
