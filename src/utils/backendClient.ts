import type { Language } from '../i18n/translations'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
export const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_BASE_URL ?? ''
export const OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL ?? ''

export interface ApiResult {
  ok: boolean
  status?: number
  message?: string
}

export interface ApiResultWithData<T> extends ApiResult {
  data?: T
}

async function request<T>(
  path: string,
  init: RequestInit,
): Promise<ApiResultWithData<T>> {
  if (!API_BASE_URL) {
    console.warn('[backend] Missing VITE_API_BASE_URL, skipping request for', path)
    return { ok: false, message: 'API base URL not configured' }
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      cache: 'no-store',
      ...init,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return {
        ok: false,
        status: response.status,
        message: text || response.statusText,
      }
    }

    let data: unknown
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => undefined)
    }

    const payload =
      data && typeof data === 'object' && data !== null && 'data' in (data as Record<string, unknown>)
        ? (data as { data: unknown }).data
        : data
    const message =
      data && typeof data === 'object' && data !== null && 'message' in (data as Record<string, unknown>)
        ? String((data as { message: unknown }).message ?? '')
        : undefined
    return {
      ok: true,
      status: response.status,
      data: payload as T,
      message: message && message.length > 0 ? message : undefined,
    }
  } catch (error) {
    console.warn('[backend] Request failed', path, error)
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export function getJson<T>(path: string): Promise<ApiResultWithData<T>> {
  return request<T>(path, { method: 'GET' })
}

export function postJson<T>(path: string, body: unknown): Promise<ApiResultWithData<T>> {
  return request<T>(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

export async function saveLanguagePreference(language: Language) {
  return postJson('/api/preferences/language', { language })
}

export async function registerPushSubscription(
  subscription: PushSubscription,
  language: Language,
) {
  return postJson('/api/push-subscriptions', {
    language,
    subscription: subscription.toJSON(),
  })
}

export interface ChatMessagePayload {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export async function fetchChatSuggestions(messages: ChatMessagePayload[]) {
  if (API_BASE_URL) {
    return postJson<{ choices?: Array<{ message: ChatMessagePayload }> }>(
      '/api/chat/suggestions',
      { messages },
    )
  }

  if (OLLAMA_BASE_URL && OLLAMA_MODEL) {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages,
          stream: false,
        }),
      })

      if (!response.ok) {
        const message = await response.text().catch(() => response.statusText)
        return { ok: false, status: response.status, message }
      }

      const data = (await response.json()) as {
        message?: ChatMessagePayload
      }

      return {
        ok: true,
        status: 200,
        data: data.message
          ? { choices: [{ message: data.message }] }
          : { choices: [] },
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return {
    ok: false,
    message:
      'No AI backend configured. Set VITE_API_BASE_URL or VITE_OLLAMA_BASE_URL/VITE_OLLAMA_MODEL.',
  }
}
