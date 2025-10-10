import { useLanguage } from '../i18n/LanguageProvider'

export function UsageGuide() {
  const { t } = useLanguage()

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>{t('usage.title')}</h2>
        <p>{t('usage.subtitle')}</p>
      </header>
      <ol className="guide-list">
        <li>{t('usage.step1')}</li>
        <li>{t('usage.step2')}</li>
        <li>{t('usage.step3')}</li>
        <li>{t('usage.step4')}</li>
        <li>{t('usage.step5')}</li>
        <li>{t('usage.step6')}</li>
      </ol>
    </section>
  )
}
