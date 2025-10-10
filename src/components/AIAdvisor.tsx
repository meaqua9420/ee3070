import { useLanguage } from '../i18n/LanguageProvider'
import type { SmartHomeSnapshot } from '../types/smartHome'
import { generateInsights } from '../utils/aiAdvisor'

interface AIAdvisorProps {
  snapshot: SmartHomeSnapshot | null
}

export function AIAdvisor({ snapshot }: AIAdvisorProps) {
  const { t } = useLanguage()
  const insights = generateInsights(snapshot, t)

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>{t('ai.title')}</h2>
        <p>{t('ai.subtitle')}</p>
      </header>
      <ul className="insight-list">
        {insights.map((insight, idx) => (
          <li key={idx} className={`insight insight--${insight.severity}`}>
            <div className="insight__badge">
              {t(
                insight.severity === 'critical'
                  ? 'ai.severity.critical'
                  : insight.severity === 'warning'
                    ? 'ai.severity.warning'
                    : 'ai.severity.info',
              )}
            </div>
            <div>
              <h3>{insight.title}</h3>
              <p>{insight.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
