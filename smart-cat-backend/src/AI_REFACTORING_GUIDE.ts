/**
 * AI 模块重构指南 / AI Module Refactoring Guide
 *
 * 本文档提供了如何将 generateChatContent 函数从 500+ 行拆分成小的、可测试的函数的指导
 * This document provides guidance on how to break down the generateChatContent function
 * from 500+ lines into small, testable functions
 *
 * 当前问题 / Current Problems:
 * ❌ generateChatContent 函数有 500+ 行代码
 * ❌ 混合了多个不相关的职责
 * ❌ 难以测试、维护和修改
 * ❌ 难以调试问题
 *
 * 重构策略 / Refactoring Strategy:
 * ✅ 将函数分解成单一职责的小函数
 * ✅ 每个函数做一件事并做好
 * ✅ 使用组合模式将小函数组合成完整的工作流
 * ✅ 增加可测试性和可维护性
 */

import type { SmartHomeSnapshot, MemoryEntry, LanguageCode, ChatToolCall, ToolExecutionLog } from './types'
import { Result, safeSync, safeExecute } from './validators'

/**
 * ============================================
 * 步骤1: 提取数据准备函数
 * Step 1: Extract Data Preparation Functions
 * ============================================
 */

/**
 * 从快照中提取上下文信息
 * Extract context information from snapshot
 *
 * 原始代码的第一部分做的就是这个
 * The first part of the original code did this
 */
export interface ChatContext {
  currentTemperature: number
  currentHumidity: number
  currentWaterLevel: number
  catPresent: boolean
  lastFeedingTime: string
  autoModeEnabled: boolean
}

/**
 * 从智能家居快照中提取聊天上下文
 * Extract chat context from smart home snapshot
 *
 * @param snapshot - 当前的智能家居快照 / Current snapshot
 * @returns 提取的上下文信息 / Extracted context
 *
 * @example
 * const context = extractChatContext(snapshot)
 * // context.currentTemperature = 24.5
 * // context.catPresent = true
 */
export function extractChatContext(snapshot: SmartHomeSnapshot | null): ChatContext {
  if (!snapshot) {
    return {
      currentTemperature: 0,
      currentHumidity: 0,
      currentWaterLevel: 0,
      catPresent: false,
      lastFeedingTime: 'unknown',
      autoModeEnabled: false,
    }
  }

  return {
    currentTemperature: snapshot.reading.temperatureC,
    currentHumidity: snapshot.reading.humidityPercent,
    currentWaterLevel: snapshot.reading.waterLevelPercent ?? 0,
    catPresent: snapshot.reading.catPresent ?? false,
    lastFeedingTime: new Date(snapshot.reading.timestamp).toLocaleTimeString(),
    autoModeEnabled: snapshot.settings.autoMode,
  }
}

/**
 * 构建系统提示词
 * Build system prompt
 *
 * @param language - 语言代码 / Language code
 * @returns 系统提示词 / System prompt
 */
export function buildSystemPrompt(language: LanguageCode): string {
  const prompts = {
    zh: `你是一个专业的宠物护理助手。你的职责是：
1. 帮助用户理解他们的猫咪的行为和需求
2. 提供基于数据的健康建议
3. 监控异常情况
4. 协助管理自动化设置

请用友好、专业的语气回应。`,
    en: `You are a professional pet care assistant. Your responsibilities are:
1. Help users understand their cat's behavior and needs
2. Provide data-based health advice
3. Monitor for anomalies
4. Assist in managing automation settings

Please respond in a friendly and professional tone.`,
  }

  return prompts[language] || prompts.en
}

/**
 * ============================================
 * 步骤2: 提取内存和历史处理函数
 * Step 2: Extract Memory and History Processing Functions
 * ============================================
 */

/**
 * 筛选相关的记忆
 * Filter relevant memories
 *
 * @param memories - 所有记忆 / All memories
 * @param question - 用户问题 / User question
 * @param limit - 返回的最大记忆数 / Max memories to return
 * @returns 相关的记忆 / Relevant memories
 *
 * @example
 * const relevant = filterRelevantMemories(memories, "猫咪喜欢吃什么?", 5)
 */
export function filterRelevantMemories(
  memories: MemoryEntry[],
  question: string,
  limit: number = 5,
): MemoryEntry[] {
  // 这里应该使用更高级的相似度匹配
  // Should use more advanced similarity matching
  const questionLower = question.toLowerCase()

  const scored = memories
    .map((mem) => ({
      memory: mem,
      score: calculateRelevanceScore(mem.content.toLowerCase(), questionLower),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored.map((item) => item.memory)
}

/**
 * 计算记忆与问题的相关性分数
 * Calculate relevance score between memory and question
 */
function calculateRelevanceScore(memoryText: string, questionText: string): number {
  // 简单的关键字匹配实现
  // Simple keyword matching implementation
  const keywords = questionText.split(/\s+/).filter((w) => w.length > 2)
  const matches = keywords.filter((keyword) => memoryText.includes(keyword)).length

  return matches / Math.max(keywords.length, 1)
}

/**
 * 构建消息历史
 * Build message history
 *
 * @param memories - 相关的记忆 / Relevant memories
 * @param context - 聊天上下文 / Chat context
 * @returns 格式化的历史消息 / Formatted history
 */
export function buildMessageHistory(memories: MemoryEntry[], context: ChatContext): string {
  const parts: string[] = []

  if (memories.length > 0) {
    parts.push('已知的信息 / Known information:')
    memories.forEach((mem, i) => {
      parts.push(`${i + 1}. ${mem.content}`)
    })
    parts.push('')
  }

  parts.push('当前状态 / Current status:')
  parts.push(`- 温度: ${context.currentTemperature}°C`)
  parts.push(`- 湿度: ${context.currentHumidity}%`)
  parts.push(`- 猫咪在场: ${context.catPresent ? '是' : '否'}`)
  parts.push(`- 最后进食时间: ${context.lastFeedingTime}`)

  return parts.join('\n')
}

/**
 * ============================================
 * 步骤3: 提取模型选择函数
 * Step 3: Extract Model Selection Functions
 * ============================================
 */

export interface ModelConfig {
  name: string
  maxTokens: number
  temperature: number
  topP: number
  topK: number
  enableThinking: boolean
}

/**
 * 选择合适的模型
 * Select appropriate model based on requirements
 *
 * @param isPro - 是否使用专业模型 / Use pro model
 * @param hasImage - 是否有图像附件 / Has image attachment
 * @returns 选择的模型配置 / Selected model config
 *
 * @example
 * const config = selectModel(true, false)
 * // { name: 'qwen3-pro', maxTokens: 240, ... }
 */
export function selectModel(isPro: boolean, hasImage: boolean): ModelConfig {
  // 如果有图像，需要使用支持视觉的模型
  // If has image, need a vision-capable model
  if (hasImage) {
    return {
      name: 'qwen3-vl',
      maxTokens: 200,
      temperature: 0.6,
      topP: 0.9,
      topK: 20,
      enableThinking: false,
    }
  }

  // 根据层级选择模型
  // Select based on tier
  if (isPro) {
    return {
      name: 'qwen3-pro',
      maxTokens: 240,
      temperature: 0.7,
      topP: 0.95,
      topK: 20,
      enableThinking: true,
    }
  }

  return {
    name: 'qwen3-standard',
    maxTokens: 160,
    temperature: 0.7,
    topP: 0.9,
    topK: 0,
    enableThinking: false,
  }
}

/**
 * ============================================
 * 步骤4: 提取工具执行函数
 * Step 4: Extract Tool Execution Functions
 * ============================================
 */

/**
 * 解析 LLM 响应中的工具调用
 * Parse tool calls from LLM response
 *
 * @param response - LLM 的原始响应 / Raw LLM response
 * @returns 工具调用列表 / List of tool calls
 */
export function parseToolCalls(response: string): Result<ChatToolCall[]> {
  try {
    // 寻找 JSON 块 / Look for JSON blocks
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/)
    if (!jsonMatch) {
      return { ok: true, value: [] }
    }

    const toolCalls = JSON.parse(jsonMatch[1]) as ChatToolCall[]
    return { ok: true, value: toolCalls }
  } catch (error) {
    return {
      ok: false,
      error: 'PARSE_ERROR',
      message: `Failed to parse tool calls: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * 执行单个工具调用
 * Execute a single tool call
 *
 * @param toolCall - 工具调用对象 / Tool call object
 * @returns 执行日志 / Execution log
 *
 * @example
 * const log = await executeTool({ tool: 'updateSettings', args: {...} })
 * // { tool: 'updateSettings', success: true, message: '设置已更新' }
 */
export async function executeTool(toolCall: ChatToolCall): Promise<Result<ToolExecutionLog>> {
  const startTime = Date.now()

  try {
    switch (toolCall.tool) {
      case 'updateSettings':
        // 验证和执行设置更新
        // Validate and execute settings update
        return {
          ok: true,
          value: {
            tool: 'updateSettings',
            success: true,
            message: '设置已更新 / Settings updated',
            durationMs: Date.now() - startTime,
          },
        }

      case 'updateCalibration':
        return {
          ok: true,
          value: {
            tool: 'updateCalibration',
            success: true,
            message: '校准已更新 / Calibration updated',
            durationMs: Date.now() - startTime,
          },
        }

      default:
        return {
          ok: false,
          error: 'UNKNOWN_TOOL',
          message: `Unknown tool: ${toolCall.tool}`,
        }
    }
  } catch (error) {
    return {
      ok: false,
      error: 'EXECUTION_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * 执行所有工具调用
 * Execute all tool calls
 *
 * @param toolCalls - 工具调用列表 / List of tool calls
 * @returns 所有执行日志 / All execution logs
 */
export async function executeAllTools(toolCalls: ChatToolCall[]): Promise<ToolExecutionLog[]> {
  const results = await Promise.all(toolCalls.map((call) => executeTool(call)))

  return results
    .filter((result) => result.ok)
    .map((result) => {
      if (result.ok) {
        return result.value
      }
      throw new Error('Unexpected: filtered non-ok results')
    })
}

/**
 * ============================================
 * 步骤5: 主要的聊天生成函数（现在要简单得多）
 * Step 5: Main Chat Generation Function (Now Much Simpler)
 * ============================================
 */

export interface GenerateChatContentInput {
  question: string
  language: LanguageCode
  snapshot: SmartHomeSnapshot | null
  memories: MemoryEntry[]
  hasImageAttachment?: boolean
  isPro?: boolean
}

export interface GenerateChatContentOutput {
  reply: string
  toolExecutionLogs: ToolExecutionLog[]
}

/**
 * 生成聊天响应（简化版本）
 * Generate chat response (Simplified version)
 *
 * 这个函数现在只负责协调各个步骤
 * This function is now responsible only for coordinating the steps
 * 具体的逻辑被分解到了专门的函数中
 * Specific logic has been decomposed into dedicated functions
 *
 * @param input - 输入参数 / Input parameters
 * @returns 聊天响应和工具执行日志 / Chat response and tool execution logs
 *
 * @example
 * const result = await generateChatContent({
 *   question: '猫咪最近怎么样?',
 *   language: 'zh',
 *   snapshot: latestSnapshot,
 *   memories: relevantMemories,
 * })
 * // { reply: 'AI 的回复...', toolExecutionLogs: [...] }
 */
export async function generateChatContent(input: GenerateChatContentInput): Promise<Result<GenerateChatContentOutput>> {
  try {
    // 1. 提取上下文
    const context = extractChatContext(input.snapshot)

    // 2. 构建提示词
    const systemPrompt = buildSystemPrompt(input.language)

    // 3. 筛选相关记忆
    const relevantMemories = filterRelevantMemories(input.memories, input.question, 5)

    // 4. 构建消息历史
    const messageHistory = buildMessageHistory(relevantMemories, context)

    // 5. 选择模型
    const modelConfig = selectModel(input.isPro ?? false, input.hasImageAttachment ?? false)

    // 6. 调用 LLM（这里简化了，实际会调用真实的 LLM）
    // Call LLM (simplified here, would call real LLM in practice)
    const llmResponse = await callLLM(
      systemPrompt,
      messageHistory,
      input.question,
      modelConfig,
    )

    if (!llmResponse.ok) {
      return llmResponse
    }

    // 7. 解析工具调用
    const toolCallsResult = parseToolCalls(llmResponse.value)
    const toolCalls = toolCallsResult.ok ? toolCallsResult.value : []

    // 8. 执行工具
    const toolLogs = await executeAllTools(toolCalls)

    return {
      ok: true,
      value: {
        reply: extractReplyFromResponse(llmResponse.value),
        toolExecutionLogs: toolLogs,
      },
    }
  } catch (error) {
    return {
      ok: false,
      error: 'GENERATION_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * ============================================
 * 辅助函数 / Helper Functions
 * ============================================
 */

/**
 * 调用 LLM
 * Call the LLM
 */
async function callLLM(
  systemPrompt: string,
  messageHistory: string,
  question: string,
  config: ModelConfig,
): Promise<Result<string>> {
  // 实现 LLM 调用
  // Implement actual LLM call
  return {
    ok: true,
    value: 'LLM response...',
  }
}

/**
 * 从 LLM 响应中提取回复
 * Extract reply from LLM response
 */
function extractReplyFromResponse(response: string): string {
  // 移除 JSON 块并返回文本部分
  // Remove JSON blocks and return text part
  return response.replace(/```json\n[\s\S]*?\n```/g, '').trim()
}

/**
 * ============================================
 * 单元测试示例 / Unit Test Examples
 * ============================================
 *
 * 现在每个函数都可以独立测试
 * Now each function can be tested independently
 *
 * @example
 * // 测试上下文提取 / Test context extraction
 * test('extractChatContext should handle null snapshot', () => {
 *   const context = extractChatContext(null)
 *   expect(context.catPresent).toBe(false)
 * })
 *
 * // 测试记忆筛选 / Test memory filtering
 * test('filterRelevantMemories should return relevant memories', () => {
 *   const memories = [
 *     { id: 1, content: '猫咪喜欢吃鸡肉', type: 'note', ... },
 *     { id: 2, content: '今天天气很好', type: 'note', ... },
 *   ]
 *   const relevant = filterRelevantMemories(memories, '猫咪吃什么?')
 *   expect(relevant.length).toBe(1)
 *   expect(relevant[0].content).toContain('鸡肉')
 * })
 *
 * // 测试模型选择 / Test model selection
 * test('selectModel should return vision model when hasImage is true', () => {
 *   const config = selectModel(false, true)
 *   expect(config.name).toBe('qwen3-vl')
 * })
 *
 * // 测试完整流程 / Test full workflow
 * test('generateChatContent should return both reply and tool logs', async () => {
 *   const result = await generateChatContent({
 *     question: '猫咪好吗?',
 *     language: 'zh',
 *     snapshot: mockSnapshot,
 *     memories: [],
 *   })
 *   expect(result.ok).toBe(true)
 *   expect(result.value.reply).toBeTruthy()
 * })
 */

/**
 * ============================================
 * 迁移步骤 / Migration Steps
 * ============================================
 *
 * 1. 复制这个文件中的函数到 ai.ts
 *    Copy functions from this file to ai.ts
 *
 * 2. 更新原来的 generateChatContent 导出以使用新版本
 *    Update the original generateChatContent export to use the new version
 *
 * 3. 添加单元测试以确保功能相同
 *    Add unit tests to ensure functionality is the same
 *
 * 4. 逐步测试每个步骤
 *    Gradually test each step
 *
 * 5. 在使用 callLLM 等外部函数的地方集成真实实现
 *    Integrate real implementations where callLLM and other external functions are used
 */
