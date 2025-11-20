/**
 * 改进的 API 端点示例 / Improved API Endpoint Examples
 *
 * 这个文件展示如何使用新的验证、错误处理和内存管理工具
 * This file shows how to use new validation, error handling and memory management tools
 *
 * 这些示例可以应用到 index.ts 中的现有端点
 * These examples can be applied to existing endpoints in index.ts
 */

import express, { Request, Response } from 'express'
import {
  validateChatRequest,
  validateSettingsUpdate,
  createSuccessResponse,
  createErrorResponse,
  safeExecute,
} from './validators'
import { TimestampedBuffer } from './circularBuffer'
import type { ValidatedChatRequest, ToolExecutionLog } from './types'

// ============================================
// 初始化改进的工具事件历史
// Initialize improved tool event history
// ============================================

/**
 * 替换原来的数组：
 * Replace original array:
 *
 * ❌ 旧的做法 (内存泄漏)
 * const TOOL_EVENT_HISTORY: Array<ToolExecutionLog & { timestamp: string }> = []
 *
 * ✅ 新的做法 (限制内存使用)
 */
const TOOL_EVENT_HISTORY = new TimestampedBuffer<ToolExecutionLog>(100)
// 这个缓冲区最多只能保存100条记录
// This buffer can hold a maximum of 100 records

/**
 * ============================================
 * 改进的聊天端点示例
 * Improved Chat Endpoint Example
 * ============================================
 */

/**
 * POST /api/ai/chat
 *
 * 原始代码:
 * ❌ 缺少输入验证
 * ❌ 错误处理不足
 * ❌ 没有类型检查
 *
 * 改进版本:
 * ✅ 使用验证器验证输入
 * ✅ 使用Result类型处理错误
 * ✅ 完整的类型安全
 */
export function setupImprovedChatEndpoint(app: express.Application) {
  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    // 第一步：验证输入
    // Step 1: Validate input
    const validationResult = validateChatRequest(req.body)

    if (!validationResult.ok) {
      return res.status(400).json(createErrorResponse(validationResult))
    }

    // 现在 validationResult.value 是完全类型安全的
    // Now validationResult.value is fully type-safe
    const { message, temperature, attachments, sessionId } = validationResult.value

    try {
      // 第二步：安全地执行生成逻辑
      // Step 2: Safely execute generation logic
      const result = await safeExecute(
        async () => {
          // 这里调用 generateChatContent 或其他函数
          // Call generateChatContent or other functions here
          return {
            reply: '这是一个示例回复 / This is an example reply',
            tools: [],
          }
        },
        'Failed to generate chat response',
      )

      if (!result.ok) {
        return res.status(500).json(createErrorResponse(result))
      }

      // 第三步：记录工具执行
      // Step 3: Record tool execution
      const toolLog: ToolExecutionLog = {
        tool: 'chat',
        success: true,
        message: 'Chat completed successfully',
        durationMs: 250,
      }
      TOOL_EVENT_HISTORY.push(toolLog)

      // 第四步：返回成功响应
      // Step 4: Return success response
      return res.json(createSuccessResponse(result.value))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error('[error] Unexpected error in chat endpoint:', message)

      return res.status(500).json(
        createErrorResponse({
          ok: false,
          error: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        }),
      )
    }
  })
}

/**
 * ============================================
 * 改进的设置更新端点示例
 * Improved Settings Update Endpoint Example
 * ============================================
 */

/**
 * POST /api/hardware/settings
 *
 * 原始代码:
 * ❌ 缺少参数验证
 * ❌ 没有范围检查
 * ❌ 错误消息不清晰
 *
 * 改进版本:
 * ✅ 全面的输入验证
 * ✅ 值范围检查
 * ✅ 清晰的错误消息
 */
export function setupImprovedSettingsEndpoint(app: express.Application) {
  app.post('/api/hardware/settings', async (req: Request, res: Response) => {
    // 验证输入
    const validationResult = validateSettingsUpdate(req.body)

    if (!validationResult.ok) {
      return res.status(400).json(createErrorResponse(validationResult))
    }

    try {
      // 安全地保存设置
      const saveResult = await safeExecute(
        async () => {
          // 这里调用数据库保存函数
          // Call database save function here
          return {
            message: '设置已保存 / Settings saved successfully',
          }
        },
        'Failed to save settings',
      )

      if (!saveResult.ok) {
        return res.status(500).json(createErrorResponse(saveResult))
      }

      return res.json(createSuccessResponse(saveResult.value))
    } catch (error) {
      console.error('[error] Unexpected error in settings endpoint:', error)
      return res.status(500).json(
        createErrorResponse({
          ok: false,
          error: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update settings',
        }),
      )
    }
  })
}

/**
 * ============================================
 * 获取工具事件历史的端点
 * Tool Event History Endpoint
 * ============================================
 */

/**
 * GET /api/tools/history
 *
 * 获取最近的工具执行历史
 * Get recent tool execution history
 *
 * 查询参数:
 * - limit: 返回的记录数 (默认10, 最多100)
 * - timeRange: 时间范围 (可选, 格式: 2025-01-01T12:00:00Z,2025-01-01T13:00:00Z)
 */
export function setupToolHistoryEndpoint(app: express.Application) {
  app.get('/api/tools/history', (req: Request, res: Response) => {
    try {
      // 获取查询参数
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100)
      const timeRange = req.query.timeRange as string | undefined

      let history = TOOL_EVENT_HISTORY.getAll()

      // 如果提供了时间范围，进行过滤
      if (timeRange) {
        const [startTime, endTime] = timeRange.split(',')
        history = TOOL_EVENT_HISTORY.getByTimeRange(startTime, endTime)
      }

      // 返回最近的记录
      const recentHistory = history.slice(-limit)

      return res.json(
        createSuccessResponse({
          total: TOOL_EVENT_HISTORY.size(),
          capacity: TOOL_EVENT_HISTORY.capacity(),
          returned: recentHistory.length,
          history: recentHistory,
        }),
      )
    } catch (error) {
      console.error('[error] Failed to fetch tool history:', error)
      return res.status(500).json(
        createErrorResponse({
          ok: false,
          error: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch tool history',
        }),
      )
    }
  })
}

/**
 * ============================================
 * 数据库操作的安全包装
 * Safe Database Operation Wrappers
 * ============================================
 */

/**
 * 安全地加载数据库快照
 * Safely load database snapshot
 *
 * 替换原来的错误处理:
 * ❌ 旧的做法:
 * try {
 *   return JSON.parse(data)
 * } catch (error) {
 *   console.warn('[db] Failed to parse', error)
 *   return undefined // 调用者不知道发生了什么
 * }
 *
 * ✅ 新的做法:
 */
export function safeLoadSnapshot(rawData: string) {
  return safeSync(
    () => {
      const parsed = JSON.parse(rawData)
      // 这里可以添加额外的验证
      // Add additional validation here
      return parsed
    },
    'Failed to parse snapshot from database',
  )
}

/**
 * 安全地保存数据到数据库
 * Safely save data to database
 */
export async function safeSaveSnapshot(data: unknown, database: any) {
  return await safeExecute(
    async () => {
      const json = JSON.stringify(data)
      // 这里调用实际的数据库保存
      // Call actual database save here
      return { saved: true, bytes: json.length }
    },
    'Failed to save snapshot to database',
  )
}

/**
 * ============================================
 * 改进的错误日志
 * Improved Error Logging
 * ============================================
 */

/**
 * 结构化的错误日志记录
 * Structured error logging
 *
 * ❌ 旧的做法:
 * console.error('Something went wrong')
 *
 * ✅ 新的做法:
 */
export function logStructuredError(context: string, error: unknown, details?: Record<string, unknown>) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const timestamp = new Date().toISOString()

  const logEntry = {
    level: 'error',
    timestamp,
    context,
    message: errorMessage,
    ...(error instanceof Error && { stack: error.stack }),
    ...details,
  }

  // 这里可以发送到日志服务
  // Send to logging service here
  console.error('[ERROR]', JSON.stringify(logEntry))
}

/**
 * 结构化的信息日志记录
 * Structured info logging
 */
export function logStructuredInfo(context: string, message: string, details?: Record<string, unknown>) {
  const logEntry = {
    level: 'info',
    timestamp: new Date().toISOString(),
    context,
    message,
    ...details,
  }

  console.log('[INFO]', JSON.stringify(logEntry))
}

/**
 * ============================================
 * 实际应用示例
 * Real-World Usage Example
 * ============================================
 *
 * import express from 'express'
 * const app = express()
 *
 * // 使用改进的端点
 * setupImprovedChatEndpoint(app)
 * setupImprovedSettingsEndpoint(app)
 * setupToolHistoryEndpoint(app)
 *
 * app.listen(3000, () => {
 *   console.log('Server running with improved error handling and validation')
 * })
 */
