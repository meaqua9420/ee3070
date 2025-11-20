import path from 'node:path'

interface NumericRange {
  min: number
  max: number
}

interface RetryConfig {
  attempts: number
  baseDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

interface RequestTimeoutConfig {
  requestMs: number
  overallMs: number
}

export interface ModelTierConfig {
  modelReference: string
  serverModel: string
  serverUrl: string
  apiKey: string | null
  maxTokens: number
  temperature: number
  topP: number
  topK: number
  minP: number
  presencePenalty: number
  enableThinking: boolean
  requestTimeoutMs: number
}

export interface VisionConfig {
  modelReference: string
  serverModel: string
  serverUrl: string
  apiKey: string
  allowScriptFallback: boolean
  scriptPath: string
  maxTokens: number
  temperature: number
  topP: number
  timeoutMs: number
  requestTimeoutMs: number
}

export interface AIConfig {
  debug: boolean
  baseUrl: string
  pythonExecutable: string
  scriptPath: string
  serverKey: string
  settingsLimits: Record<string, NumericRange>
  autoUpgrade: {
    allow: boolean
    minLength: number
  }
  standard: ModelTierConfig | null
  pro: ModelTierConfig | null
  retry: RetryConfig
  request: RequestTimeoutConfig
  vision: VisionConfig
  developer: {
    thinkingPromptEnabled: boolean
  }
}

function getEnv(key: string): string {
  const value = process.env[key]
  return typeof value === 'string' ? value.trim() : ''
}

function parseBooleanEnv(key: string, defaultValue: boolean): boolean {
  const raw = getEnv(key)
  if (!raw) return defaultValue
  if (['1', 'true', 'yes', 'on'].includes(raw.toLowerCase())) return true
  if (['0', 'false', 'no', 'off'].includes(raw.toLowerCase())) return false
  return defaultValue
}

function parseNumberEnv(key: string, defaultValue: number, options?: { min?: number; max?: number }): number {
  const raw = getEnv(key)
  const parsed = raw ? Number(raw) : Number.NaN
  if (!Number.isFinite(parsed)) return defaultValue
  let value = parsed
  if (typeof options?.min === 'number') value = Math.max(options.min, value)
  if (typeof options?.max === 'number') value = Math.min(options.max, value)
  return value
}

function parseIntegerEnv(key: string, defaultValue: number, options?: { min?: number; max?: number }): number {
  const raw = getEnv(key)
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (!Number.isFinite(parsed)) return defaultValue
  let value = parsed
  if (typeof options?.min === 'number') value = Math.max(options.min, value)
  if (typeof options?.max === 'number') value = Math.min(options.max, value)
  return value
}

const DEFAULT_CHAT_MODEL = 'NexaAI/Qwen3-4B-Thinking-2507-merged'
const DEFAULT_VISION_MODEL = 'NexaAI/Qwen3-VL-4B-Instruct-GGUF'
const DEFAULT_BASE_URL = 'http://127.0.0.1:18181'

function resolvePythonPath(input: string): string {
  const allowed = ['python', 'python3', 'python3.9', 'python3.10', 'python3.11', 'python3.12']
  if (!input) return 'python3'
  if (allowed.includes(input)) return input
  if (
    input.includes('python') &&
    !input.includes(';') &&
    !input.includes('&') &&
    !input.includes('|') &&
    !input.includes('`')
  ) {
    return input
  }
  console.warn(`[config] Suspicious Python path rejected: ${input}`)
  return 'python3'
}

function buildTierConfig(options: {
  modelReference: string
  serverModel: string
  serverUrl: string
  apiKey: string | null
  maxTokens: number
  temperature: number
  topP: number
  topK: number
  minP: number
  presencePenalty: number
  enableThinking: boolean
  requestTimeoutMs: number
}): ModelTierConfig {
  return { ...options }
}

export function loadAIConfig(): AIConfig {
  const defaultDebug = process.env.NODE_ENV !== 'production'
  const debug = parseBooleanEnv('SMART_CAT_AI_DEBUG', defaultDebug)

  const pythonExecutable = resolvePythonPath(getEnv('LOCAL_LLM_PYTHON') || 'python')
  const scriptPath = path.resolve(process.cwd(), 'scripts/local_llm_infer.py')

  const baseUrl = (getEnv('LOCAL_LLM_SERVER_URL') || DEFAULT_BASE_URL).replace(/\/$/, '')
  const serverKey = getEnv('LOCAL_LLM_SERVER_KEY')

  const enableThinking = parseBooleanEnv('LOCAL_LLM_ENABLE_THINKING', true)
  const standardModelReference = getEnv('LOCAL_LLM_MODEL_ID') || getEnv('LOCAL_LLM_MODEL_PATH') || DEFAULT_CHAT_MODEL
  const standardTier = standardModelReference
    ? buildTierConfig({
        modelReference: standardModelReference,
        serverModel: getEnv('LOCAL_LLM_SERVER_MODEL') || standardModelReference,
        serverUrl: baseUrl,
        apiKey: serverKey || null,
        maxTokens: parseIntegerEnv('LOCAL_LLM_MAX_TOKENS', 32_768, { min: 16, max: 81_920 }),
        temperature: parseNumberEnv('LOCAL_LLM_TEMPERATURE', enableThinking ? 0.6 : 0.7, { min: 0 }),
        topP: parseNumberEnv('LOCAL_LLM_TOP_P', enableThinking ? 0.95 : 0.9, { min: 0, max: 1 }),
        topK: parseIntegerEnv('LOCAL_LLM_TOP_K', enableThinking ? 20 : 0, { min: 0 }),
        minP: parseNumberEnv('LOCAL_LLM_MIN_P', enableThinking ? 0 : 0, { min: 0 }),
        presencePenalty: parseNumberEnv('LOCAL_LLM_PRESENCE_PENALTY', 0, { min: 0, max: 2 }),
        enableThinking,
        requestTimeoutMs: parseIntegerEnv('LOCAL_LLM_REQUEST_TIMEOUT_MS', 45_000, { min: 0 }),
      })
    : null

  const proModelEnv = getEnv('LOCAL_LLM_PRO_MODEL_ID') || getEnv('LOCAL_LLM_PRO_MODEL_PATH')
  const proModelDefault = getEnv('LOCAL_LLM_PRO_MODEL_DEFAULT') || 'gpt-oss-20b-GGUF'
  const normalizedProReference = (() => {
    const candidate = proModelEnv || proModelDefault
    if (!candidate) return ''
    if (['disabled', 'disable', 'none'].includes(candidate.toLowerCase())) return ''
    return candidate
  })()
  const normalizedProServerModel = (() => {
    const raw = getEnv('LOCAL_LLM_PRO_SERVER_MODEL')
    if (!raw) return normalizedProReference
    if (['disabled', 'disable', 'none'].includes(raw.toLowerCase())) return normalizedProReference
    return raw
  })()

  const proBaseUrl =
    (getEnv('LOCAL_LLM_PRO_SERVER_URL') || baseUrl).trim().replace(/\/$/, '') || baseUrl
  const proServerKey = getEnv('LOCAL_LLM_PRO_SERVER_KEY') || serverKey

  const proTier = normalizedProReference
    ? buildTierConfig({
        modelReference: normalizedProReference,
        serverModel: normalizedProServerModel || normalizedProReference,
        serverUrl: proBaseUrl,
        apiKey: proServerKey || null,
        maxTokens: parseIntegerEnv('LOCAL_LLM_PRO_MAX_TOKENS', Math.max(parseIntegerEnv('LOCAL_LLM_MAX_TOKENS', 160, { min: 16, max: 10000 }), 240), {
          min: 32,
          max: 10000,
        }),
        temperature: parseNumberEnv('LOCAL_LLM_PRO_TEMPERATURE', 1.0, { min: 0 }),
        topP: parseNumberEnv('LOCAL_LLM_PRO_TOP_P', 1.0, {
          min: 0,
          max: 1,
        }),
        topK: parseIntegerEnv('LOCAL_LLM_PRO_TOP_K', parseIntegerEnv('LOCAL_LLM_TOP_K', enableThinking ? 20 : 0, { min: 0 }), {
          min: 0,
        }),
        minP: parseNumberEnv('LOCAL_LLM_PRO_MIN_P', parseNumberEnv('LOCAL_LLM_MIN_P', enableThinking ? 0 : 0, { min: 0 }), {
          min: 0,
        }),
        presencePenalty: parseNumberEnv('LOCAL_LLM_PRO_PRESENCE_PENALTY', parseNumberEnv('LOCAL_LLM_PRESENCE_PENALTY', 0, { min: 0, max: 2 }), {
          min: 0,
          max: 2,
        }),
        enableThinking: parseBooleanEnv('LOCAL_LLM_PRO_ENABLE_THINKING', enableThinking),
        requestTimeoutMs: parseIntegerEnv('LOCAL_LLM_PRO_REQUEST_TIMEOUT_MS', Math.max(parseIntegerEnv('LOCAL_LLM_REQUEST_TIMEOUT_MS', 45_000, { min: 0 }), 90_000), {
          min: 0,
        }),
      })
    : null

  const retry: RetryConfig = {
    attempts: parseIntegerEnv('LOCAL_LLM_SERVER_RETRY_ATTEMPTS', 1, { min: 0, max: 5 }),
    baseDelayMs: parseIntegerEnv('LOCAL_LLM_SERVER_RETRY_DELAY_MS', 1_200, { min: 200, max: 60_000 }),
    maxDelayMs: parseIntegerEnv('LOCAL_LLM_SERVER_RETRY_DELAY_MAX_MS', 8_000, { min: 200, max: 120_000 }),
    backoffMultiplier: parseNumberEnv('LOCAL_LLM_SERVER_RETRY_BACKOFF', 1.8, { min: 1, max: 4 }),
  }

  const request: RequestTimeoutConfig = {
    requestMs: parseIntegerEnv('LOCAL_LLM_REQUEST_TIMEOUT_MS', 45_000, { min: 0 }),
    overallMs: parseIntegerEnv('LOCAL_LLM_TIMEOUT_MS', 120_000, { min: 0, max: 600_000 }),
  }

  const autoUpgrade = {
    allow: parseBooleanEnv('LOCAL_LLM_ALLOW_AUTO_UPGRADE', true),
    minLength: parseIntegerEnv('LOCAL_LLM_AUTO_UPGRADE_MIN_LENGTH', 260, { min: 0, max: 800 }),
  }

  const settingsLimits: Record<string, NumericRange> = {
    targetTemperatureC: { min: 16, max: 36 },
    targetHumidityPercent: { min: 30, max: 70 },
    waterBowlLevelTargetMl: { min: 100, max: 600 },
  }

  const visionScriptPath = path.resolve(process.cwd(), 'scripts/analyze_image_qwen.py')
  const visionBaseUrl = (getEnv('LOCAL_VISION_SERVER_URL') || baseUrl).replace(/\/$/, '')
  const visionConfig: VisionConfig = {
    modelReference: getEnv('LOCAL_VISION_MODEL_ID') || getEnv('LOCAL_VISION_MODEL_PATH') || DEFAULT_VISION_MODEL,
    serverModel: getEnv('LOCAL_VISION_SERVER_MODEL') || getEnv('LOCAL_VISION_MODEL_ID') || getEnv('LOCAL_VISION_MODEL_PATH') || DEFAULT_VISION_MODEL,
    serverUrl: visionBaseUrl,
    apiKey: getEnv('LOCAL_VISION_SERVER_KEY') || serverKey,
    allowScriptFallback: parseBooleanEnv('LOCAL_VISION_ALLOW_SCRIPT_FALLBACK', true),
    scriptPath: visionScriptPath,
    maxTokens: parseIntegerEnv('LOCAL_VISION_MAX_TOKENS', 1024, { min: 16, max: 10000 }),
    temperature: parseNumberEnv('LOCAL_VISION_TEMPERATURE', 0.6, { min: 0 }),
    topP: parseNumberEnv('LOCAL_VISION_TOP_P', 0.9, { min: 0, max: 1 }),
    timeoutMs: parseIntegerEnv('LOCAL_VISION_TIMEOUT_MS', request.overallMs, { min: 0, max: 600_000 }),
    requestTimeoutMs: parseIntegerEnv('LOCAL_VISION_REQUEST_TIMEOUT_MS', Math.min(request.overallMs, 120_000), {
      min: 0,
    }),
  }

  const developerConfig = {
    thinkingPromptEnabled: parseBooleanEnv('SMART_CAT_DEV_FORCE_THINKING', false),
  }

  return {
    debug,
    baseUrl,
    pythonExecutable,
    scriptPath,
    serverKey,
    settingsLimits,
    autoUpgrade,
    standard: standardTier,
    pro: proTier,
    retry,
    request,
    vision: visionConfig,
    developer: developerConfig,
  }
}

export const aiConfig = loadAIConfig()
