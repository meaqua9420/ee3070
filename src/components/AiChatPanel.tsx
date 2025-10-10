import { useMemo, useState } from 'react'
import { useAiChat } from '../hooks/useAiChat'
import { useLanguage } from '../i18n/LanguageProvider'

export function AiChatPanel() {
  const { t, language } = useLanguage()
  const [input, setInput] = useState('')
  const { canChat, messages, loading, error, sendMessage, resetChat } = useAiChat(language)

  const sortedMessages = useMemo(
    () =>
      messages.map((message) => ({
        ...message,
        variant: message.role === 'assistant' ? 'assistant' : 'user',
      })),
    [messages],
  )

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    sendMessage(input)
    setInput('')
  }

  return (
    <section className="panel ai-chat-panel">
      <header className="panel__header">
        <h2>{t('chat.launch')}</h2>
        <p>{t('chat.system.disclaimer')}</p>
      </header>

      <div className="ai-chat__messages">
        {sortedMessages.length === 0 ? (
          <div className="ai-chat__empty">{t('chat.empty')}</div>
        ) : (
          <ul>
            {sortedMessages.map((message) => (
              <li key={message.id} className={`ai-chat__bubble ai-chat__bubble--${message.variant}`}>
                <span>{message.content}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? (
        <div className="error-banner ai-chat__error">
          {t('chat.error')}
          <button type="button" onClick={resetChat} className="action-link">
            {t('chat.retry')}
          </button>
        </div>
      ) : null}

      <form className="ai-chat__composer" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder={t('chat.placeholder')}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={!canChat || loading}
        />
        <button type="submit" className="action-button" disabled={!canChat || loading || !input.trim()}>
          {loading ? t('chat.loading') : t('chat.send')}
        </button>
      </form>

      {!canChat ? (
        <div className="ai-chat__notice">
          {t('chat.system.greeting')}
          <br />
          <small>{t('chat.system.backendRequired')}</small>
        </div>
      ) : null}
    </section>
  )
}
