export type TranslationKey =
  | 'app.title'
  | 'app.subtitle'
  | 'app.lastUpdated'
  | 'app.noUpdate'
  | 'app.refresh'
  | 'app.refreshLoading'
  | 'app.notifications.enable'
  | 'app.notifications.enabled'
  | 'notifications.success'
  | 'notifications.denied'
  | 'notifications.unsupported'
  | 'notifications.swUnsupported'
  | 'notifications.permissionRequired'
  | 'notifications.vapidMissing'
  | 'notifications.error'
  | 'errors.fetch'
  | 'errors.settings'
  | 'errors.backendMissing'
  | 'panel.realtime.title'
  | 'panel.realtime.subtitle'
  | 'data.temperature.title'
  | 'data.temperature.footer'
  | 'data.humidity.title'
  | 'data.humidity.footer'
  | 'data.water.title'
  | 'data.water.footer'
  | 'data.weight.title'
  | 'data.weight.footer'
  | 'data.aqi.title'
  | 'data.aqi.footer'
  | 'data.feeding.title'
  | 'data.feeding.footer'
  | 'control.title'
  | 'control.subtitle'
  | 'control.auto'
  | 'control.temperature'
  | 'control.humidity'
  | 'control.water'
  | 'control.schedule'
  | 'control.purifier'
  | 'control.purifier.low'
  | 'control.purifier.medium'
  | 'control.purifier.high'
  | 'control.applyPreset'
  | 'control.save'
  | 'device.title'
  | 'device.subtitle'
  | 'device.labels.heater'
  | 'device.labels.humidifier'
  | 'device.labels.waterPump'
  | 'device.labels.feeder'
  | 'device.labels.purifier'
  | 'device.state.on'
  | 'device.state.off'
  | 'history.title'
  | 'history.subtitle'
  | 'history.avgTemperature'
  | 'history.range'
  | 'history.avgHumidity'
  | 'history.samples'
  | 'history.totalWater'
  | 'history.totalWaterNote'
  | 'history.lastSync'
  | 'history.lastSyncNote'
  | 'ai.title'
  | 'ai.subtitle'
  | 'ai.severity.info'
  | 'ai.severity.warning'
  | 'ai.severity.critical'
  | 'ai.insight.hot.title'
  | 'ai.insight.hot.body'
  | 'ai.insight.cold.title'
  | 'ai.insight.cold.body'
  | 'ai.insight.humidHigh.title'
  | 'ai.insight.humidHigh.body'
  | 'ai.insight.humidLow.title'
  | 'ai.insight.humidLow.body'
  | 'ai.insight.waterLow.title'
  | 'ai.insight.waterLow.body'
  | 'ai.insight.aqi.title'
  | 'ai.insight.aqi.body'
  | 'ai.insight.feeding.title'
  | 'ai.insight.feeding.body'
  | 'ai.insight.autoset.title'
  | 'ai.insight.autoset.body'
  | 'ai.insight.good.title'
  | 'ai.insight.good.body'
  | 'usage.title'
  | 'usage.subtitle'
  | 'usage.step1'
  | 'usage.step2'
  | 'usage.step3'
  | 'usage.step4'
  | 'usage.step5'
  | 'usage.step6'
  | 'settings.button'
  | 'settings.language'
  | 'settings.language.zh'
  | 'settings.language.en'
  | 'chat.launch'
  | 'chat.placeholder'
  | 'chat.send'
  | 'chat.empty'
  | 'chat.loading'
  | 'chat.error'
  | 'chat.retry'
  | 'chat.system.greeting'
  | 'chat.system.disclaimer'
  | 'chat.system.backendRequired'
  | 'equipment.title'
  | 'equipment.subtitle'
  | 'equipment.testAll'
  | 'equipment.testOne'
  | 'equipment.testing'
  | 'equipment.status.ok'
  | 'equipment.status.fail'
  | 'equipment.status.unknown'
  | 'equipment.status.backendMissing'
  | 'equipment.status.serialUnsupported'
  | 'equipment.status.serialDenied'
  | 'equipment.status.arduinoTimeout'
  | 'equipment.status.arduinoError'
  | 'equipment.status.arduinoUnexpected'
  | 'equipment.category.network'
  | 'equipment.category.controller'
  | 'equipment.category.sensor'
  | 'equipment.category.display'
  | 'equipment.category.rfid'
  | 'equipment.router'
  | 'equipment.ide'
  | 'equipment.arduino'
  | 'equipment.esp8266'
  | 'equipment.light'
  | 'equipment.temperature'
  | 'equipment.pressure'
  | 'equipment.ultrasonic'
  | 'equipment.epaper'
  | 'equipment.oled'
  | 'equipment.rfid.reader'
  | 'equipment.rfid.card'
  | 'equipment.rfid.tag'

const translationBundles = {
  zh: {
    'app.title': 'Smart Cat Home',
    'app.subtitle': '連結 Arduino 智慧貓屋，隨時掌握毛孩環境。',
    'app.lastUpdated': '最後更新：{{time}}',
    'app.noUpdate': '尚未更新',
    'app.refresh': '重新整理',
    'app.refreshLoading': '更新中...',
    'app.notifications.enable': '啟用背景通知',
    'app.notifications.enabled': '通知已啟用',
    'notifications.success': '通知已啟用，伺服器推播將自動顯示警示。',
    'notifications.denied': '已拒絕通知權限。',
    'notifications.unsupported': '此裝置不支援通知功能。',
    'notifications.swUnsupported': '瀏覽器未啟用 Service Worker。',
    'notifications.permissionRequired': '通知權限未授予，無法推播。',
    'notifications.vapidMissing': '缺少 VAPID 公鑰設定，無法完成推播註冊。',
    'notifications.error': '通知啟用失敗。',
    'errors.fetch': '無法取得最新資料，請稍後再試。',
    'errors.settings': '設定更新失敗，請檢查裝置連線。',
    'errors.backendMissing': '未連線後端服務，請設定 API 或於環境啟用模擬資料。',
    'panel.realtime.title': '即時感測',
    'panel.realtime.subtitle': '最新的環境與健康數據來自 Arduino 感測器。',
    'data.temperature.title': '溫度',
    'data.temperature.footer': '目標 {{value}}°C',
    'data.humidity.title': '濕度',
    'data.humidity.footer': '目標 {{value}}%',
    'data.water.title': '喝水量',
    'data.water.footer': '以當日累積計算',
    'data.weight.title': '貓咪體重',
    'data.weight.footer': '與上週比較 ±0.2kg 屬正常',
    'data.aqi.title': '空氣品質',
    'data.aqi.footer': 'AQI 0-60 為良好',
    'data.feeding.title': '距上次餵食',
    'data.feeding.footer': '排程：{{schedule}}',
    'control.title': '控制中心',
    'control.subtitle': '切換自動/手動模式，或調整環境目標。',
    'control.auto': '自動模式 Autoset',
    'control.temperature': '溫度目標 (°C)',
    'control.humidity': '濕度目標 (%)',
    'control.water': '飲水碗補水目標 (ml)',
    'control.schedule': '餵食時間 (逗號分隔)',
    'control.purifier': '清淨機強度',
    'control.purifier.low': '低',
    'control.purifier.medium': '中',
    'control.purifier.high': '高',
    'control.applyPreset': '套用智慧預設',
    'control.save': '儲存設定',
    'device.title': '裝置狀態',
    'device.subtitle': '即時掌握 Arduino 主要模組的啟動情況。',
    'device.labels.heater': '暖氣',
    'device.labels.humidifier': '加濕器',
    'device.labels.waterPump': '飲水補水泵',
    'device.labels.feeder': '自動餵食',
    'device.labels.purifier': '空氣清淨',
    'device.state.on': '運作中',
    'device.state.off': '待命',
    'history.title': '24 小時趨勢',
    'history.subtitle': 'IndexedDB 快取的最近 {{count}} 筆資料，可作為 AI 分析依據。',
    'history.avgTemperature': '平均溫度',
    'history.range': '範圍 {{min}}°C ~ {{max}}°C',
    'history.avgHumidity': '平均濕度',
    'history.samples': '共 {{count}} 筆樣本',
    'history.totalWater': '飲水累計',
    'history.totalWaterNote': '以最近紀錄為基準',
    'history.lastSync': '最近同步',
    'history.lastSyncNote': '資料自動滾動保留 24 筆',
    'ai.title': 'AI 健康顧問',
    'ai.subtitle': '利用歷史數據與 fine-tune 模型的規則提供照護建議。',
    'ai.severity.info': '一般提醒',
    'ai.severity.warning': '需要注意',
    'ai.severity.critical': '緊急',
    'ai.insight.hot.title': '環境偏熱',
    'ai.insight.hot.body': '目前溫度 {{value}}°C，建議調低暖氣或開啟冷氣功能，保持在 20-28°C。',
    'ai.insight.cold.title': '環境偏冷',
    'ai.insight.cold.body': '溫度僅 {{value}}°C，可提升暖氣設定或確認貓咪保暖。',
    'ai.insight.humidHigh.title': '濕度過高',
    'ai.insight.humidHigh.body': '濕度 {{value}}% 偏高，建議降低加濕器輸出或保持通風。',
    'ai.insight.humidLow.title': '濕度偏低',
    'ai.insight.humidLow.body': '濕度 {{value}}% 偏低，可開啟加濕或放置水盤。',
    'ai.insight.waterLow.title': '喝水量不足',
    'ai.insight.waterLow.body': '今日喝水 {{value}}ml，建議檢查水源或改變器皿位置，並鼓勵多喝水。',
    'ai.insight.aqi.title': '空氣品質偏差',
    'ai.insight.aqi.body': 'AQI {{value}} 偏高，可提升空氣清淨器強度。',
    'ai.insight.feeding.title': '餵食時間提醒',
    'ai.insight.feeding.body': '距離上次餵食已 {{value}} 分鐘，可評估加餐或調整自動餵食。',
    'ai.insight.autoset.title': '建議啟用自動控溫',
    'ai.insight.autoset.body': '目前與目標溫度差距較大，啟用自動模式可讓系統自動調節。',
    'ai.insight.good.title': '狀態良好',
    'ai.insight.good.body': '所有指標皆在健康範圍，請持續保持目前的照護方式。',
    'usage.title': '使用說明',
    'usage.subtitle': '第一次開啟 APP 時請依照以下步驟操作。',
    'usage.step1': '開啟手機 Wi-Fi 或藍牙，確保與 Arduino 智慧貓屋主機連線。',
    'usage.step2': '登入後主畫面會自動同步感測數據，若 5 秒內無更新，可點擊「重新整理」。',
    'usage.step3': '需要手動調整裝置時，關閉「自動模式」，修改目標後按下「儲存設定」。',
    'usage.step4': '若想讓系統自動優化環境，開啟「自動模式 Autoset」，系統會依據 AI 模型建議調整設備。',
    'usage.step5': '「AI 健康顧問」會依據喝水量、體重與空氣品質提供提示，如出現紅色警示請檢查貓咪狀態。',
    'usage.step6': '完成設定後於「裝置狀態」確認各模組是否啟動，下次開啟 APP 時會自動套用。',
    'settings.button': '設定',
    'settings.language': '界面語言',
    'settings.language.zh': '中文',
    'settings.language.en': '英文',
    'chat.launch': 'AI 互動建議',
    'chat.placeholder': '輸入你的問題，例如：貓咪喝水變少怎麼辦？',
    'chat.send': '傳送',
    'chat.empty': '目前沒有任何對話，先提出第一個問題吧！',
    'chat.loading': 'AI 正在整理建議…',
    'chat.error': '無法取得建議，請稍後再試。',
    'chat.retry': '重新嘗試',
    'chat.system.greeting': '嗨！我是你的智慧貓屋 AI 顧問，有任何環境調整或健康疑問都可以問我。',
    'chat.system.disclaimer': 'AI 建議僅供參考，如遇緊急狀況請聯絡獸醫。',
    'chat.system.backendRequired': '尚未連線 AI。請設定 `VITE_API_BASE_URL`（後端 API）或 `VITE_OLLAMA_BASE_URL`/`VITE_OLLAMA_MODEL` 後再試一次。',
    'equipment.title': '設備連線檢測',
    'equipment.subtitle': '快速測試各模組是否在線並記錄延遲。',
    'equipment.testAll': '全部測試',
    'equipment.testOne': '重新測試',
    'equipment.testing': '測試中…',
    'equipment.status.ok': '連線成功 ({{latency}}ms)',
    'equipment.status.fail': '連線失敗 ({{latency}}ms)',
    'equipment.status.unknown': '尚未測試',
    'equipment.status.backendMissing': '尚未連線後端 API',
    'equipment.status.serialUnsupported': '瀏覽器不支援 Web Serial，請使用 Chrome/Edge (HTTPS)。',
    'equipment.status.serialDenied': '未授權存取 Arduino 序列埠。',
    'equipment.status.arduinoTimeout': 'Arduino 無回應，請確認韌體已載入。',
    'equipment.status.arduinoError': '序列測試時發生錯誤，請重新連接裝置。',
    'equipment.status.arduinoUnexpected': '收到未知資料，請檢查 PING/PONG 程式。',
    'equipment.category.network': '網路配備',
    'equipment.category.controller': '控制與開發',
    'equipment.category.sensor': '感測模組',
    'equipment.category.display': '顯示模組',
    'equipment.category.rfid': 'RFID 系統',
    'equipment.router': 'Wi-Fi 路由器',
    'equipment.ide': '開發電腦 + Arduino IDE',
    'equipment.arduino': 'Arduino 主板 (Mega/Micro)',
    'equipment.esp8266': 'ESP8266 無線模組',
    'equipment.light': '光感測器 PGM5539',
    'equipment.temperature': '溫度感測器 LM35',
    'equipment.pressure': '壓力感測器 RFP-602',
    'equipment.ultrasonic': '超音波模組 HC-SR04',
    'equipment.epaper': '1.54 吋 e-paper 顯示器',
    'equipment.oled': '0.96 吋 I2C OLED',
    'equipment.rfid.reader': 'RFID 讀卡機 MFRC522',
    'equipment.rfid.card': 'RFID PICC 卡 1K',
    'equipment.rfid.tag': 'RFID PICC 標籤 1K',
  },
  en: {
    'app.title': 'Smart Cat Home',
    'app.subtitle': 'Connect to the Arduino smart habitat and watch your cat’s environment.',
    'app.lastUpdated': 'Last updated: {{time}}',
    'app.noUpdate': 'No data yet',
    'app.refresh': 'Refresh',
    'app.refreshLoading': 'Refreshing...',
    'app.notifications.enable': 'Enable background alerts',
    'app.notifications.enabled': 'Alerts enabled',
    'notifications.success': 'Notifications enabled. Server pushes will alert you automatically.',
    'notifications.denied': 'Notification permission was denied.',
    'notifications.unsupported': 'Notifications are not supported on this device.',
    'notifications.swUnsupported': 'Service workers are not available in this browser.',
    'notifications.permissionRequired': 'Notification permission is required for alerts.',
    'notifications.vapidMissing': 'Missing VAPID public key; push registration cannot proceed.',
    'notifications.error': 'Failed to enable notifications.',
    'errors.fetch': 'Unable to fetch the latest data. Please try again.',
    'errors.settings': 'Failed to update settings. Check the device connection.',
    'errors.backendMissing': 'Backend API missing. Configure it or enable mock data in the environment.',
    'panel.realtime.title': 'Realtime Sensors',
    'panel.realtime.subtitle': 'Latest environment and wellness data from the Arduino sensors.',
    'data.temperature.title': 'Temperature',
    'data.temperature.footer': 'Target {{value}}°C',
    'data.humidity.title': 'Humidity',
    'data.humidity.footer': 'Target {{value}}%',
    'data.water.title': 'Water intake',
    'data.water.footer': 'Daily total so far',
    'data.weight.title': 'Cat weight',
    'data.weight.footer': 'Within ±0.2 kg vs last week is normal',
    'data.aqi.title': 'Air quality',
    'data.aqi.footer': 'AQI 0–60 is considered good',
    'data.feeding.title': 'Minutes since feeding',
    'data.feeding.footer': 'Schedule: {{schedule}}',
    'control.title': 'Control Center',
    'control.subtitle': 'Switch auto/manual and adjust environmental targets.',
    'control.auto': 'Autoset (auto mode)',
    'control.temperature': 'Temperature target (°C)',
    'control.humidity': 'Humidity target (%)',
    'control.water': 'Water bowl target (ml)',
    'control.schedule': 'Feeding times (comma separated)',
    'control.purifier': 'Purifier intensity',
    'control.purifier.low': 'Low',
    'control.purifier.medium': 'Medium',
    'control.purifier.high': 'High',
    'control.applyPreset': 'Apply smart preset',
    'control.save': 'Save settings',
    'device.title': 'Device Status',
    'device.subtitle': 'Track which Arduino modules are running in real time.',
    'device.labels.heater': 'Heater',
    'device.labels.humidifier': 'Humidifier',
    'device.labels.waterPump': 'Water pump',
    'device.labels.feeder': 'Auto feeder',
    'device.labels.purifier': 'Air purifier',
    'device.state.on': 'Active',
    'device.state.off': 'Standby',
    'history.title': '24-hour trends',
    'history.subtitle': 'Latest {{count}} cached entries in IndexedDB for AI context.',
    'history.avgTemperature': 'Average temperature',
    'history.range': 'Range {{min}}°C – {{max}}°C',
    'history.avgHumidity': 'Average humidity',
    'history.samples': '{{count}} samples',
    'history.totalWater': 'Total water',
    'history.totalWaterNote': 'Based on latest record',
    'history.lastSync': 'Last sync',
    'history.lastSyncNote': 'Auto-rotates to keep 24 entries',
    'ai.title': 'AI Health Advisor',
    'ai.subtitle': 'Care suggestions powered by history and the fine-tuned model.',
    'ai.severity.info': 'Info',
    'ai.severity.warning': 'Warning',
    'ai.severity.critical': 'Critical',
    'ai.insight.hot.title': 'Environment too warm',
    'ai.insight.hot.body': 'Current temperature is {{value}}°C. Lower heating or cool the room to stay between 20-28°C.',
    'ai.insight.cold.title': 'Environment too cold',
    'ai.insight.cold.body': 'Temperature is {{value}}°C. Increase heating or add blankets for warmth.',
    'ai.insight.humidHigh.title': 'Humidity too high',
    'ai.insight.humidHigh.body': 'Humidity at {{value}}% is elevated. Reduce humidifier output or increase ventilation.',
    'ai.insight.humidLow.title': 'Humidity too low',
    'ai.insight.humidLow.body': 'Humidity at {{value}}% is low. Add moisture via humidifier or water tray.',
    'ai.insight.waterLow.title': 'Low water intake',
    'ai.insight.waterLow.body': 'Today’s water intake is {{value}} ml. Check the fountain and encourage drinking.',
    'ai.insight.aqi.title': 'Air quality issue',
    'ai.insight.aqi.body': 'AQI {{value}} is high. Increase air purifier strength.',
    'ai.insight.feeding.title': 'Feeding reminder',
    'ai.insight.feeding.body': '{{value}} minutes since the last meal. Consider a snack or adjust the auto feeder.',
    'ai.insight.autoset.title': 'Enable autoset for comfort',
    'ai.insight.autoset.body': 'The room is far from the target temperature. Autoset can correct it automatically.',
    'ai.insight.good.title': 'All clear',
    'ai.insight.good.body': 'Every metric sits in the healthy range. Keep up the great care!',
    'usage.title': 'Usage Guide',
    'usage.subtitle': 'Follow these steps the first time you open the app.',
    'usage.step1': 'Enable Wi-Fi or Bluetooth so the phone pairs with the Arduino hub.',
    'usage.step2': 'The dashboard syncs sensor data automatically. Tap "Refresh" if nothing updates within 5 seconds.',
    'usage.step3': 'Switch off autoset to adjust targets manually, then press "Save settings".',
    'usage.step4': 'Turn autoset back on to let the AI tuner manage heating, humidity, and feeding schedules.',
    'usage.step5': 'The AI advisor reviews water, weight, and air quality. Act quickly on red critical notices.',
    'usage.step6': 'Review the Device Status list to confirm modules are running; settings persist next launch.',
    'settings.button': 'Settings',
    'settings.language': 'Interface language',
    'settings.language.zh': 'Chinese',
    'settings.language.en': 'English',
    'chat.launch': 'Chat with AI',
    'chat.placeholder': 'Ask anything, e.g., “Why is my cat drinking less water?”',
    'chat.send': 'Send',
    'chat.empty': 'No messages yet. Ask your first question!',
    'chat.loading': 'The AI is preparing advice…',
    'chat.error': 'Failed to fetch suggestions. Try again later.',
    'chat.retry': 'Retry',
    'chat.system.greeting': "Hi! I'm your Smart Cat Home advisor. Ask me about comfort or health.",
    'chat.system.disclaimer': 'AI guidance is informational only. Consult a vet for emergencies.',
    'chat.system.backendRequired': 'AI backend is offline. Configure VITE_API_BASE_URL or set VITE_OLLAMA_BASE_URL / VITE_OLLAMA_MODEL to enable chat.',
    'equipment.title': 'Equipment Diagnostics',
    'equipment.subtitle': 'Quickly verify hardware connectivity and latency.',
    'equipment.testAll': 'Test all',
    'equipment.testOne': 'Retest',
    'equipment.testing': 'Testing…',
    'equipment.status.ok': 'Online ({{latency}}ms)',
    'equipment.status.fail': 'Failed ({{latency}}ms)',
    'equipment.status.unknown': 'Not tested yet',
    'equipment.status.backendMissing': 'Backend API is not configured',
    'equipment.status.serialUnsupported': 'Web Serial not supported. Use Chrome/Edge over HTTPS.',
    'equipment.status.serialDenied': 'Serial port access was denied.',
    'equipment.status.arduinoTimeout': 'No response from Arduino. Ensure PING/PONG firmware is running.',
    'equipment.status.arduinoError': 'Serial test failed. Reconnect the device and retry.',
    'equipment.status.arduinoUnexpected': 'Unexpected serial data. Verify the PING/PONG sketch.',
    'equipment.category.network': 'Network',
    'equipment.category.controller': 'Controllers & IDE',
    'equipment.category.sensor': 'Sensors',
    'equipment.category.display': 'Displays',
    'equipment.category.rfid': 'RFID system',
    'equipment.router': 'Wi-Fi router',
    'equipment.ide': 'Development PC + Arduino IDE',
    'equipment.arduino': 'Arduino board (Mega/Micro)',
    'equipment.esp8266': 'ESP8266 Wi-Fi module',
    'equipment.light': 'PGM5539 light sensor',
    'equipment.temperature': 'LM35 temperature sensor',
    'equipment.pressure': 'RFP-602 pressure sensor',
    'equipment.ultrasonic': 'HC-SR04 ultrasonic module',
    'equipment.epaper': '1.54" e-paper display',
    'equipment.oled': '0.96" I2C OLED',
    'equipment.rfid.reader': 'MFRC522 RFID reader',
    'equipment.rfid.card': 'RFID PICC card 1K',
    'equipment.rfid.tag': 'RFID PICC tag 1K',
  },
} satisfies Record<string, Record<TranslationKey, string>>

export type Language = keyof typeof translationBundles

export const supportedLanguages = Object.keys(translationBundles) as Language[]

export const languageOptions: Array<{ code: Language; labelKey: TranslationKey }> = supportedLanguages.map(
  (code) => ({
    code,
    labelKey: `settings.language.${code}` as TranslationKey,
  }),
)

export function translate(
  language: Language,
  key: TranslationKey,
  variables?: Record<string, string | number>,
): string {
  const dictionary = translationBundles[language]
  const fallback = translationBundles.en
  const template = dictionary?.[key] ?? fallback[key] ?? key

  if (!variables) {
    return template
  }

  return template.replace(/\{\{(.*?)\}\}/g, (_, varName: string) => {
    const value = variables[varName.trim()]
    return value !== undefined ? String(value) : ''
  })
}
