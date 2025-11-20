export type LanguageCode = 'zh' | 'en'

export interface SmartHomeReading {
  temperatureC: number
  humidityPercent: number
  waterIntakeMl: number
  airQualityIndex: number
  catWeightKg: number
  lastFeedingMinutesAgo: number
  timestamp: string
  waterLevelPercent?: number | undefined
  ambientLightPercent?: number | undefined
  catPresent?: boolean | undefined
  foodWeightGrams?: number | undefined
  audio?: AudioStatus | undefined
  vision?: VisionStatus | undefined
  uvFan?: UvFanStatus | undefined
  feeder?: FeederStatus | undefined
  hydration?: HydrationStatus | undefined
}

export interface AudioStatus {
  amplifierOnline: boolean
  muted: boolean
  volumePercent: number
  activePattern: string
  playing: boolean
  lastPattern?: string | null | undefined
  lastTriggeredAtMs?: number | undefined
}

export interface UvFanStatus {
  uvOn: boolean
  fanOn: boolean
  autoMode: boolean
  cleaningActive: boolean
  cleaningDurationMs?: number | null | undefined
  cleaningRemainingMs?: number | null | undefined
  lastRunUnix?: number | null | undefined
  lastRunIso?: string | null | undefined
  nextAutoUnix?: number | null | undefined
  nextAutoIso?: string | null | undefined
  nextAutoInMs?: number | null | undefined
}

export type VisionInferenceSource = 'event' | 'poll' | 'telemetry'

export interface VisionInference {
  modelId: string
  updatedAt: string
  catDetected: boolean
  probability: number
  mean?: number | undefined
  stdDev?: number | undefined
  edgeDensity?: number | undefined
  source?: VisionInferenceSource | undefined
}

export interface VisionStatus {
  cameraOnline: boolean
  deviceId?: string | undefined
  snapshotUrl?: string | undefined
  streamUrl?: string | undefined
  lastHeartbeatAt?: string | undefined
  lastEventAt?: string | undefined
  lastError?: string | null | undefined
  inference?: VisionInference | null | undefined
}

export interface FeederScheduleSlot {
  hour: number
  minute: number
  completed: boolean
}

export interface FeederStatus {
  feedingActive: boolean
  calibrationMode: boolean
  targetWeightGrams: number
  minWeightGrams: number
  gateOpen: boolean
  manualButtonLatched?: boolean | undefined
  lastStartUnix?: number | undefined
  schedule?: FeederScheduleSlot[] | undefined
}

export interface HydrationStatus {
  sensorRaw: number
  pumpActive: boolean
  manualOverride: boolean
  threshold: number
  hasPumpedMorning?: boolean | undefined
  hasPumpedNoon?: boolean | undefined
  hasPumpedAfternoon?: boolean | undefined
  hasPumpedEvening?: boolean | undefined
  lastRefillMs?: number | undefined
  lastRefillUnix?: number | undefined
}

export interface CalibrationProfile {
  fsrZero?: number
  fsrScale?: number
  waterLevelFullCm?: number
  waterLevelEmptyCm?: number
  ldrDark?: number
  ldrBright?: number
  catPresenceThresholdKg?: number
  updatedAt?: string
}

export interface AutomationAlert {
  timestamp: string
  message: string
  severity: 'info' | 'warning' | 'critical'
  messageKey?: string | undefined
  messageVariables?: Record<string, string | number | boolean> | undefined
}

export type AlertMessageKey =
  | 'waterLevelCritical'
  | 'waterLevelLow'
  | 'brightnessLow'
  | 'brightnessHigh'
  | 'catLeft'
  | 'catAwayTooLong'

export interface SmartHomeSettings {
  autoMode: boolean
  targetTemperatureC: number
  targetHumidityPercent: number
  waterBowlLevelTargetMl: number
  feederSchedule: string
  purifierIntensity: 'low' | 'medium' | 'high'
}

export interface DeviceStatus {
  heaterOn: boolean
  humidifierOn: boolean
  waterPumpOn: boolean
  feederActive: boolean
  purifierOn: boolean
}

export interface SmartHomeSnapshot {
  catId?: string
  reading: SmartHomeReading
  settings: SmartHomeSettings
  status: DeviceStatus
}

export interface CatProfile {
  id: string
  name: string
  avatarUrl?: string | null
  breed?: string | null
  birthdate?: string | null
  weightKg?: number | null
  notes?: string | null
  tags?: string[] | null
  createdAt: string
  updatedAt: string
}

export interface EquipmentTestResponse {
  id: string
  success: boolean
  latencyMs: number
  messageKey?: string
}

export type ChatTool =
  | 'updateSettings'
  | 'updateCalibration'
  | 'analyzeImage'
  | 'analyzeDocument'
  | 'saveMemory'
  | 'createCareTask'
  | 'switchToProModel'
  | 'searchWeb'
  | 'mcp.browser.search'
  | 'playAudioPattern'
  | 'stopAudioPlayback'
  | 'refreshCameraStatus'
  | 'hardwareControl'

export interface ChatToolCall {
  tool: ChatTool
  args: unknown
}

export type LoadingPhase =
  | 'idle'
  | 'analyzing'
  | 'retrieving_memory'
  | 'searching_knowledge'
  | 'generating'
  | 'executing_tool'
  | 'complete'

export interface ProgressUpdate {
  phase: LoadingPhase
  message?: string
}

export interface ToolExecutionLog {
  tool: ChatTool
  success: boolean
  message: string
  args?: unknown
  durationMs?: number | undefined
  output?: string | undefined
  errorCode?: string | undefined
}

export type MemoryType = 'note' | 'conversation' | 'setting'

export interface MemoryEntry {
  id: number
  type: MemoryType
  content: string
  source: string
  createdAt: string
}

export interface NotificationFixLog {
  id: string
  step: 'permission' | 'serviceWorker' | 'subscription' | 'backend'
  success: boolean
  message?: string | undefined
  timestamp: string
}

export interface AlertRule {
  id: number
  metric: 'temperatureC' | 'humidityPercent' | 'waterLevelPercent' | 'ambientLightPercent' | 'waterIntakeMl' | 'airQualityIndex' | 'catWeightKg' | 'lastFeedingMinutesAgo'
  comparison: 'above' | 'below'
  threshold: number
  severity: 'info' | 'warning' | 'critical'
  message?: string | undefined
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ChatFavorite {
  id: number
  messageId?: string | null
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: Record<string, unknown> | undefined
  createdAt: string
}

export type CareVitalStatus = 'optimal' | 'watch' | 'critical'
export type CareVitalTrend = 'up' | 'down' | 'stable' | 'unknown'
export type CareActionUrgency = 'low' | 'moderate' | 'high'

export interface ProfessionalCareVital {
  id: string
  label: string
  value: string
  status: CareVitalStatus
  details?: string
  trend?: CareVitalTrend
  recommendations?: string[]
}

export interface ProfessionalCareAction {
  id: string
  title: string
  description: string
  urgency: CareActionUrgency
}

export interface ProfessionalCareReport {
  generatedAt: string
  headline: string
  summary: string
  riskLevel: 'low' | 'medium' | 'high'
  vitals: ProfessionalCareVital[]
  trendHighlights: string[]
  actionItems: ProfessionalCareAction[]
  followUps: ProfessionalCareAction[]
  notes?: string[]
  metadata: {
    historyWindowHours: number
    sampleCount: number
  }
}

export interface TextToSpeechResponsePayload {
  audioBase64: string
  format: 'audio/wav' | 'audio/mpeg'
  sampleRate: number
  durationSeconds: number
  voiceId?: string
  playbackRate?: number
}

export type CareInsightSeverity = 'info' | 'warning' | 'critical'

export type CareInsightCategory =
  | 'environment'
  | 'hydration'
  | 'nutrition'
  | 'behavior'
  | 'wellness'
  | 'safety'
  | 'maintenance'

export interface CareInsightEvidence {
  metric: string
  current: number | string
  baseline?: number | string | undefined
  unit?: string | undefined
  note?: string | undefined
}

export interface CareInsight {
  id: string
  title: string
  summary: string
  severity: CareInsightSeverity
  category: CareInsightCategory
  recommendations: string[]
  evidence: CareInsightEvidence[]
  createdAt: string
  followUpTask?: CareTaskSuggestion | undefined
}

export type BehaviorConfidence = 'low' | 'medium' | 'high'

export interface BehaviorForecastSegment {
  id: string
  period: 'morning' | 'afternoon' | 'evening' | 'overnight'
  label: string
  focus: string
  confidence: BehaviorConfidence
  tips: string[]
  metricHighlights?: string[]
}

export interface BehaviorForecast {
  generatedAt: string
  confidence: BehaviorConfidence
  summary: string
  segments: BehaviorForecastSegment[]
  anomalies: string[]
  recommendations: string[]
}

export interface BehaviorProfilePeriodSummary {
  period: BehaviorForecastSegment['period']
  presencePercent: number | null
  hydrationMl: number | null
  sampleCount: number
  averageStartHour: number | null
  averageEndHour: number | null
}

export type BehaviorTrendDirection = 'rising' | 'falling' | 'stable'

export interface BehaviorProfile {
  catId: string
  windowHours: number
  sampleCount: number
  updatedAt: string
  confidence: BehaviorConfidence
  presencePercent: number | null
  longestHomeMinutes: number | null
  longestAwayMinutes: number | null
  hydrationAverageMl: number | null
  hydrationTrend: BehaviorTrendDirection
  hydrationChangeMl: number | null
  peakPeriods: BehaviorProfilePeriodSummary[]
  quietHours: Array<{ startHour: number; endHour: number }>
  activityNotes: {
    zh: string[]
    en: string[]
  }
  careRecommendations: {
    zh: string[]
    en: string[]
  }
}

export interface DashboardLayoutPreference {
  hiddenPanels: string[]
  panelOrder: string[]
  updatedAt: string
}

export interface DashboardLayoutUpdate {
  hiddenPanels?: string[]
  panelOrder?: string[]
}

export type CareTaskStatus = 'pending' | 'completed' | 'dismissed'

export interface CareTask {
  id: number
  title: string
  description: string
  category: CareInsightCategory | 'general'
  status: CareTaskStatus
  createdAt: string
  dueAt?: string | null
  completedAt?: string | null
  source: 'ai' | 'system' | 'user'
  metadata?: Record<string, unknown> | undefined
}

export interface CareTaskSuggestion {
  title: string
  description: string
  category: CareInsightCategory | 'general'
  metadata?: Record<string, unknown> | undefined
  dueAt?: string | null | undefined
  urgency?: 'low' | 'medium' | 'high' | undefined
}

export interface CarePlugin {
  id: number
  name: string
  description?: string | undefined
  capabilities: string[]
  apiBaseUrl?: string | null | undefined
  enabled: boolean
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown> | undefined
}

export interface KnowledgeArticle {
  id: string
  tags: string[]
  locale: LanguageCode | 'any'
  title: string
  summary: string
  body: string
  sources?: string[]
  updatedAt: string
}

/**
 * 标准的Result类型，用于错误处理
 * Standard Result type for error handling
 *
 * @example
 * // 成功的情况
 * const result: Result<User, 'UserNotFound'> = { ok: true, value: user }
 *
 * // 失败的情况
 * const result: Result<User, 'UserNotFound'> = { ok: false, error: 'UserNotFound', message: '用户不存在' }
 */
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E; message: string }

/**
 * API响应的标准格式
 * Standard API response format
 */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
  timestamp: string
}

/**
 * 聊天请求的验证数据
 * Validated chat request data
 */
export interface ValidatedChatRequest {
  message: string
  temperature: number
  attachments?: string[] | undefined
  sessionId?: string | undefined
}

/**
 * 设置更新的验证数据
 * Validated settings update data
 */
export interface ValidatedSettingsUpdate {
  autoMode?: boolean
  targetTemperatureC?: number
  targetHumidityPercent?: number
  waterBowlLevelTargetMl?: number
  feederSchedule?: string
  purifierIntensity?: 'low' | 'medium' | 'high'
}
