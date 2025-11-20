/**
 * proMaxManager.ts
 *
 * Pro Max Dual-Model System
 *
 * Features:
 * - Parallel invocation of standard + pro models
 * - Real-time streaming merge
 * - Token-level comparison
 * - Quality scoring and auto-selection
 * - Side-by-side display support
 */

import type { ModelTierConfig } from './config'
import type { SSEConnection } from './streaming'

export type ModelTier = 'standard' | 'pro'

export interface DualModelResponse {
  standard: {
    text: string
    tokens: number
    durationMs: number
    complete: boolean
  }
  pro: {
    text: string
    tokens: number
    durationMs: number
    complete: boolean
  }
  selected?: ModelTier
  confidenceScore?: number
}

export interface ProMaxStreamHandler {
  onStandardToken?: (token: string, fullText: string) => void
  onProToken?: (token: string, fullText: string) => void
  onStandardComplete?: (text: string, metadata: ResponseMetadata) => void
  onProComplete?: (text: string, metadata: ResponseMetadata) => void
  onBothComplete?: (result: DualModelResponse) => void
  onError?: (error: Error, model: ModelTier) => void
}

export interface ResponseMetadata {
  tokens: number
  durationMs: number
  modelReference: string
  thinkingTokens?: number
  maxTokens?: number
}

export interface ModelInvocationParams {
  prompt: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  stopSequences?: string[]
}

/**
 * Quality scoring heuristics for auto-selection
 */
export class ResponseQualityScorer {
  /**
   * Calculate quality score (0-100)
   */
  static score(text: string, metadata: ResponseMetadata): number {
    let score = 50 // Base score

    // Length factor (prefer detailed responses, but not excessively verbose)
    const wordCount = text.split(/\s+/).length
    if (wordCount > 50 && wordCount < 500) {
      score += 10
    } else if (wordCount >= 500) {
      score += 5
    } else if (wordCount < 20) {
      score -= 10
    }

    // Structure factor (prefer formatted responses)
    const hasLists = /^[\s]*[-*•]\s/m.test(text)
    const hasNumberedLists = /^[\s]*\d+\.\s/m.test(text)
    const hasHeaders = /^#{1,3}\s/m.test(text)
    if (hasLists || hasNumberedLists) score += 5
    if (hasHeaders) score += 5

    // Citation factor (prefer responses with evidence)
    const hasCitations = /\[.*\]|\(.*\)|「.*」|『.*』/.test(text)
    if (hasCitations) score += 10

    // Thinking tokens (pro model advantage)
    if (metadata.thinkingTokens && metadata.thinkingTokens > 50) {
      score += 15
    }

    // Language quality (penalize excessive repetition)
    const sentences = text.split(/[。.!?！？]/g).filter(s => s.trim().length > 0)
    const uniqueSentences = new Set(sentences).size
    if (sentences.length > 0) {
      const diversityRatio = uniqueSentences / sentences.length
      if (diversityRatio < 0.5) {
        score -= 20 // High repetition penalty
      } else if (diversityRatio > 0.9) {
        score += 10 // High diversity bonus
      }
    }

    // Completion factor (penalize truncated responses)
    const endsNaturally = /[。.!?！？\n]\s*$/.test(text.trim())
    if (!endsNaturally && metadata.tokens >= (metadata.maxTokens || 2048) * 0.95) {
      score -= 15 // Likely truncated
    }

    return Math.max(0, Math.min(100, score))
  }

  /**
   * Select better response based on quality scores
   */
  static selectBetter(
    standardText: string,
    standardMeta: ResponseMetadata,
    proText: string,
    proMeta: ResponseMetadata
  ): { selected: ModelTier; confidence: number; standardScore: number; proScore: number } {
    const standardScore = this.score(standardText, standardMeta)
    const proScore = this.score(proText, proMeta)

    const selected: ModelTier = proScore > standardScore ? 'pro' : 'standard'
    const confidence = Math.abs(proScore - standardScore)

    return { selected, confidence, standardScore, proScore }
  }
}

/**
 * Pro Max Manager - Orchestrates dual-model invocation
 */
export class ProMaxManager {
  private standardConfig: ModelTierConfig
  private proConfig: ModelTierConfig

  constructor(standardConfig: ModelTierConfig, proConfig: ModelTierConfig) {
    this.standardConfig = standardConfig
    this.proConfig = proConfig
  }

  /**
   * Invoke both models in parallel with streaming
   */
  async invokeDual(
    params: ModelInvocationParams,
    handlers: ProMaxStreamHandler,
    sseConnection?: SSEConnection
  ): Promise<DualModelResponse> {
    const startTime = Date.now()

    // State tracking
    const state: DualModelResponse = {
      standard: { text: '', tokens: 0, durationMs: 0, complete: false },
      pro: { text: '', tokens: 0, durationMs: 0, complete: false },
    }

    // Notify SSE clients
    if (sseConnection) {
      sseConnection.sendPhase(
        'generating_response',
        JSON.stringify({
          mode: 'pro_max',
          models: ['standard', 'pro'],
        }),
      )
    }

    // Launch both models in parallel
    const standardPromise = this.invokeModel('standard', params, (token) => {
      state.standard.text += token
      state.standard.tokens++
      handlers.onStandardToken?.(token, state.standard.text)

      if (sseConnection) {
        sseConnection.send({
          type: 'token',
          data: { token, model: 'standard', fullText: state.standard.text },
        })
      }
    }).then((metadata) => {
      state.standard.durationMs = Date.now() - startTime
      state.standard.complete = true
      handlers.onStandardComplete?.(state.standard.text, metadata)

      if (sseConnection) {
        sseConnection.send({
          type: 'metadata',
          data: { model: 'standard', complete: true, metadata },
        })
      }

      return metadata
    }).catch((error) => {
      handlers.onError?.(error, 'standard')
      if (sseConnection) {
        sseConnection.sendError(error.message, 'standard')
      }
      throw error
    })

    const proPromise = this.invokeModel('pro', params, (token) => {
      state.pro.text += token
      state.pro.tokens++
      handlers.onProToken?.(token, state.pro.text)

      if (sseConnection) {
        sseConnection.send({
          type: 'token',
          data: { token, model: 'pro', fullText: state.pro.text },
        })
      }
    }).then((metadata) => {
      state.pro.durationMs = Date.now() - startTime
      state.pro.complete = true
      handlers.onProComplete?.(state.pro.text, metadata)

      if (sseConnection) {
        sseConnection.send({
          type: 'metadata',
          data: { model: 'pro', complete: true, metadata },
        })
      }

      return metadata
    }).catch((error) => {
      handlers.onError?.(error, 'pro')
      if (sseConnection) {
        sseConnection.sendError(error.message, 'pro')
      }
      throw error
    })

    // Wait for both to complete
    const [standardMeta, proMeta] = await Promise.all([standardPromise, proPromise])

    // Auto-select better response
    const selection = ResponseQualityScorer.selectBetter(
      state.standard.text,
      { ...standardMeta, tokens: state.standard.tokens, durationMs: state.standard.durationMs },
      state.pro.text,
      { ...proMeta, tokens: state.pro.tokens, durationMs: state.pro.durationMs }
    )

    state.selected = selection.selected
    state.confidenceScore = selection.confidence

    handlers.onBothComplete?.(state)

    if (sseConnection) {
      sseConnection.send({
        type: 'metadata',
        data: {
          proMaxComplete: true,
          selected: state.selected,
          confidence: state.confidenceScore,
          scores: {
            standard: selection.standardScore,
            pro: selection.proScore,
          },
        },
      })
    }

    return state
  }

  /**
   * Invoke single model with streaming
   */
  private async invokeModel(
    tier: ModelTier,
    params: ModelInvocationParams,
    onToken: (token: string) => void
  ): Promise<ResponseMetadata> {
    const config = tier === 'standard' ? this.standardConfig : this.proConfig
    const startTime = Date.now()

    // Build request payload
    const payload = {
      model: config.serverModel,
      prompt: params.prompt,
      system: params.systemPrompt,
      temperature: params.temperature ?? config.temperature,
      max_tokens: params.maxTokens ?? config.maxTokens,
      top_p: config.topP,
      top_k: config.topK,
      min_p: config.minP,
      presence_penalty: config.presencePenalty,
      stop: params.stopSequences || [],
      stream: true,
    }

    // HTTP request with streaming
    const response = await fetch(config.serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Model ${tier} invocation failed: ${response.status} ${response.statusText}`)
    }

    if (!response.body) {
      throw new Error(`Model ${tier} response body is null`)
    }

    // Parse streaming response
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let tokenCount = 0
    let thinkingTokens = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) continue
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim()
            if (dataStr === '[DONE]') break

            try {
              const data = JSON.parse(dataStr)
              const token = data.choices?.[0]?.delta?.content || ''
              if (token) {
                onToken(token)
                tokenCount++
              }

              // Track thinking tokens (if model supports it)
              if (data.choices?.[0]?.delta?.thinking) {
                thinkingTokens++
              }
            } catch (parseError) {
              console.warn(`Failed to parse streaming chunk: ${dataStr}`)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    return {
      tokens: tokenCount,
      durationMs: Date.now() - startTime,
      modelReference: config.modelReference,
      thinkingTokens,
    }
  }
}

/**
 * Singleton instance
 */
let proMaxManagerInstance: ProMaxManager | null = null

export function initializeProMaxManager(
  standardConfig: ModelTierConfig,
  proConfig: ModelTierConfig
): ProMaxManager {
  proMaxManagerInstance = new ProMaxManager(standardConfig, proConfig)
  return proMaxManagerInstance
}

export function getProMaxManager(): ProMaxManager | null {
  return proMaxManagerInstance
}
