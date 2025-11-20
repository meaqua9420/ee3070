/**
 * 输入验证和错误处理工具
 * Input validation and error handling utilities
 *
 * 使用 Result 类型来处理成功和失败的情况
 * Uses Result type to handle both success and failure cases
 */

import type { Result, ValidatedChatRequest, ValidatedSettingsUpdate, SmartHomeSettings } from './types'

/**
 * 验证常量 / Validation Constants
 * 定义各类输入的最大长度限制，用于防止数据库溢出和潜在的 DoS 攻击
 * Defines maximum length limits for various inputs to prevent database overflow and potential DoS attacks
 */
export const VALIDATION_LIMITS = {
  /** 最大消息长度 / Maximum message length */
  MAX_MESSAGE_LENGTH: 5000,
  /** 最大内容长度 (用于记忆、任务描述等) / Maximum content length (for memories, task descriptions, etc.) */
  MAX_CONTENT_LENGTH: 10000,
  /** 最大标题长度 / Maximum title length */
  MAX_TITLE_LENGTH: 500,
  /** 最大短文本长度 (用于名称、标签等) / Maximum short text length (for names, labels, etc.) */
  MAX_SHORT_TEXT_LENGTH: 200,
  /** 最大 URL 长度 / Maximum URL length */
  MAX_URL_LENGTH: 2048,
  /** 最大查询字符串长度 / Maximum query string length */
  MAX_QUERY_LENGTH: 500,
  /** 最大图片大小 (字节) / Maximum image size (bytes) - 5MB */
  MAX_IMAGE_SIZE_BYTES: 5 * 1024 * 1024,
  /** 最大图片宽度 (像素) / Maximum image width (pixels) */
  MAX_IMAGE_WIDTH: 4096,
  /** 最大图片高度 (像素) / Maximum image height (pixels) */
  MAX_IMAGE_HEIGHT: 4096,
} as const

/**
 * 允许的图片 MIME 类型白名单 / Allowed image MIME types whitelist
 * 仅允许常见的图片格式，防止上传恶意文件
 * Only allow common image formats to prevent malicious file uploads
 */
export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
])

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

/**
 * HTML 标签正则表达式 / HTML tag regex pattern
 * 用于检测和清理潜在的 XSS 攻击向量
 * Used to detect and clean potential XSS attack vectors
 */
const HTML_TAG_PATTERN = /<[^>]*>/g

/**
 * URL 验证正则表达式 / URL validation regex
 * 严格的 HTTP/HTTPS URL 格式验证
 * Strict HTTP/HTTPS URL format validation
 */
const URL_PATTERN = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/

/**
 * 验证聊天请求
 * Validates chat request data
 *
 * @param data - 原始请求数据 / Raw request data
 * @returns Result 包含验证后的数据或错误信息
 *
 * @example
 * const result = validateChatRequest(req.body)
 * if (!result.ok) {
 *   return res.status(400).json({ error: result.message })
 * }
 * // result.value 现在是类型安全的
 */
export function validateChatRequest(data: unknown): Result<ValidatedChatRequest> {
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      error: 'INVALID_TYPE',
      message: '请求必须是一个对象 / Request must be an object',
    }
  }

  const raw = data as Record<string, unknown>

  // 验证消息字段
  if (typeof raw.message !== 'string') {
    return {
      ok: false,
      error: 'INVALID_MESSAGE',
      message: '消息必须是字符串 / Message must be a string',
    }
  }

  const message = raw.message.trim()
  if (message.length === 0) {
    return {
      ok: false,
      error: 'EMPTY_MESSAGE',
      message: '消息不能为空 / Message cannot be empty',
    }
  }

  if (message.length > VALIDATION_LIMITS.MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: 'MESSAGE_TOO_LONG',
      message: `消息不能超过 ${VALIDATION_LIMITS.MAX_MESSAGE_LENGTH} 个字符 / Message cannot exceed ${VALIDATION_LIMITS.MAX_MESSAGE_LENGTH} characters`,
    }
  }

  // 验证温度参数
  let temperature = 0.7 // 默认值 / Default value
  if (raw.temperature !== undefined) {
    if (typeof raw.temperature !== 'number') {
      return {
        ok: false,
        error: 'INVALID_TEMPERATURE',
        message: '温度必须是数字 / Temperature must be a number',
      }
    }

    if (raw.temperature < 0 || raw.temperature > 2) {
      return {
        ok: false,
        error: 'TEMPERATURE_OUT_OF_RANGE',
        message: '温度必须在 0 到 2 之间 / Temperature must be between 0 and 2',
      }
    }

    temperature = raw.temperature
  }

  // 验证附件 (可选)
  let attachments: string[] | undefined
  if (raw.attachments !== undefined) {
    if (!Array.isArray(raw.attachments)) {
      return {
        ok: false,
        error: 'INVALID_ATTACHMENTS',
        message: '附件必须是数组 / Attachments must be an array',
      }
    }

    attachments = raw.attachments.map((item) => {
      if (typeof item !== 'string') {
        throw new Error('每个附件必须是字符串 / Each attachment must be a string')
      }
      return item
    })
  }

  return {
    ok: true,
    value: {
      message,
      temperature,
      attachments,
      sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : undefined,
    },
  }
}

/**
 * 验证设置更新请求
 * Validates settings update request
 *
 * @param data - 原始请求数据 / Raw request data
 * @returns Result 包含验证后的数据或错误信息
 */
export function validateSettingsUpdate(data: unknown): Result<ValidatedSettingsUpdate> {
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      error: 'INVALID_TYPE',
      message: '请求必须是一个对象 / Request must be an object',
    }
  }

  const raw = data as Record<string, unknown>
  const update: ValidatedSettingsUpdate = {}

  // 验证 autoMode
  if (raw.autoMode !== undefined) {
    if (typeof raw.autoMode !== 'boolean') {
      return {
        ok: false,
        error: 'INVALID_AUTO_MODE',
        message: 'autoMode 必须是布尔值 / autoMode must be a boolean',
      }
    }
    update.autoMode = raw.autoMode
  }

  // 验证目标温度
  if (raw.targetTemperatureC !== undefined) {
    if (typeof raw.targetTemperatureC !== 'number') {
      return {
        ok: false,
        error: 'INVALID_TEMPERATURE',
        message: 'targetTemperatureC 必须是数字 / targetTemperatureC must be a number',
      }
    }

    if (raw.targetTemperatureC < 15 || raw.targetTemperatureC > 35) {
      return {
        ok: false,
        error: 'TEMPERATURE_OUT_OF_RANGE',
        message: '目标温度必须在 15-35°C 之间 / Target temperature must be between 15-35°C',
      }
    }

    update.targetTemperatureC = raw.targetTemperatureC
  }

  // 验证目标湿度
  if (raw.targetHumidityPercent !== undefined) {
    if (typeof raw.targetHumidityPercent !== 'number') {
      return {
        ok: false,
        error: 'INVALID_HUMIDITY',
        message: 'targetHumidityPercent 必须是数字 / targetHumidityPercent must be a number',
      }
    }

    if (raw.targetHumidityPercent < 30 || raw.targetHumidityPercent > 80) {
      return {
        ok: false,
        error: 'HUMIDITY_OUT_OF_RANGE',
        message: '目标湿度必须在 30-80% 之间 / Target humidity must be between 30-80%',
      }
    }

    update.targetHumidityPercent = raw.targetHumidityPercent
  }

  // 验证水碗目标
  if (raw.waterBowlLevelTargetMl !== undefined) {
    if (typeof raw.waterBowlLevelTargetMl !== 'number') {
      return {
        ok: false,
        error: 'INVALID_WATER_LEVEL',
        message: 'waterBowlLevelTargetMl 必须是数字 / waterBowlLevelTargetMl must be a number',
      }
    }

    if (raw.waterBowlLevelTargetMl < 100 || raw.waterBowlLevelTargetMl > 1000) {
      return {
        ok: false,
        error: 'WATER_LEVEL_OUT_OF_RANGE',
        message: '水碗目标必须在 100-1000ml 之间 / Water level target must be between 100-1000ml',
      }
    }

    update.waterBowlLevelTargetMl = raw.waterBowlLevelTargetMl
  }

  // 验证喂食计划
  if (raw.feederSchedule !== undefined) {
    if (typeof raw.feederSchedule !== 'string') {
      return {
        ok: false,
        error: 'INVALID_FEEDER_SCHEDULE',
        message: 'feederSchedule 必须是字符串 / feederSchedule must be a string',
      }
    }
    update.feederSchedule = raw.feederSchedule
  }

  // 验证空气净化强度
  if (raw.purifierIntensity !== undefined) {
    const validIntensities = ['low', 'medium', 'high']
    if (!validIntensities.includes(raw.purifierIntensity as string)) {
      return {
        ok: false,
        error: 'INVALID_PURIFIER_INTENSITY',
        message: 'purifierIntensity 必须是 low, medium 或 high / purifierIntensity must be low, medium or high',
      }
    }
    update.purifierIntensity = raw.purifierIntensity as 'low' | 'medium' | 'high'
  }

  return {
    ok: true,
    value: update,
  }
}

/**
 * 验证校准配置文件更新
 * Validates calibration profile update
 *
 * @param data - 原始请求数据 / Raw request data
 * @returns Result 包含验证后的数据或错误信息
 */
export function validateCalibrationUpdate(
  data: unknown,
): Result<Record<string, number | string | undefined>> {
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      error: 'INVALID_TYPE',
      message: '请求必须是一个对象 / Request must be an object',
    }
  }

  const raw = data as Record<string, unknown>
  const allowedKeys = [
    'fsrZero',
    'fsrScale',
    'waterLevelFullCm',
    'waterLevelEmptyCm',
    'ldrDark',
    'ldrBright',
    'catPresenceThresholdKg',
  ]

  const update: Record<string, number | string | undefined> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (!allowedKeys.includes(key)) {
      return {
        ok: false,
        error: 'INVALID_FIELD',
        message: `未知的字段: ${key} / Unknown field: ${key}`,
      }
    }

    if (typeof value === 'number' || typeof value === 'string' || value === null) {
      update[key] = value ?? undefined
    } else {
      return {
        ok: false,
        error: 'INVALID_VALUE_TYPE',
        message: `字段 ${key} 的值无效 / Invalid value for field ${key}`,
      }
    }
  }

  return {
    ok: true,
    value: update,
  }
}

/**
 * 清理字符串，移除 HTML 标签和多余空白
 * Sanitizes string by removing HTML tags and extra whitespace
 *
 * @param input - 输入字符串 / Input string
 * @returns 清理后的字符串 / Sanitized string
 *
 * @example
 * sanitizeString('<script>alert("xss")</script>Hello') // Returns: 'Hello'
 * sanitizeString('  Multiple   spaces  ') // Returns: 'Multiple spaces'
 */
export function sanitizeString(input: string): string {
  return input
    .replace(HTML_TAG_PATTERN, '') // Remove HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
}

/**
 * 验证 URL 格式
 * Validates URL format
 *
 * @param url - URL 字符串 / URL string
 * @returns 验证结果 / Validation result
 */
export function validateUrl(url: string): Result<string> {
  if (typeof url !== 'string') {
    return {
      ok: false,
      error: 'INVALID_TYPE',
      message: 'URL 必须是字符串 / URL must be a string',
    }
  }

  const trimmed = url.trim()

  if (trimmed.length === 0) {
    return {
      ok: false,
      error: 'EMPTY_URL',
      message: 'URL 不能为空 / URL cannot be empty',
    }
  }

  if (trimmed.length > VALIDATION_LIMITS.MAX_URL_LENGTH) {
    return {
      ok: false,
      error: 'URL_TOO_LONG',
      message: `URL 不能超过 ${VALIDATION_LIMITS.MAX_URL_LENGTH} 个字符 / URL cannot exceed ${VALIDATION_LIMITS.MAX_URL_LENGTH} characters`,
    }
  }

  if (!URL_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error: 'INVALID_URL_FORMAT',
      message: 'URL 格式无效，必须以 http:// 或 https:// 开头 / Invalid URL format, must start with http:// or https://',
    }
  }

  return {
    ok: true,
    value: trimmed,
  }
}

/**
 * 验证警报规则
 * Validates alert rule data
 *
 * @param data - 原始请求数据 / Raw request data
 * @returns 验证结果 / Validation result
 */
export function validateAlertRule(data: unknown): Result<{
  metric: string
  comparison: string
  threshold: number
  severity: string
  message?: string
}> {
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      error: 'INVALID_TYPE',
      message: '请求必须是一个对象 / Request must be an object',
    }
  }

  const raw = data as Record<string, unknown>

  // Validate metric
  if (typeof raw.metric !== 'string' || raw.metric.trim().length === 0) {
    return {
      ok: false,
      error: 'INVALID_METRIC',
      message: 'metric 必须是非空字符串 / metric must be a non-empty string',
    }
  }

  // Validate comparison
  const validComparisons = ['>', '<', '>=', '<=', '==', '!=']
  if (!validComparisons.includes(raw.comparison as string)) {
    return {
      ok: false,
      error: 'INVALID_COMPARISON',
      message: 'comparison 必须是有效的比较运算符 / comparison must be a valid operator',
    }
  }

  // Validate threshold
  if (typeof raw.threshold !== 'number' || isNaN(raw.threshold)) {
    return {
      ok: false,
      error: 'INVALID_THRESHOLD',
      message: 'threshold 必须是数字 / threshold must be a number',
    }
  }

  // Validate severity
  const validSeverities = ['info', 'warning', 'critical']
  if (!validSeverities.includes(raw.severity as string)) {
    return {
      ok: false,
      error: 'INVALID_SEVERITY',
      message: 'severity 必须是 info, warning 或 critical / severity must be info, warning or critical',
    }
  }

  // Validate message (optional)
  let message: string | undefined
  if (raw.message !== undefined) {
    if (typeof raw.message !== 'string') {
      return {
        ok: false,
        error: 'INVALID_MESSAGE',
        message: 'message 必须是字符串 / message must be a string',
      }
    }

    const sanitized = sanitizeString(raw.message)
    if (sanitized.length > VALIDATION_LIMITS.MAX_TITLE_LENGTH) {
      return {
        ok: false,
        error: 'MESSAGE_TOO_LONG',
        message: `警报消息不能超过 ${VALIDATION_LIMITS.MAX_TITLE_LENGTH} 个字符 / Alert message cannot exceed ${VALIDATION_LIMITS.MAX_TITLE_LENGTH} characters`,
      }
    }

    message = sanitized
  }

  const value: {
    metric: string
    comparison: string
    threshold: number
    severity: string
    message?: string
  } = {
    metric: raw.metric.trim(),
    comparison: raw.comparison as string,
    threshold: raw.threshold,
    severity: raw.severity as string,
  }
  if (message) {
    value.message = message
  }

  return {
    ok: true,
    value,
  }
}

/**
 * 验证记忆数据
 * Validates memory data
 *
 * @param data - 原始请求数据 / Raw request data
 * @returns 验证结果 / Validation result
 */
export function validateMemory(data: unknown): Result<{
  type: string
  content: string
  source: string
}> {
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      error: 'INVALID_TYPE',
      message: '请求必须是一个对象 / Request must be an object',
    }
  }

  const raw = data as Record<string, unknown>

  // Validate type
  const validTypes = ['note', 'conversation', 'setting']
  if (!validTypes.includes(raw.type as string)) {
    return {
      ok: false,
      error: 'INVALID_MEMORY_TYPE',
      message: 'type 必须是 note, conversation 或 setting / type must be note, conversation or setting',
    }
  }

  // Validate content
  if (typeof raw.content !== 'string') {
    return {
      ok: false,
      error: 'INVALID_CONTENT',
      message: 'content 必须是字符串 / content must be a string',
    }
  }

  const sanitized = sanitizeString(raw.content)
  if (sanitized.length === 0) {
    return {
      ok: false,
      error: 'EMPTY_CONTENT',
      message: 'content 不能为空 / content cannot be empty',
    }
  }

  if (sanitized.length > VALIDATION_LIMITS.MAX_CONTENT_LENGTH) {
    return {
      ok: false,
      error: 'CONTENT_TOO_LONG',
      message: `内容不能超过 ${VALIDATION_LIMITS.MAX_CONTENT_LENGTH} 个字符 / Content cannot exceed ${VALIDATION_LIMITS.MAX_CONTENT_LENGTH} characters`,
    }
  }

  // Validate source (whitelist)
  const validSources = ['user', 'ai', 'system', 'automation']
  const source = typeof raw.source === 'string' && validSources.includes(raw.source)
    ? raw.source
    : 'user'

  return {
    ok: true,
    value: {
      type: raw.type as string,
      content: sanitized,
      source,
    },
  }
}

/**
 * 验证任务数据
 * Validates task data
 *
 * @param data - 原始请求数据 / Raw request data
 * @returns 验证结果 / Validation result
 */
export function validateTask(data: unknown): Result<{
  title: string
  description?: string
  category: string
  dueDate?: string
}> {
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      error: 'INVALID_TYPE',
      message: '请求必须是一个对象 / Request must be an object',
    }
  }

  const raw = data as Record<string, unknown>

  // Validate title
  if (typeof raw.title !== 'string') {
    return {
      ok: false,
      error: 'INVALID_TITLE',
      message: 'title 必须是字符串 / title must be a string',
    }
  }

  const title = sanitizeString(raw.title)
  if (title.length === 0) {
    return {
      ok: false,
      error: 'EMPTY_TITLE',
      message: 'title 不能为空 / title cannot be empty',
    }
  }

  if (title.length > VALIDATION_LIMITS.MAX_TITLE_LENGTH) {
    return {
      ok: false,
      error: 'TITLE_TOO_LONG',
      message: `标题不能超过 ${VALIDATION_LIMITS.MAX_TITLE_LENGTH} 个字符 / Title cannot exceed ${VALIDATION_LIMITS.MAX_TITLE_LENGTH} characters`,
    }
  }

  // Validate description (optional)
  let description: string | undefined
  if (raw.description !== undefined) {
    if (typeof raw.description !== 'string') {
      return {
        ok: false,
        error: 'INVALID_DESCRIPTION',
        message: 'description 必须是字符串 / description must be a string',
      }
    }

    const sanitized = sanitizeString(raw.description)
    if (sanitized.length > VALIDATION_LIMITS.MAX_CONTENT_LENGTH) {
      return {
        ok: false,
        error: 'DESCRIPTION_TOO_LONG',
        message: `描述不能超过 ${VALIDATION_LIMITS.MAX_CONTENT_LENGTH} 个字符 / Description cannot exceed ${VALIDATION_LIMITS.MAX_CONTENT_LENGTH} characters`,
      }
    }

    description = sanitized
  }

  // Validate category
  const validCategories = ['environment', 'hydration', 'nutrition', 'behavior', 'wellness', 'safety', 'maintenance', 'general']
  if (!validCategories.includes(raw.category as string)) {
    return {
      ok: false,
      error: 'INVALID_CATEGORY',
      message: 'category 必须是有效的类别 / category must be a valid category',
    }
  }

  // Validate dueDate (optional)
  let dueDate: string | undefined
  if (raw.dueDate !== undefined) {
    if (typeof raw.dueDate !== 'string') {
      return {
        ok: false,
        error: 'INVALID_DUE_DATE',
        message: 'dueDate 必须是字符串 / dueDate must be a string',
      }
    }
    dueDate = raw.dueDate
  }

  const value: {
    title: string
    description?: string
    category: string
    dueDate?: string
  } = {
    title,
    category: raw.category as string,
  }
  if (description) {
    value.description = description
  }
  if (dueDate) {
    value.dueDate = dueDate
  }

  return {
    ok: true,
    value,
  }
}

/**
 * 验证插件数据
 * Validates plugin data
 *
 * @param data - 原始请求数据 / Raw request data
 * @returns 验证结果 / Validation result
 */
export function validatePlugin(data: unknown): Result<{
  name: string
  description?: string
  apiBaseUrl: string
}> {
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      error: 'INVALID_TYPE',
      message: '请求必须是一个对象 / Request must be an object',
    }
  }

  const raw = data as Record<string, unknown>

  // Validate name
  if (typeof raw.name !== 'string') {
    return {
      ok: false,
      error: 'INVALID_NAME',
      message: 'name 必须是字符串 / name must be a string',
    }
  }

  const name = sanitizeString(raw.name)
  if (name.length === 0) {
    return {
      ok: false,
      error: 'EMPTY_NAME',
      message: 'name 不能为空 / name cannot be empty',
    }
  }

  if (name.length > VALIDATION_LIMITS.MAX_SHORT_TEXT_LENGTH) {
    return {
      ok: false,
      error: 'NAME_TOO_LONG',
      message: `名称不能超过 ${VALIDATION_LIMITS.MAX_SHORT_TEXT_LENGTH} 个字符 / Name cannot exceed ${VALIDATION_LIMITS.MAX_SHORT_TEXT_LENGTH} characters`,
    }
  }

  // Validate description (optional)
  let description: string | undefined
  if (raw.description !== undefined) {
    if (typeof raw.description !== 'string') {
      return {
        ok: false,
        error: 'INVALID_DESCRIPTION',
        message: 'description 必须是字符串 / description must be a string',
      }
    }

    const sanitized = sanitizeString(raw.description)
    if (sanitized.length > VALIDATION_LIMITS.MAX_CONTENT_LENGTH) {
      return {
        ok: false,
        error: 'DESCRIPTION_TOO_LONG',
        message: `描述不能超过 ${VALIDATION_LIMITS.MAX_CONTENT_LENGTH} 个字符 / Description cannot exceed ${VALIDATION_LIMITS.MAX_CONTENT_LENGTH} characters`,
      }
    }

    description = sanitized
  }

  // Validate apiBaseUrl
  if (typeof raw.apiBaseUrl !== 'string') {
    return {
      ok: false,
      error: 'INVALID_API_URL',
      message: 'apiBaseUrl 必须是字符串 / apiBaseUrl must be a string',
    }
  }

  const urlValidation = validateUrl(raw.apiBaseUrl)
  if (!urlValidation.ok) {
    return urlValidation as Result<never>
  }

  const value: {
    name: string
    description?: string
    apiBaseUrl: string
  } = {
    name,
    apiBaseUrl: urlValidation.value,
  }
  if (description) {
    value.description = description
  }

  return {
    ok: true,
    value,
  }
}

/**
 * 验证查询字符串
 * Validates query string
 *
 * @param query - 查询字符串 / Query string
 * @returns 验证结果 / Validation result
 */
export function validateQueryString(query: unknown): Result<string> {
  if (typeof query !== 'string') {
    return {
      ok: false,
      error: 'INVALID_TYPE',
      message: '查询必须是字符串 / Query must be a string',
    }
  }

  const sanitized = sanitizeString(query)

  if (sanitized.length > VALIDATION_LIMITS.MAX_QUERY_LENGTH) {
    return {
      ok: false,
      error: 'QUERY_TOO_LONG',
      message: `查询不能超过 ${VALIDATION_LIMITS.MAX_QUERY_LENGTH} 个字符 / Query cannot exceed ${VALIDATION_LIMITS.MAX_QUERY_LENGTH} characters`,
    }
  }

  return {
    ok: true,
    value: sanitized,
  }
}

/**
 * 验证聊天收藏数据
 * Validates chat favorite data
 *
 * @param data - 原始请求数据 / Raw request data
 * @returns 验证结果 / Validation result
 */
export function validateChatFavorite(data: unknown): Result<{
  role: string
  content: string
}> {
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      error: 'INVALID_TYPE',
      message: '请求必须是一个对象 / Request must be an object',
    }
  }

  const raw = data as Record<string, unknown>

  // Validate role
  const validRoles = ['user', 'assistant']
  if (!validRoles.includes(raw.role as string)) {
    return {
      ok: false,
      error: 'INVALID_ROLE',
      message: 'role 必须是 user 或 assistant / role must be user or assistant',
    }
  }

  // Validate content
  if (typeof raw.content !== 'string') {
    return {
      ok: false,
      error: 'INVALID_CONTENT',
      message: 'content 必须是字符串 / content must be a string',
    }
  }

  const sanitized = sanitizeString(raw.content)
  if (sanitized.length === 0) {
    return {
      ok: false,
      error: 'EMPTY_CONTENT',
      message: 'content 不能为空 / content cannot be empty',
    }
  }

  if (sanitized.length > VALIDATION_LIMITS.MAX_CONTENT_LENGTH) {
    return {
      ok: false,
      error: 'CONTENT_TOO_LONG',
      message: `内容不能超过 ${VALIDATION_LIMITS.MAX_CONTENT_LENGTH} 个字符 / Content cannot exceed ${VALIDATION_LIMITS.MAX_CONTENT_LENGTH} characters`,
    }
  }

  return {
    ok: true,
    value: {
      role: raw.role as string,
      content: sanitized,
    },
  }
}

/**
 * 创建错误响应
 * Creates an error response object
 *
 * @param error - Result 类型的错误对象
 * @returns 标准错误响应对象
 */
export function createErrorResponse<T>(error: Result<T, string>) {
  if (error.ok) {
    return null
  }

  return {
    success: false,
    error: {
      code: error.error,
      message: error.message,
    },
    timestamp: new Date().toISOString(),
  }
}

/**
 * 创建成功响应
 * Creates a success response object
 *
 * @param data - 响应数据 / Response data
 * @returns 标准成功响应对象
 */
export function createSuccessResponse<T>(data: T) {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
}

/**
 * 安全地执行异步操作并处理错误
 * Safely executes async operation and handles errors
 *
 * @param fn - 异步函数 / Async function to execute
 * @param context - 错误上下文信息 / Error context
 * @returns Result 对象
 *
 * @example
 * const result = await safeExecute(
 *   () => database.query(...),
 *   'Failed to fetch user from database'
 * )
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  context: string,
): Promise<Result<T>> {
  try {
    const value = await fn()
    return { ok: true, value }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[error] ${context}:`, message)
    return {
      ok: false,
      error: 'EXECUTION_ERROR',
      message: `${context}: ${message}`,
    }
  }
}

/**
 * 同步版本的 safeExecute
 * Synchronous version of safeExecute
 *
 * @param fn - 同步函数 / Sync function to execute
 * @param context - 错误上下文信息 / Error context
 * @returns Result 对象
 */
export function safeSync<T>(fn: () => T, context: string): Result<T> {
  try {
    const value = fn()
    return { ok: true, value }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[error] ${context}:`, message)
    return {
      ok: false,
      error: 'EXECUTION_ERROR',
      message: `${context}: ${message}`,
    }
  }
}

/**
 * 验证图片上传数据
 * Validates image upload data
 *
 * 检查：
 * - Base64 编码的图片大小限制（5MB）
 * - MIME 类型白名单（仅允许常见图片格式）
 * - URL 格式验证（如果提供 URL）
 *
 * Checks:
 * - Base64 encoded image size limit (5MB)
 * - MIME type whitelist (only allow common image formats)
 * - URL format validation (if URL is provided)
 *
 * @param data - 原始图片数据 / Raw image data
 * @returns Result 包含验证后的数据或错误信息 / Result with validated data or error
 */
export function validateImageUpload(data: unknown): Result<{
  imageBase64?: string
  imageUrl?: string
  mimeType?: string
}> {
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      error: 'INVALID_TYPE',
      message: '图片数据格式无效 / Invalid image data format',
    }
  }

  const raw = data as Record<string, unknown>
  const imageBase64 = typeof raw.imageBase64 === 'string' ? raw.imageBase64.trim() : undefined
  const imageUrl = typeof raw.imageUrl === 'string' ? raw.imageUrl.trim() : undefined
  let mimeType = typeof raw.mimeType === 'string' ? raw.mimeType.trim().toLowerCase() : undefined

  // 至少需要提供 base64 或 URL 其中之一
  // At least one of base64 or URL must be provided
  if (!imageBase64 && !imageUrl) {
    return {
      ok: false,
      error: 'MISSING_IMAGE',
      message: '必须提供 imageBase64 或 imageUrl / Must provide either imageBase64 or imageUrl',
    }
  }

  // 验证 base64 图片
  // Validate base64 image
  if (imageBase64) {
    // 检查是否为 data URL 格式
    // Check if it's a data URL format
    if (imageBase64.startsWith('data:')) {
      const match = imageBase64.match(/^data:(.+?);base64,(.+)$/)
      if (!match) {
        return {
          ok: false,
          error: 'INVALID_DATA_URL',
          message: 'Base64 data URL 格式无效 / Invalid base64 data URL format',
        }
      }

      const detectedMimeType = match[1]
      const base64Data = match[2]
      if (!detectedMimeType || !base64Data) {
        return {
          ok: false,
          error: 'INVALID_DATA_URL',
          message: 'Base64 data URL 缺少必要的部分 / Base64 data URL missing required segments',
        }
      }

      // 验证 MIME 类型
      // Validate MIME type
      if (!ALLOWED_IMAGE_MIME_TYPES.has(detectedMimeType)) {
        return {
          ok: false,
          error: 'INVALID_MIME_TYPE',
          message: `不支持的图片格式：${detectedMimeType}。允许的格式：${Array.from(ALLOWED_IMAGE_MIME_TYPES).join(', ')} / Unsupported image format: ${detectedMimeType}. Allowed: ${Array.from(ALLOWED_IMAGE_MIME_TYPES).join(', ')}`,
        }
      }

      // 如果未提供 mimeType，使用检测到的类型
      // If mimeType not provided, use detected type
      if (!mimeType) {
        mimeType = detectedMimeType
      }

      // 计算 base64 解码后的大小（约为编码大小的 3/4）
      // Calculate decoded size (approximately 3/4 of encoded size)
      const sizeBytes = Math.floor((base64Data.length * 3) / 4)
      if (sizeBytes > VALIDATION_LIMITS.MAX_IMAGE_SIZE_BYTES) {
        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2)
        const maxMB = (VALIDATION_LIMITS.MAX_IMAGE_SIZE_BYTES / (1024 * 1024)).toFixed(0)
        return {
          ok: false,
          error: 'IMAGE_TOO_LARGE',
          message: `图片过大：${sizeMB}MB（最大 ${maxMB}MB）/ Image too large: ${sizeMB}MB (max ${maxMB}MB)`,
        }
      }
    } else {
      // 纯 base64 字符串（无 data: 前缀）
      // Pure base64 string (without data: prefix)
      const sizeBytes = Math.floor((imageBase64.length * 3) / 4)
      if (sizeBytes > VALIDATION_LIMITS.MAX_IMAGE_SIZE_BYTES) {
        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2)
        const maxMB = (VALIDATION_LIMITS.MAX_IMAGE_SIZE_BYTES / (1024 * 1024)).toFixed(0)
        return {
          ok: false,
          error: 'IMAGE_TOO_LARGE',
          message: `图片过大：${sizeMB}MB（最大 ${maxMB}MB）/ Image too large: ${sizeMB}MB (max ${maxMB}MB)`,
        }
      }
    }
  }

  // 验证图片 URL
  // Validate image URL
  if (imageUrl) {
    if (!URL_PATTERN.test(imageUrl)) {
      return {
        ok: false,
        error: 'INVALID_URL',
        message: 'URL 格式无效，必须以 http:// 或 https:// 开头 / Invalid URL format, must start with http:// or https://',
      }
    }

    if (imageUrl.length > VALIDATION_LIMITS.MAX_URL_LENGTH) {
      return {
        ok: false,
        error: 'URL_TOO_LONG',
        message: `URL 过长（最大 ${VALIDATION_LIMITS.MAX_URL_LENGTH} 字符）/ URL too long (max ${VALIDATION_LIMITS.MAX_URL_LENGTH} characters)`,
      }
    }
  }

  // 如果提供了 mimeType，验证它
  // If mimeType is provided, validate it
  if (mimeType && !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    return {
      ok: false,
      error: 'INVALID_MIME_TYPE',
      message: `不支持的图片格式：${mimeType}。允许的格式：${Array.from(ALLOWED_IMAGE_MIME_TYPES).join(', ')} / Unsupported image format: ${mimeType}. Allowed: ${Array.from(ALLOWED_IMAGE_MIME_TYPES).join(', ')}`,
    }
  }

  return {
    ok: true,
    value: {
      ...(imageBase64 ? { imageBase64 } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(mimeType ? { mimeType } : {}),
    },
  }
}

function ensureDataUrl(value: string, mimeType: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('data:')) {
    return trimmed
  }
  return `data:${mimeType};base64,${trimmed}`
}

export function validateDocumentUpload(data: unknown): Result<{
  dataUrl: string
  mimeType: string
  filename?: string
}> {
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      error: 'INVALID_TYPE',
      message: 'Document data format invalid / Document data 格式錯誤',
    }
  }

  const raw = data as Record<string, unknown>
  const dataValue =
    typeof raw.dataUrl === 'string'
      ? raw.dataUrl
      : typeof raw.data === 'string'
        ? raw.data
        : ''
  const mimeType = typeof raw.mimeType === 'string' ? raw.mimeType.trim().toLowerCase() : ''

  if (!dataValue || !mimeType) {
    return {
      ok: false,
      error: 'MISSING_DOCUMENT_DATA',
      message: 'Document data and MIME type are required / 需要 Document 資料與 MIME 類型',
    }
  }

  if (!ALLOWED_DOCUMENT_MIME_TYPES.has(mimeType)) {
    return {
      ok: false,
      error: 'INVALID_DOCUMENT_TYPE',
      message: `Unsupported document format: ${mimeType}. Supported: PDF/DOC/DOCX / 不支援的文件格式：${mimeType}。支援 PDF/DOC/DOCX`,
    }
  }

  const filename = typeof raw.filename === 'string' && raw.filename.trim().length > 0 ? raw.filename.trim() : undefined
  const dataUrl = ensureDataUrl(dataValue, mimeType)
  return {
    ok: true,
    value: {
      dataUrl,
      mimeType,
      filename,
    },
  }
}
