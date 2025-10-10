import { useCallback, useMemo, useState } from 'react'
import type { ChatMessagePayload } from '../utils/backendClient'
import {
  fetchChatSuggestions,
  API_BASE_URL,
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,
} from '../utils/backendClient'
import type { Language } from '../i18n/translations'

export type ChatMessage = ChatMessagePayload & { id: string }

function createId() {
  return Math.random().toString(36).slice(2)
}

export function useAiChat(language: Language) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canChat = useMemo(
    () => Boolean(API_BASE_URL || (OLLAMA_BASE_URL && OLLAMA_MODEL)),
    [],
  )

  const systemMessage = useMemo<ChatMessagePayload>(() => {
    if (language === 'zh') {
      return {
        role: 'system',
        content:
          '你是 Smart Cat Home 智慧貓屋 AI 顧問。請利用提供的感測讀數、Autoset 目標與對話上下文，產出「簡潔、可立即執行」的照護建議。回覆時務必遵守：\n\n1. 以 **快速摘要** 開頭，列出目前掌握的關鍵指標（例如溫度、濕度、飲水量、活動量或睡眠品質）。\n2. 接著以編號或條列方式提供 3-5 項具體行動，適度引用 autoset 控制（調整環境、補水、餵食、提醒玩耍等），涵蓋當前狀況與預防建議。\n3. 如感測資料顯示潛在風險或緊急症狀，必須清楚標註「需立即聯絡獸醫」。\n4. 若資訊不足，請詢問缺少的內容並說明原因。保持語氣友善且專業。\n5. 回覆使用繁體中文，並在結尾提供一句關懷或後續協助的詢問。',
      }
    }

    return {
      role: 'system',
      content:
        'You are the Smart Cat Home AI advisor. Use provided sensor readings, autoset targets, and chat history to produce concise, immediately actionable care guidance. Follow these rules:\n\n1. Begin with a **Quick Summary** covering key metrics you know (temperature, humidity, hydration, activity, sleep, etc.).\n2. Give 3-5 numbered or bulleted action items grounded in the data, referencing autoset controls (environment, water, feeding, enrichment).\n3. If readings imply risk or abnormal behavior, clearly flag that the owner should contact a veterinarian immediately.\n4. Request missing information when needed and explain why, while keeping a friendly, professional tone.\n5. Respond in English and close by offering further assistance.',
    }
  }, [language])

  const sendMessage = useCallback(
    async (question: string) => {
      const trimmed = question.trim()
      if (!trimmed) return

      setError(null)

      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        content: trimmed,
      }

      setMessages((prev) => [...prev, userMessage])

      if (!API_BASE_URL && !(OLLAMA_BASE_URL && OLLAMA_MODEL)) {
        return
      }

      setLoading(true)
      try {
        const history: ChatMessagePayload[] = [systemMessage]
        history.push(
          ...messages.map(({ role, content }) => ({ role, content })),
          { role: 'user', content: trimmed },
        )

        const response = await fetchChatSuggestions(history)
        if (!response.ok) {
          throw new Error(response.message ?? 'Chat request failed')
        }

        const choice = response.data?.choices?.[0]?.message
        if (choice) {
          setMessages((prev) => [
            ...prev,
            {
              id: createId(),
              role: choice.role,
              content: choice.content,
            },
          ])
        }
      } catch (err) {
        console.warn('[chat] failed', err)
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [messages, systemMessage],
  )

  const resetChat = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return {
    canChat,
    messages,
    loading,
    error,
    sendMessage,
    resetChat,
  }
}
