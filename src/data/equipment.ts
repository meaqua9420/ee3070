import { API_BASE_URL, postJson } from '../utils/backendClient'
import { runArduinoPing } from '../hardware/arduinoSerial'
import type { Language, TranslationKey } from '../i18n/translations'

export type EquipmentCategory =
  | 'network'
  | 'controller'
  | 'sensor'
  | 'display'
  | 'rfid'

export interface EquipmentItem {
  id: string
  category: EquipmentCategory
  translationKey: TranslationKey
  model: string
}

export interface EquipmentTestResult {
  id: string
  success: boolean
  latencyMs: number
  messageKey?: TranslationKey
}

const EQUIPMENT: EquipmentItem[] = [
  { id: 'router', category: 'network', translationKey: 'equipment.router', model: 'Wi-Fi Router' },
  { id: 'pc-ide', category: 'controller', translationKey: 'equipment.ide', model: 'PC + Arduino IDE' },
  { id: 'arduino', category: 'controller', translationKey: 'equipment.arduino', model: 'Arduino Mega/Micro' },
  { id: 'esp8266', category: 'network', translationKey: 'equipment.esp8266', model: 'ESP8266 Wi-Fi Module' },
  { id: 'light-sensor', category: 'sensor', translationKey: 'equipment.light', model: 'PGM5539 Light Sensor' },
  { id: 'temp-sensor', category: 'sensor', translationKey: 'equipment.temperature', model: 'LM35 Temperature Sensor' },
  { id: 'pressure-sensor', category: 'sensor', translationKey: 'equipment.pressure', model: 'RFP-602 Pressure Sensor' },
  { id: 'ultrasonic', category: 'sensor', translationKey: 'equipment.ultrasonic', model: 'HC-SR04 Ultrasonic Module' },
  { id: 'epaper', category: 'display', translationKey: 'equipment.epaper', model: '1.54" e-paper (GDEW0154T8)' },
  { id: 'oled', category: 'display', translationKey: 'equipment.oled', model: '0.96" I2C OLED' },
  { id: 'rfid-reader', category: 'rfid', translationKey: 'equipment.rfid.reader', model: 'MFRC522 Reader' },
  { id: 'rfid-card', category: 'rfid', translationKey: 'equipment.rfid.card', model: '1K PICC Card' },
  { id: 'rfid-tag', category: 'rfid', translationKey: 'equipment.rfid.tag', model: '1K PICC Tag' },
]

export function listEquipment() {
  return EQUIPMENT
}

export async function testEquipmentConnection(
  equipmentId: string,
  _language: Language,
): Promise<EquipmentTestResult> {
  const enableMocks =
    (import.meta.env.VITE_ENABLE_MOCKS ?? 'false').toString().toLowerCase() === 'true'

  if (equipmentId === 'arduino') {
    const result = await runArduinoPing()
    return {
      id: equipmentId,
      ...result,
    }
  }

  if (API_BASE_URL) {
    const response = await postJson<EquipmentTestResult>('/api/equipment/test', {
      id: equipmentId,
    })

    if (response.ok && response.data) {
      const { success = true, latencyMs = 0, messageKey } = response.data
      return {
        id: response.data.id ?? equipmentId,
        success,
        latencyMs,
        messageKey: messageKey ?? (success ? 'equipment.status.ok' : 'equipment.status.fail'),
      }
    }

    if (response.message) {
      console.warn('[equipment] Backend test failed', response.message)
    }
  }

  if (!enableMocks) {
    return {
      id: equipmentId,
      success: false,
      latencyMs: 0,
      messageKey: 'equipment.status.backendMissing',
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 600))

  const random = Math.random()
  const success = random > 0.15
  const latency = Math.round(50 + Math.random() * 120)

  return {
    id: equipmentId,
    success,
    latencyMs: latency,
    messageKey: success ? 'equipment.status.ok' : 'equipment.status.fail',
  }
}
