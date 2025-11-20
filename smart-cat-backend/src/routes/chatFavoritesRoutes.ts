import { Router } from 'express'
import type { ChatFavoritesService } from '../services/chatFavoritesService'
import { logger } from '../logger'

export function createChatFavoritesRouter(service: ChatFavoritesService): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    const favorites = service.list()
    res.json({ ok: true, data: favorites })
  })

  router.post('/', (req, res) => {
    const result = service.create(req.body)
    if (!result.ok) {
      logger.warn('[chatFavorites] Failed to create favorite', { reason: result.message })
      res.status(result.status ?? 400).json({ ok: false, message: result.message })
      return
    }
    res.status(201).json({ ok: true, data: result.data })
  })

  router.delete('/:id', (req, res) => {
    const result = service.remove(
      req.params.id,
      typeof req.query.messageId === 'string' ? req.query.messageId : undefined,
    )
    if (!result.ok) {
      res.status(result.status ?? 400).json({ ok: false, message: result.message })
      return
    }
    res.json({ ok: true })
  })

  return router
}
