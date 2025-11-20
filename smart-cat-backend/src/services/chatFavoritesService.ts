import type { ChatFavorite } from '../types'
import { listChatFavorites, saveChatFavorite, deleteChatFavorite } from '../db'
import { validateChatFavorite } from '../validators'

export interface CreateFavoriteResult {
  ok: boolean
  status?: number
  message?: string
  data?: ChatFavorite
}

export class ChatFavoritesService {
  list(): ChatFavorite[] {
    return listChatFavorites()
  }

  create(payload: unknown): CreateFavoriteResult {
    const validation = validateChatFavorite(payload)
    if (!validation.ok) {
      return { ok: false, status: 400, message: validation.message }
    }

    const { role, content } = validation.value
    const { messageId, metadata } = (payload as Record<string, unknown>) ?? {}

    if (messageId !== undefined && typeof messageId !== 'string') {
      return { ok: false, status: 400, message: 'invalid-message-id' }
    }

    if (metadata && typeof metadata !== 'object') {
      return { ok: false, status: 400, message: 'invalid-metadata' }
    }

    const record: {
      messageId?: string | null
      role: ChatFavorite['role']
      content: string
      metadata?: Record<string, unknown>
    } = {
      role,
      content,
    }

    if (typeof messageId === 'string' && messageId.length > 0) {
      record.messageId = messageId
    }
    if (metadata && typeof metadata === 'object') {
      record.metadata = metadata as Record<string, unknown>
    }

    const favorite = saveChatFavorite(record)
    return { ok: true, data: favorite }
  }

  remove(idParam: string | undefined, messageIdParam: string | undefined) {
    const numericId = idParam ? Number(idParam) : NaN
    const messageId = messageIdParam && messageIdParam.length > 0 ? messageIdParam : undefined

    if (!Number.isFinite(numericId) && !messageId) {
      return { ok: false, status: 400, message: 'invalid-id' }
    }

    const payload: { id?: number; messageId?: string | null } = {}
    if (Number.isFinite(numericId)) {
      payload.id = numericId
    }
    if (messageId) {
      payload.messageId = messageId
    }
    deleteChatFavorite(payload)
    return { ok: true }
  }
}
