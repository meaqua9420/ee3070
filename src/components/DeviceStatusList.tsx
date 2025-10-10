import { useLanguage } from '../i18n/LanguageProvider'
import type { DeviceStatus } from '../types/smartHome'
import type { TranslationKey } from '../i18n/translations'

interface DeviceStatusListProps {
  status: DeviceStatus
}

const LABEL_KEYS: Record<keyof DeviceStatus, TranslationKey> = {
  heaterOn: 'device.labels.heater',
  humidifierOn: 'device.labels.humidifier',
  waterPumpOn: 'device.labels.waterPump',
  feederActive: 'device.labels.feeder',
  purifierOn: 'device.labels.purifier',
}

export function DeviceStatusList({ status }: DeviceStatusListProps) {
  const { t } = useLanguage()

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>{t('device.title')}</h2>
        <p>{t('device.subtitle')}</p>
      </header>
      <ul className="device-status">
        {Object.entries(status).map(([key, value]) => {
          const typedKey = key as keyof DeviceStatus
          return (
            <li key={key} className={value ? 'on' : 'off'}>
              <span>{t(LABEL_KEYS[typedKey])}</span>
              <strong>{value ? t('device.state.on') : t('device.state.off')}</strong>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
