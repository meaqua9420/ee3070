import { useEffect, useState } from 'react'
import { useLanguage } from '../i18n/LanguageProvider'
import type { SmartHomeSettings } from '../types/smartHome'

interface ControlPanelProps {
  settings: SmartHomeSettings
  onUpdate: (next: SmartHomeSettings) => void
  disabled?: boolean
}

const AUTO_PRESET: SmartHomeSettings = {
  autoMode: true,
  targetTemperatureC: 24,
  targetHumidityPercent: 55,
  waterBowlLevelTargetMl: 220,
  feederSchedule: '08:00, 13:00, 20:00',
  purifierIntensity: 'medium',
}

export function ControlPanel({ settings, onUpdate, disabled }: ControlPanelProps) {
  const { t } = useLanguage()
  const [formState, setFormState] = useState(settings)

  useEffect(() => {
    setFormState(settings)
  }, [settings])

  const handleChange = <K extends keyof SmartHomeSettings>(
    key: K,
    value: SmartHomeSettings[K],
  ) => {
    setFormState((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onUpdate(formState)
  }

  const applyAutoPreset = () => {
    onUpdate(AUTO_PRESET)
  }

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>{t('control.title')}</h2>
        <p>{t('control.subtitle')}</p>
      </header>
      <form className="control-form" onSubmit={handleSubmit}>
        <label className="control-form__switch">
          <span>{t('control.auto')}</span>
          <input
            type="checkbox"
            checked={formState.autoMode}
            onChange={(event) => handleChange('autoMode', event.target.checked)}
            disabled={disabled}
          />
        </label>

        <div className="control-form__grid">
          <label>
            {t('control.temperature')}
            <input
              type="number"
              min={18}
              max={32}
              value={formState.targetTemperatureC}
              onChange={(event) =>
                handleChange('targetTemperatureC', Number(event.target.value))
              }
              disabled={disabled || formState.autoMode}
            />
          </label>

          <label>
            {t('control.humidity')}
            <input
              type="number"
              min={30}
              max={80}
              value={formState.targetHumidityPercent}
              onChange={(event) =>
                handleChange('targetHumidityPercent', Number(event.target.value))
              }
              disabled={disabled || formState.autoMode}
            />
          </label>

          <label>
            {t('control.water')}
            <input
              type="number"
              min={80}
              max={400}
              step={10}
              value={formState.waterBowlLevelTargetMl}
              onChange={(event) =>
                handleChange('waterBowlLevelTargetMl', Number(event.target.value))
              }
              disabled={disabled || formState.autoMode}
            />
          </label>

          <label>
            {t('control.schedule')}
            <input
              type="text"
              value={formState.feederSchedule}
              onChange={(event) => handleChange('feederSchedule', event.target.value)}
              placeholder="08:00, 13:00, 20:00"
              disabled={disabled}
            />
          </label>

          <label>
            {t('control.purifier')}
            <select
              value={formState.purifierIntensity}
              onChange={(event) =>
                handleChange(
                  'purifierIntensity',
                  event.target.value as SmartHomeSettings['purifierIntensity'],
                )
              }
              disabled={disabled}
            >
              <option value="low">{t('control.purifier.low')}</option>
              <option value="medium">{t('control.purifier.medium')}</option>
              <option value="high">{t('control.purifier.high')}</option>
            </select>
          </label>
        </div>

        <div className="control-form__actions">
          <button type="button" onClick={applyAutoPreset} disabled={disabled}>
            {t('control.applyPreset')}
          </button>
          <button type="submit" className="primary" disabled={disabled}>
            {t('control.save')}
          </button>
        </div>
      </form>
    </section>
  )
}
