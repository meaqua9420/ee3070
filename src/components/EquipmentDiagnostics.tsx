import { useMemo } from 'react'
import { useLanguage } from '../i18n/LanguageProvider'
import { useEquipmentDiagnostics } from '../hooks/useEquipmentDiagnostics'
import type { EquipmentCategory } from '../data/equipment'
import type { TranslationKey } from '../i18n/translations'

const CATEGORY_KEYS: Record<EquipmentCategory, TranslationKey> = {
  network: 'equipment.category.network',
  controller: 'equipment.category.controller',
  sensor: 'equipment.category.sensor',
  display: 'equipment.category.display',
  rfid: 'equipment.category.rfid',
}

export function EquipmentDiagnostics() {
  const { language, t } = useLanguage()
  const { items, runTest, runAll, busy } = useEquipmentDiagnostics(language)

  const grouped = useMemo(() => {
    return items.reduce<Record<EquipmentCategory, typeof items>>((acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = []
      }
      acc[item.category].push(item)
      return acc
    }, {} as Record<EquipmentCategory, typeof items>)
  }, [items])

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>{t('equipment.title')}</h2>
        <p>{t('equipment.subtitle')}</p>
      </header>
      <div className="equipment-actions">
        <button type="button" className="action-button" onClick={() => runAll()} disabled={busy}>
          {busy ? t('equipment.testing') : t('equipment.testAll')}
        </button>
      </div>
      <div className="equipment-groups">
        {Object.entries(grouped).map(([category, list]) => (
          <div key={category} className="equipment-group">
            <h3>{t(CATEGORY_KEYS[category as EquipmentCategory])}</h3>
            <ul>
              {list.map((item) => (
                <li key={item.id}>
                  <div className="equipment-item__info">
                    <strong>{t(item.translationKey)}</strong>
                    <span>{item.model}</span>
                  </div>
                  <div className="equipment-item__actions">
                    <span
                      className={`badge${
                        item.lastResult
                          ? item.lastResult.success
                            ? ' badge--ok'
                            : ' badge--warn'
                          : ''
                      }`}
                    >
                      {item.lastResult
                        ? t(
                            item.lastResult.messageKey ??
                              (item.lastResult.success
                                ? 'equipment.status.ok'
                                : 'equipment.status.fail'),
                            {
                              latency:
                                item.lastResult.latencyMs && item.lastResult.latencyMs > 0
                                  ? item.lastResult.latencyMs
                                  : '--',
                            },
                          )
                        : t('equipment.status.unknown')}
                    </span>
                    <button
                      type="button"
                      className="action-button action-button--ghost"
                      disabled={item.loading}
                      onClick={() => runTest(item.id)}
                    >
                      {item.loading ? t('equipment.testing') : t('equipment.testOne')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
