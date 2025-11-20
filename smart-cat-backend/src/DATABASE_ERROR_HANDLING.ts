/**
 * 数据库错误处理改进指南 / Database Error Handling Improvements
 *
 * 当前问题 / Current Problems:
 * ❌ db.ts 中有15+个 catch 块，只使用 console.warn
 * ❌ 错误被隐藏，调用者不知道发生了什么
 * ❌ 无法区分不同类型的错误
 * ❌ 没有错误恢复机制
 *
 * 改进方案 / Improvements:
 * ✅ 使用 Result 类型返回错误信息
 * ✅ 对不同的错误进行分类
 * ✅ 提供清晰的错误消息
 * ✅ 添加错误恢复策略
 */

import Database from 'better-sqlite3'
import type { SmartHomeSnapshot, SmartHomeSettings, ToolExecutionLog } from './types'
import { Result, safeSync } from './validators'

/**
 * ============================================
 * 数据库错误类型定义
 * Database Error Type Definitions
 * ============================================
 */

/**
 * 数据库操作的错误代码
 * Database operation error codes
 */
export type DatabaseErrorCode =
  | 'DB_CONNECTION_FAILED'
  | 'TABLE_NOT_FOUND'
  | 'PARSE_ERROR'
  | 'CONSTRAINT_VIOLATION'
  | 'QUERY_FAILED'
  | 'NO_DATA'
  | 'CONCURRENT_ACCESS'
  | 'UNKNOWN'

/**
 * 数据库操作结果类型
 * Database operation result type
 */
export type DbResult<T> = Result<T, DatabaseErrorCode>

/**
 * ============================================
 * 改进的快照加载函数
 * Improved Snapshot Loading Function
 * ============================================
 */

/**
 * 原始代码 (db.ts):
 * ❌ try {
 *     const raw = db.prepare(...).get(...)
 *     if (!raw) return undefined
 *     return JSON.parse((raw as any).snapshot_json)
 *   } catch (error) {
 *     console.warn('[db] Failed to parse latest snapshot', error)
 *     return undefined  // 调用者不知道发生了什么
 *   }
 *
 * ✅ 改进版本:
 */

/**
 * 安全地加载最新的快照
 * Safely load the latest snapshot
 *
 * @param db - 数据库实例 / Database instance
 * @returns 结果对象，包含快照或错误信息 / Result with snapshot or error
 *
 * @example
 * const result = loadLatestSnapshotImproved(db)
 * if (!result.ok) {
 *   console.error(`Failed to load snapshot: ${result.message}`)
 *   return null
 * }
 * const snapshot = result.value
 */
export function loadLatestSnapshotImproved(db: Database.Database): DbResult<SmartHomeSnapshot | null> {
  return safeSync(() => {
    // 查询最新的快照
    const raw = db
      .prepare('SELECT snapshot_json FROM snapshots ORDER BY timestamp DESC LIMIT 1')
      .get() as { snapshot_json: string } | undefined

    if (!raw) {
      // 这不是一个错误，只是没有数据
      // This is not an error, just no data
      return null
    }

    // 尝试解析 JSON
    try {
      const snapshot = JSON.parse(raw.snapshot_json) as SmartHomeSnapshot
      return snapshot
    } catch (parseError) {
      // JSON 解析失败，这是一个真正的错误
      // JSON parsing failed, this is a real error
      throw new Error(`Invalid snapshot JSON in database: ${parseError instanceof Error ? parseError.message : 'unknown'}`)
    }
  }, 'Failed to load latest snapshot from database')
}

/**
 * ============================================
 * 改进的设置加载函数
 * Improved Settings Loading Function
 * ============================================
 */

/**
 * 安全地加载设置
 * Safely load settings
 *
 * @param db - 数据库实例 / Database instance
 * @param defaults - 默认设置 / Default settings
 * @returns 结果对象 / Result object
 *
 * @example
 * const result = loadSettingsImproved(db, DEFAULT_SETTINGS)
 * if (!result.ok) {
 *   console.warn(`Could not load settings, using defaults: ${result.message}`)
 *   const settings = DEFAULT_SETTINGS
 * } else {
 *   const settings = result.value
 * }
 */
export function loadSettingsImproved(
  db: Database.Database,
  defaults: SmartHomeSettings,
): DbResult<SmartHomeSettings> {
  return safeSync(() => {
    const row = db.prepare('SELECT payload FROM settings WHERE id = 1').get() as { payload: string } | undefined

    if (!row) {
      // 没有设置，将使用默认值
      // No settings, will use defaults
      console.warn('[db] No settings found in database, will use defaults')
      return defaults
    }

    const parsed = JSON.parse(row.payload) as SmartHomeSettings
    return parsed
  }, 'Failed to load settings from database')
}

/**
 * ============================================
 * 改进的快照保存函数
 * Improved Snapshot Saving Function
 * ============================================
 */

/**
 * 安全地保存快照
 * Safely save snapshot
 *
 * @param db - 数据库实例 / Database instance
 * @param snapshot - 要保存的快照 / Snapshot to save
 * @returns 结果对象 / Result object
 *
 * @example
 * const result = await saveSnapshotImproved(db, snapshot)
 * if (!result.ok) {
 *   console.error(`Failed to save snapshot: ${result.message}`)
 *   // 采取恢复措施 / Take recovery action
 * } else {
 *   console.log('Snapshot saved successfully')
 * }
 */
export function saveSnapshotImproved(db: Database.Database, snapshot: SmartHomeSnapshot): DbResult<{ timestamp: string }> {
  return safeSync(() => {
    const timestamp = snapshot.reading.timestamp
    const json = JSON.stringify(snapshot)

    // 使用预编译语句来避免 SQL 注入
    // Use prepared statements to avoid SQL injection
    const stmt = db.prepare('INSERT OR REPLACE INTO snapshots (timestamp, snapshot_json) VALUES (@timestamp, @json)')

    stmt.run({
      '@timestamp': timestamp,
      '@json': json,
    })

    return { timestamp }
  }, 'Failed to save snapshot to database')
}

/**
 * ============================================
 * 改进的设置保存函数
 * Improved Settings Saving Function
 * ============================================
 */

/**
 * 安全地保存设置
 * Safely save settings
 *
 * @param db - 数据库实例 / Database instance
 * @param settings - 要保存的设置 / Settings to save
 * @returns 结果对象 / Result object
 *
 * @example
 * const updateResult = { ...currentSettings, autoMode: true }
 * const result = saveSettingsImproved(db, updateResult)
 * if (!result.ok) {
 *   return { success: false, error: result.message }
 * }
 */
export function saveSettingsImproved(db: Database.Database, settings: SmartHomeSettings): DbResult<void> {
  return safeSync(() => {
    const json = JSON.stringify(settings)

    // 使用 INSERT OR REPLACE 确保操作成功
    // Use INSERT OR REPLACE to ensure operation succeeds
    db.prepare('INSERT OR REPLACE INTO settings (id, payload) VALUES (1, @json)').run({
      '@json': json,
    })
  }, 'Failed to save settings to database')
}

/**
 * ============================================
 * 改进的查询包装器
 * Improved Query Wrappers
 * ============================================
 */

/**
 * 安全地执行 SELECT 查询
 * Safely execute SELECT query
 *
 * @param db - 数据库实例 / Database instance
 * @param query - SQL 查询语句 / SQL query
 * @param params - 查询参数 / Query parameters
 * @returns 结果对象 / Result object
 *
 * @example
 * const result = queryOne(db, 'SELECT * FROM settings WHERE id = ?', [1])
 * if (result.ok) {
 *   const settings = result.value
 * }
 */
export function queryOne<T extends Record<string, unknown>>(
  db: Database.Database,
  query: string,
  params?: unknown[],
): DbResult<T | null> {
  return safeSync(() => {
    const stmt = db.prepare(query)
    const row = params ? stmt.get(...params) : stmt.get()
    return (row as T | null) ?? null
  }, `Failed to execute query: ${query}`)
}

/**
 * 安全地执行 SELECT 查询（返回多行）
 * Safely execute SELECT query (return multiple rows)
 *
 * @param db - 数据库实例 / Database instance
 * @param query - SQL 查询语句 / SQL query
 * @param params - 查询参数 / Query parameters
 * @returns 结果对象 / Result object
 *
 * @example
 * const result = queryAll(db, 'SELECT * FROM snapshots LIMIT 10')
 * if (result.ok) {
 *   const snapshots = result.value
 * }
 */
export function queryAll<T extends Record<string, unknown>>(
  db: Database.Database,
  query: string,
  params?: unknown[],
): DbResult<T[]> {
  return safeSync(() => {
    const stmt = db.prepare(query)
    const rows = params ? stmt.all(...params) : stmt.all()
    return (rows as T[]) || []
  }, `Failed to execute query: ${query}`)
}

/**
 * 安全地执行 INSERT/UPDATE/DELETE 操作
 * Safely execute INSERT/UPDATE/DELETE operations
 *
 * @param db - 数据库实例 / Database instance
 * @param query - SQL 语句 / SQL statement
 * @param params - 参数 / Parameters
 * @returns 结果对象 / Result object
 *
 * @example
 * const result = executeUpdate(db, 'UPDATE settings SET autoMode = 1 WHERE id = 1')
 * if (result.ok) {
 *   console.log(`Updated ${result.value.changes} rows`)
 * }
 */
export function executeUpdate(
  db: Database.Database,
  query: string,
  params?: unknown[],
): DbResult<{ changes: number; lastInsertRowid: number }> {
  return safeSync(() => {
    const stmt = db.prepare(query)
    const info = params ? stmt.run(...params) : stmt.run()
    return {
      changes: info.changes,
      lastInsertRowid: info.lastInsertRowid as number,
    }
  }, `Failed to execute update: ${query}`)
}

/**
 * ============================================
 * 错误恢复和重试策略
 * Error Recovery and Retry Strategy
 * ============================================
 */

/**
 * 配置重试参数
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number
  delayMs: number
  backoffMultiplier: number
  maxDelayMs: number
}

/**
 * 默认重试配置
 * Default retry config
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  delayMs: 100,
  backoffMultiplier: 2,
  maxDelayMs: 1000,
}

/**
 * 使用重试机制执行数据库操作
 * Execute database operation with retry mechanism
 *
 * @param operation - 数据库操作 / Database operation
 * @param config - 重试配置 / Retry config
 * @returns 结果对象 / Result object
 *
 * @example
 * const result = await withRetry(
 *   () => loadLatestSnapshotImproved(db),
 *   { maxAttempts: 3, delayMs: 100, ... }
 * )
 * // 如果第一次失败，会自动重试
 */
export async function withRetry<T, E>(
  operation: () => Result<T, E>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<Result<T, E>> {
  let lastError: Result<T, E> | null = null

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    const result = operation()

    if (result.ok) {
      return result
    }

    lastError = result

    // 如果还有重试机会，等待后重试
    // If more retries available, wait and retry
    if (attempt < config.maxAttempts) {
      const delay = Math.min(
        config.delayMs * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelayMs,
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // 所有重试都失败了，返回最后一个错误
  // All retries failed, return last error
  return lastError || { ok: false, error: 'UNKNOWN' as E, message: 'Unknown error' }
}

/**
 * ============================================
 * 使用示例 / Usage Examples
 * ============================================
 *
 * // 原始做法 (有问题)
 * ❌ const snapshot = loadLatestSnapshot(db)
 * if (!snapshot) {
 *   // 我们不知道为什么失败了
 *   // We don't know why it failed
 * }
 *
 * // 改进的做法
 * ✅ const result = loadLatestSnapshotImproved(db)
 * if (!result.ok) {
 *   console.error(`Failed to load snapshot: ${result.message} (code: ${result.error})`)
 *   // 根据不同的错误代码采取不同的恢复措施
 *   // Take different recovery actions based on error code
 *   switch (result.error) {
 *     case 'PARSE_ERROR':
 *       // 数据库中的数据已损坏，需要数据恢复
 *       console.log('Database corruption detected')
 *       break
 *     case 'NO_DATA':
 *       // 这不是错误，只是没有数据
 *       console.log('No data available yet')
 *       break
 *   }
 *   return null
 * }
 * const snapshot = result.value
 *
 * // 使用重试机制
 * const result = await withRetry(() => saveSnapshotImproved(db, snapshot))
 * if (!result.ok) {
 *   console.error('Failed to save after retries')
 * }
 */

/**
 * ============================================
 * 迁移步骤 / Migration Steps
 * ============================================
 *
 * 1. 将这些改进的函数复制到 db.ts
 *    Copy these improved functions to db.ts
 *
 * 2. 找到所有使用 try-catch 的地方
 *    Find all places using try-catch
 *
 * 3. 将其替换为使用新的错误处理方式
 *    Replace with new error handling approach
 *
 * 4. 在调用处检查 result.ok
 *    Check result.ok at call sites
 *
 * 5. 为关键操作添加重试机制
 *    Add retry mechanism for critical operations
 *
 * 6. 添加日志记录以便调试
 *    Add logging for debugging
 */
