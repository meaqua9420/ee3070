/**
 * 环境变量验证模块 / Environment Variable Validation Module
 *
 * 在服务器启动前验证所有必需和可选的环境变量
 * Validate all required and optional environment variables before server starts
 */

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

interface EnvConfig {
  // Core server
  PORT: number
  ALLOWED_ORIGINS: string
  HISTORY_LIMIT: number
  DB_PATH: string

  // HTTPS (optional)
  HTTPS_CERT_PATH?: string
  HTTPS_KEY_PATH?: string

  // Serial (optional)
  SERIAL_ENABLED: boolean
  SERIAL_PORT?: string
  SERIAL_BAUD?: number

  // AI providers (optional)
  OLLAMA_BASE_URL?: string
  OLLAMA_MODEL?: string
  OPENAI_API_KEY?: string
  OPENAI_MODEL?: string

  HARDWARE_API_KEY?: string
  ADMIN_API_KEY?: string
  SMARTCAT_AUTH_USERS?: string
  SMARTCAT_AUTH_USERS_FILE?: string

  // Local LLM
  LOCAL_LLM_MODEL_ID?: string
  LOCAL_LLM_SERVER_URL?: string

  // Text-to-speech
  ENABLE_TTS?: boolean
  TTS_MODEL_ID?: string
  TTS_LANGUAGE?: string
  TTS_SPEAKER_ID?: string
  TTS_MAX_CHARACTERS?: number
}

/**
 * 验证环境变量 / Validate environment variables
 */
export function validateEnv(): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // ===== 必需变量 / Required variables =====

  // PORT - 服务器端口 / Server port
  const PORT = process.env.PORT ?? '4000'
  const portNum = Number.parseInt(PORT, 10)
  if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
    errors.push(`❌ PORT must be a valid port number (1-65535), got: ${PORT}`)
  }

  // DB_PATH - 数据库文件路径 / Database file path
  const DB_PATH = process.env.DB_PATH ?? 'smart-cat-home.db'
  if (!DB_PATH || DB_PATH.trim().length === 0) {
    errors.push('❌ DB_PATH must not be empty')
  }

  // HISTORY_LIMIT - 历史记录限制 / History limit
  const HISTORY_LIMIT = process.env.HISTORY_LIMIT ?? '24'
  const historyNum = Number.parseInt(HISTORY_LIMIT, 10)
  if (Number.isNaN(historyNum) || historyNum < 1 || historyNum > 168) {
    errors.push(`❌ HISTORY_LIMIT must be 1-168 hours, got: ${HISTORY_LIMIT}`)
  }

  // ===== HTTPS 配置 / HTTPS configuration =====
  const HTTPS_CERT_PATH = process.env.HTTPS_CERT_PATH
  const HTTPS_KEY_PATH = process.env.HTTPS_KEY_PATH

  if ((HTTPS_CERT_PATH && !HTTPS_KEY_PATH) || (!HTTPS_CERT_PATH && HTTPS_KEY_PATH)) {
    errors.push('❌ HTTPS requires both HTTPS_CERT_PATH and HTTPS_KEY_PATH')
  }

  if (HTTPS_CERT_PATH && HTTPS_KEY_PATH) {
    const fs = require('node:fs')
    if (!fs.existsSync(HTTPS_CERT_PATH)) {
      errors.push(`❌ HTTPS_CERT_PATH file not found: ${HTTPS_CERT_PATH}`)
    }
    if (!fs.existsSync(HTTPS_KEY_PATH)) {
      errors.push(`❌ HTTPS_KEY_PATH file not found: ${HTTPS_KEY_PATH}`)
    }
  }

  // ===== 串口配置 / Serial configuration =====
  const SERIAL_ENABLED = (process.env.SERIAL_ENABLED ?? 'false').toLowerCase()
  if (!['true', 'false', '1', '0', 'yes', 'no'].includes(SERIAL_ENABLED)) {
    errors.push(`❌ SERIAL_ENABLED must be true/false, got: ${SERIAL_ENABLED}`)
  }

  if (['true', '1', 'yes'].includes(SERIAL_ENABLED)) {
    const SERIAL_PORT = process.env.SERIAL_PORT
    if (!SERIAL_PORT || SERIAL_PORT.trim().length === 0) {
      errors.push('❌ SERIAL_ENABLED=true requires SERIAL_PORT to be set')
    }

    const SERIAL_BAUD = process.env.SERIAL_BAUD ?? '115200'
    const baudNum = Number.parseInt(SERIAL_BAUD, 10)
    const validBauds = [115200, 9600, 19200, 38400, 57600]
    if (!validBauds.includes(baudNum)) {
      warnings.push(`⚠️  SERIAL_BAUD (${baudNum}) is not standard. Common: 115200, 9600`)
    }
  }

  // ===== AI 配置 / AI configuration =====
  const hasOllama = process.env.OLLAMA_BASE_URL && process.env.OLLAMA_BASE_URL.trim().length > 0
  const hasOpenAI = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0
  const hasLocalLLM = process.env.LOCAL_LLM_SERVER_URL && process.env.LOCAL_LLM_SERVER_URL.trim().length > 0

  if (!hasOllama && !hasOpenAI && !hasLocalLLM) {
    warnings.push('⚠️  No AI provider configured (OLLAMA, OPENAI, or LOCAL_LLM). Chat features will be unavailable.')
  }

  // Ollama URL 格式验证 / Ollama URL format validation
  if (hasOllama) {
    const ollamaUrl = process.env.OLLAMA_BASE_URL!
    try {
      new URL(ollamaUrl)
    } catch {
      errors.push(`❌ OLLAMA_BASE_URL is not a valid URL: ${ollamaUrl}`)
    }

    if (!process.env.OLLAMA_MODEL || process.env.OLLAMA_MODEL.trim().length === 0) {
      warnings.push('⚠️  OLLAMA_BASE_URL is set but OLLAMA_MODEL is empty')
    }
  }

  // OpenAI API key 格式验证 / OpenAI API key format validation
  if (hasOpenAI) {
    const apiKey = process.env.OPENAI_API_KEY!
    if (!apiKey.startsWith('sk-')) {
      warnings.push('⚠️  OPENAI_API_KEY does not start with "sk-", may be invalid')
    }
    if (apiKey.length < 20) {
      errors.push('❌ OPENAI_API_KEY is too short, likely invalid')
    }
  }

  // Local LLM 配置验证 / Local LLM configuration validation
  if (hasLocalLLM) {
    const localUrl = process.env.LOCAL_LLM_SERVER_URL!
    try {
      new URL(localUrl)
    } catch {
      errors.push(`❌ LOCAL_LLM_SERVER_URL is not a valid URL: ${localUrl}`)
    }
  }

  // ===== Text-to-speech configuration =====
  const ENABLE_TTS = (process.env.ENABLE_TTS ?? 'true').toLowerCase()
  if (!['true', 'false', '1', '0', 'yes', 'no'].includes(ENABLE_TTS)) {
    errors.push(`❌ ENABLE_TTS must be true/false, got: ${ENABLE_TTS}`)
  }

  if (['true', '1', 'yes'].includes(ENABLE_TTS)) {
    const modelId = (process.env.TTS_MODEL_ID ?? 'Xenova/xtts-v2').trim()
    if (modelId.length === 0) {
      errors.push('❌ ENABLE_TTS=true requires TTS_MODEL_ID to be set')
    }
    const charLimitRaw = process.env.TTS_MAX_CHARACTERS ?? '500'
    const charLimit = Number.parseInt(charLimitRaw, 10)
    if (Number.isNaN(charLimit) || charLimit < 100 || charLimit > 2000) {
      errors.push(
        `❌ TTS_MAX_CHARACTERS must be a number between 100 and 2000 characters, got: ${charLimitRaw}`,
      )
    }
  } else {
    warnings.push('ℹ️  ENABLE_TTS is disabled. Text-to-speech API will not be available.')
  }

  // ===== VAPID 配置（可选但必须成对）/ VAPID configuration (optional but must be paired) =====
  const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

  if ((VAPID_PUBLIC_KEY && !VAPID_PRIVATE_KEY) || (!VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)) {
    errors.push('❌ VAPID requires both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY')
  }

  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    if (VAPID_PUBLIC_KEY.length < 80 || VAPID_PRIVATE_KEY.length < 40) {
      errors.push('❌ VAPID keys appear to be too short, may be invalid')
    }
  } else {
    warnings.push('⚠️  VAPID keys not configured. Push notifications will be unavailable.')
  }

  // ===== Native push (APNs / FCM) configuration =====
  const rawNativePushFlag = (process.env.NATIVE_PUSH_ENABLED ?? 'false').toLowerCase()
  if (!['true', 'false', '1', '0', 'yes', 'no'].includes(rawNativePushFlag)) {
    errors.push(`❌ NATIVE_PUSH_ENABLED must be true/false, got: ${rawNativePushFlag}`)
  }

  const nativePushEnabled = ['true', '1', 'yes'].includes(rawNativePushFlag)
  if (nativePushEnabled) {
    const apnsKeyPath = process.env.APNS_AUTH_KEY_PATH?.trim()
    const apnsKeyBase64 = process.env.APNS_AUTH_KEY_BASE64?.trim()
    const apnsKeyId = process.env.APNS_KEY_ID?.trim()
    const apnsTeamId = process.env.APNS_TEAM_ID?.trim()
    const apnsBundleId = process.env.APNS_BUNDLE_ID?.trim()
    const apnsConfigured = Boolean((apnsKeyPath || apnsKeyBase64) && apnsKeyId && apnsTeamId && apnsBundleId)

    const fcmServiceAccountPath = process.env.FCM_SERVICE_ACCOUNT_PATH?.trim()
    const fcmServiceAccountBase64 = process.env.FCM_SERVICE_ACCOUNT_BASE64?.trim()
    const fcmConfigured = Boolean(fcmServiceAccountPath || fcmServiceAccountBase64)

    if (!apnsConfigured && !fcmConfigured) {
      errors.push('❌ NATIVE_PUSH_ENABLED=true requires APNs or FCM credentials to be configured.')
    }

    if (apnsConfigured) {
      if (!apnsKeyPath && !apnsKeyBase64) {
        errors.push('❌ APNS_AUTH_KEY_PATH or APNS_AUTH_KEY_BASE64 must be provided for APNs push.')
      }
      if (!apnsKeyId) errors.push('❌ APNS_KEY_ID is required when APNs is enabled.')
      if (!apnsTeamId) errors.push('❌ APNS_TEAM_ID is required when APNs is enabled.')
      if (!apnsBundleId) errors.push('❌ APNS_BUNDLE_ID is required when APNs is enabled.')

      if (apnsKeyPath) {
        const fs = require('node:fs')
        const path = require('node:path')
        const resolved = path.isAbsolute(apnsKeyPath) ? apnsKeyPath : path.resolve(process.cwd(), apnsKeyPath)
        if (!fs.existsSync(resolved)) {
          errors.push(`❌ APNS_AUTH_KEY_PATH file not found: ${resolved}`)
        }
      }

      if (apnsKeyBase64) {
        try {
          Buffer.from(apnsKeyBase64, 'base64').toString('utf-8')
        } catch (error) {
          errors.push(`❌ APNS_AUTH_KEY_BASE64 is not valid base64: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }

    if (fcmConfigured) {
      if (fcmServiceAccountPath) {
        const fs = require('node:fs')
        const path = require('node:path')
        const resolved = path.isAbsolute(fcmServiceAccountPath)
          ? fcmServiceAccountPath
          : path.resolve(process.cwd(), fcmServiceAccountPath)
        if (!fs.existsSync(resolved)) {
          errors.push(`❌ FCM_SERVICE_ACCOUNT_PATH file not found: ${resolved}`)
        }
      }
      if (fcmServiceAccountBase64) {
        try {
          const decoded = Buffer.from(fcmServiceAccountBase64, 'base64').toString('utf-8')
          JSON.parse(decoded)
        } catch (error) {
          errors.push(`❌ FCM_SERVICE_ACCOUNT_BASE64 must be base64-encoded JSON: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
  }

  // ===== Camera configuration (optional) =====
  const CAMERA_BASE_URL = process.env.CAMERA_BASE_URL
  if (CAMERA_BASE_URL && CAMERA_BASE_URL.trim().length > 0) {
    try {
      new URL(CAMERA_BASE_URL)
    } catch {
      errors.push(`❌ CAMERA_BASE_URL is not a valid URL: ${CAMERA_BASE_URL}`)
    }
  } else {
    warnings.push('ℹ️  CAMERA_BASE_URL not configured. Camera proxy endpoints will rely on push events only.')
  }

  const CAMERA_STATUS_PATH = process.env.CAMERA_STATUS_PATH ?? '/status'
  if (CAMERA_STATUS_PATH.trim().length === 0) {
    warnings.push('⚠️  CAMERA_STATUS_PATH is empty, falling back to /status')
  }

  const CAMERA_SNAPSHOT_PATH = process.env.CAMERA_SNAPSHOT_PATH ?? '/snapshot.jpg'
  if (CAMERA_SNAPSHOT_PATH.trim().length === 0) {
    warnings.push('⚠️  CAMERA_SNAPSHOT_PATH is empty, falling back to /snapshot.jpg')
  }

  const CAMERA_PUBLIC_SNAPSHOT_URL = process.env.CAMERA_PUBLIC_SNAPSHOT_URL
  if (CAMERA_PUBLIC_SNAPSHOT_URL && CAMERA_PUBLIC_SNAPSHOT_URL.trim().length > 0) {
    try {
      new URL(CAMERA_PUBLIC_SNAPSHOT_URL)
    } catch (error) {
      errors.push(
        `❌ CAMERA_PUBLIC_SNAPSHOT_URL is not a valid URL: ${CAMERA_PUBLIC_SNAPSHOT_URL}. Error: ${
          (error as Error).message
        }`,
      )
    }
  }

  const CAMERA_PUBLIC_STREAM_URL = process.env.CAMERA_PUBLIC_STREAM_URL
  if (CAMERA_PUBLIC_STREAM_URL && CAMERA_PUBLIC_STREAM_URL.trim().length > 0) {
    try {
      new URL(CAMERA_PUBLIC_STREAM_URL)
    } catch (error) {
      errors.push(
        `❌ CAMERA_PUBLIC_STREAM_URL is not a valid URL: ${CAMERA_PUBLIC_STREAM_URL}. Error: ${
          (error as Error).message
        }`,
      )
    }
  }

  // ===== Authentication accounts =====
  const AUTH_USERS_INLINE = process.env.SMARTCAT_AUTH_USERS?.trim()
  const AUTH_USERS_FILE = process.env.SMARTCAT_AUTH_USERS_FILE?.trim()
  if (!AUTH_USERS_INLINE && !AUTH_USERS_FILE) {
    errors.push('❌ SMARTCAT_AUTH_USERS or SMARTCAT_AUTH_USERS_FILE must be provided to define login accounts.')
  } else if (AUTH_USERS_FILE) {
    const fs = require('node:fs')
    const path = require('node:path')
    const resolved = path.isAbsolute(AUTH_USERS_FILE) ? AUTH_USERS_FILE : path.resolve(process.cwd(), AUTH_USERS_FILE)
    if (!fs.existsSync(resolved)) {
      errors.push(`❌ SMARTCAT_AUTH_USERS_FILE not found: ${resolved}`)
    } else {
      try {
        const content = fs.readFileSync(resolved, 'utf-8')
        const parsed = JSON.parse(content)
        if (!Array.isArray(parsed) || parsed.length === 0) {
          errors.push('❌ SMARTCAT_AUTH_USERS_FILE must contain a non-empty JSON array.')
        }
      } catch (error) {
        errors.push(
          `❌ Failed to parse SMARTCAT_AUTH_USERS_FILE: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  } else if (AUTH_USERS_INLINE) {
    try {
      const parsed = JSON.parse(AUTH_USERS_INLINE)
      if (!Array.isArray(parsed) || parsed.length === 0) {
        errors.push('❌ SMARTCAT_AUTH_USERS must be a non-empty JSON array.')
      }
    } catch (error) {
      errors.push(`❌ SMARTCAT_AUTH_USERS is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // ===== Hardware API key (optional but recommended for Wi-Fi uploads) =====
  const HARDWARE_API_KEY = (process.env.HARDWARE_API_KEY ?? '').trim()
  if (HARDWARE_API_KEY.length === 0) {
    warnings.push('⚠️  HARDWARE_API_KEY not configured. POST /api/snapshots will accept unauthenticated requests.')
  } else if (HARDWARE_API_KEY.length < 16) {
    warnings.push('⚠️  HARDWARE_API_KEY is shorter than 16 characters. Use a stronger secret for better security.')
  }

  const ADMIN_API_KEY = (process.env.ADMIN_API_KEY ?? '').trim()
  if (ADMIN_API_KEY.length === 0) {
    warnings.push('ℹ️  ADMIN_API_KEY not configured. Admin endpoints now require an authenticated developer session.')
  } else if (ADMIN_API_KEY.length < 12) {
    warnings.push('⚠️  ADMIN_API_KEY is shorter than 12 characters. Use a stronger secret for better security.')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * 打印验证结果 / Print validation results
 */
export function printValidationResult(result: ValidationResult): void {
  console.log('\n🔍 Environment Variable Validation / 环境变量验证\n')

  if (result.errors.length > 0) {
    console.error('❌ CRITICAL ERRORS / 关键错误:')
    for (const error of result.errors) {
      console.error(`   ${error}`)
    }
    console.error('')
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️  WARNINGS / 警告:')
    for (const warning of result.warnings) {
      console.warn(`   ${warning}`)
    }
    console.warn('')
  }

  if (result.valid && result.warnings.length === 0) {
    console.log('✅ All environment variables are valid / 所有环境变量有效\n')
  } else if (result.valid) {
    console.log('✅ Environment variables are valid (with warnings) / 环境变量有效（有警告）\n')
  } else {
    console.error('❌ Environment validation FAILED / 环境验证失败\n')
    console.error('Please check your .env file and fix the errors above.')
    console.error('请检查你的 .env 文件并修复上述错误。\n')
  }
}

/**
 * 验证并在失败时退出 / Validate and exit on failure
 */
export function validateEnvOrExit(): void {
  const result = validateEnv()
  printValidationResult(result)

  if (!result.valid) {
    console.error('❌ Server startup aborted due to configuration errors.')
    console.error('❌ 由于配置错误，服务器启动中止。\n')
    process.exit(1)
  }
}
