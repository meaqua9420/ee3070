/**
 * Ultra Mode API Endpoint
 *
 * To integrate: Add this in src/index.ts after line 5289:
 *
 * // 🚀 Ultra Mode Endpoint
 * app.post('/api/chat/ultra', chatLimiter, async (req, res) => {
 *   const requestId = Math.random().toString(36).slice(2)
 *   console.log(`[ultra] ${requestId} start`)
 *
 *   if (!requireAuthenticated(req, res)) return
 *
 *   try {
 *     const manager = getUltraManager()
 *     if (!manager) {
 *       res.status(503).json({ ok: false, message: 'Ultra mode not initialized' })
 *       return
 *     }
 *
 *     const { message, language = 'zh', catId } = req.body
 *
 *     if (typeof message !== 'string' || !message.trim()) {
 *       res.status(400).json({ ok: false, message: 'Invalid message' })
 *       return
 *     }
 *
 *     const requestedCatId = catId || activeCatId
 *     const snapshot = latestSnapshotsByCat.get(requestedCatId) ?? loadLatestSnapshot(requestedCatId)
 *     const memories = loadRelevantMemories(message, 5)
 *     const history = loadHistory(10, requestedCatId)
 *
 *     const acceptSSE = req.headers.accept?.includes('text/event-stream')
 *
 *     if (acceptSSE) {
 *       const sseConnection = globalSSEPool.createConnection(res, requestId)
 *       if (!sseConnection) {
 *         res.status(503).json({ ok: false, message: 'SSE connection pool full' })
 *         return
 *       }
 *
 *       const result = await manager.execute(
 *         {
 *           prompt: message,
 *           language: language as 'zh' | 'en',
 *           context: { snapshot, memories, history },
 *         },
 *         undefined,
 *         sseConnection
 *       )
 *
 *       sseConnection.send({
 *         type: 'done',
 *         data: {
 *           phases: result.phases,
 *           proFirstOutput: result.proFirstOutput,
 *           standardReview: result.standardReview,
 *           proFinalOutput: result.proFinalOutput,
 *           totalDurationMs: result.totalDurationMs,
 *           totalTokens: result.totalTokens,
 *         },
 *       })
 *
 *       sseConnection.close()
 *     } else {
 *       const result = await manager.execute({
 *         prompt: message,
 *         language: language as 'zh' | 'en',
 *         context: { snapshot, memories, history },
 *       })
 *
 *       res.json({
 *         ok: true,
 *         data: {
 *           text: result.proFinalOutput.text,
 *           phases: result.phases.map(p => ({
 *             phase: p.phase,
 *             description: p.description,
 *           })),
 *           metadata: {
 *             totalTokens: result.totalTokens,
 *             totalDurationMs: result.totalDurationMs,
 *             proFirstTokens: result.proFirstOutput.outputTokens,
 *             proFinalTokens: result.proFinalOutput.outputTokens,
 *             reviewConcerns: result.standardReview.concerns,
 *           },
 *         },
 *       })
 *     }
 *   } catch (error) {
 *     console.error(`[ultra] ${requestId} error:`, error)
 *     res.status(500).json({
 *       ok: false,
 *       message: error instanceof Error ? error.message : 'Internal error',
 *     })
 *   }
 * })
 */

export const ULTRA_ENDPOINT_CODE = `
// 🚀 Ultra Mode Endpoint - Dual-Model Collaborative Reasoning
app.post('/api/chat/ultra', chatLimiter, async (req, res) => {
  const requestId = Math.random().toString(36).slice(2)
  console.log(\`[ultra] \${requestId} start\`)

  if (!requireAuthenticated(req, res)) return

  try {
    const manager = getUltraManager()
    if (!manager) {
      res.status(503).json({ ok: false, message: 'Ultra mode not initialized' })
      return
    }

    const { message, language = 'zh', catId } = req.body

    if (typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ ok: false, message: 'Invalid message' })
      return
    }

    const requestedCatId = catId || activeCatId
    const snapshot = latestSnapshotsByCat.get(requestedCatId) ?? loadLatestSnapshot(requestedCatId)
    const memories = loadRelevantMemories(message, 5)
    const history = loadHistory(10, requestedCatId)

    const acceptSSE = req.headers.accept?.includes('text/event-stream')

    if (acceptSSE) {
      const sseConnection = globalSSEPool.createConnection(res, requestId)
      if (!sseConnection) {
        res.status(503).json({ ok: false, message: 'SSE connection pool full' })
        return
      }

      const result = await manager.execute(
        {
          prompt: message,
          language: language as 'zh' | 'en',
          context: { snapshot, memories, history },
        },
        undefined,
        sseConnection
      )

      sseConnection.send({
        type: 'done',
        data: {
          phases: result.phases,
          proFirstOutput: result.proFirstOutput,
          standardReview: result.standardReview,
          proFinalOutput: result.proFinalOutput,
          totalDurationMs: result.totalDurationMs,
          totalTokens: result.totalTokens,
        },
      })

      sseConnection.close()
    } else {
      const result = await manager.execute({
        prompt: message,
        language: language as 'zh' | 'en',
        context: { snapshot, memories, history },
      })

      res.json({
        ok: true,
        data: {
          text: result.proFinalOutput.text,
          phases: result.phases.map(p => ({
            phase: p.phase,
            description: p.description,
          })),
          metadata: {
            totalTokens: result.totalTokens,
            totalDurationMs: result.totalDurationMs,
            proFirstTokens: result.proFirstOutput.outputTokens,
            proFinalTokens: result.proFinalOutput.outputTokens,
            reviewConcerns: result.standardReview.concerns,
          },
        },
      })
    }
  } catch (error) {
    console.error(\`[ultra] \${requestId} error:\`, error)
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Internal error',
    })
  }
})
`
