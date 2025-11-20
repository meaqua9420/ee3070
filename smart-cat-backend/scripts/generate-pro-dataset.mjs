#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const OUTPUT_PATH = path.resolve('smart-cat-backend/datasets/pro-finetune/smart-cat-pro.jsonl')
const TOTAL_RECORDS_PER_LANGUAGE = 500

const SYSTEM_PROMPT =
  'You are the Smart Cat Home pro-tier companion. Blend friendly warmth with expert reasoning, always grounding suggestions in sensor trends, memories, safety policies, and actionable next steps.'

const zhCatNames = ['小虎', '奶茶', '茄子', '雪球', '樂樂', '豆花', '黑糖', '布丁', '布偶', '米香', '金寶', '芝麻', '阿飛']
const zhCaregivers = ['阿偉', '阿芳', '庭庭', '小葵', '珮珮', '阿凱', '阿姨', '叔叔', '小琪', 'Jeff', '阿哲', '怡萱']
const zhRooms = ['客廳', '廚房', '貓屋', '陽台', '玄關', '臥室', '工作室', '浴室']
const zhActivities = ['追逐逗貓棒', '趴在監測墊', '躲在紙箱裡', '守在窗邊', '啃抓板', '盯著除濕機']

const enCatNames = ['Luna', 'Milo', 'Cleo', 'Nori', 'Pixel', 'Otto', 'Hazel', 'Misty', 'Cosmo', 'Sage', 'Indigo', 'Poppy']
const enCaregivers = ['Jamie', 'Morgan', 'Chris', 'Taylor', 'Brooke', 'Riley', 'Avery', 'Jordan', 'Emerson', 'Harper', 'Logan', 'Dakota']
const enRooms = ['living room', 'studio', 'den', 'sunroom', 'kitchen', 'hallway', 'balcony', 'bedroom']
const enActivities = ['chasing the laser toy', 'curling on the pressure pad', 'perching on the window shelf', 'guarding the humidifier', 'ignoring the scratch post']

function pad(arr, index) {
  return arr[index % arr.length]
}

function createRng(seed) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

function randomChoice(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

function randomInt(rng, min, maxInclusive) {
  return Math.floor(rng() * (maxInclusive - min + 1)) + min
}

function randomFloat(rng, min, max, digits = 1) {
  const value = min + rng() * (max - min)
  return Number.parseFloat(value.toFixed(digits))
}

function joinLines(lines) {
  return lines.filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function makeRecord(user, assistant) {
  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user.trim() },
      { role: 'assistant', content: assistant.trim() },
    ],
  }
}

function buildZhContext(index, rng) {
  return {
    index,
    rng,
    cat: pad(zhCatNames, index),
    caregiver: pad(zhCaregivers, index),
    secondaryCat: pad(zhCatNames, index + 5),
    room: randomChoice(rng, zhRooms),
    altRoom: randomChoice(rng, zhRooms),
    activity: randomChoice(rng, zhActivities),
  }
}

function buildEnContext(index, rng) {
  return {
    index,
    rng,
    cat: pad(enCatNames, index),
    caregiver: pad(enCaregivers, index),
    secondaryCat: pad(enCatNames, index + 4),
    room: randomChoice(rng, enRooms),
    altRoom: randomChoice(rng, enRooms),
    activity: randomChoice(rng, enActivities),
  }
}

// ---------- Chinese scenarios ----------

function zhHumidityPlan(ctx) {
  const { cat, caregiver, rng, room } = ctx
  const hours = randomInt(rng, 4, 8)
  const humidityHigh = randomFloat(rng, 72, 78, 1)
  const humidityLow = randomFloat(rng, humidityHigh - 4.8, humidityHigh - 3.0, 1)
  const dewPoint = randomFloat(rng, 18.5, 20.5, 1)
  const duration = randomInt(rng, 12, 20)

  const user = joinLines([
    `過去 ${hours} 小時濕度都卡在 ${humidityLow}～${humidityHigh}%，露點 ${dewPoint}°C，上週設定的 60% 門檻沒派上用場。`,
    `${cat} 一直${randomChoice(rng, ['貼在除濕機旁', '趴在冷氣出風口', '縮在門縫旁'])}，${caregiver} 擔心冷風太強。`,
    '可以給我一個比較周全的調整方案嗎？',
  ])

  const assistant = joinLines([
    `剛檢視 ${hours} 小時的濕度趨勢：平均 ${humidityHigh - 1.1}% 左右，露點維持在 ${dewPoint}°C，代表空氣含水量偏高。`,
    '建議從三個層面處理：',
    `1. 立刻把 ${room} 的除濕機切到「連續」模式 ${duration} 分鐘，排水槽若超過 70% 我會推播提醒清空。`,
    `2. 開啟走廊循環扇朝門縫吹 10 分鐘，把冷凝水導向乾燥區，避免 ${cat} 一直貼著冷風。`,
    '3. 若 45 分鐘後濕度仍 >65%，我會啟動「夜間強力除濕」排程並把 targetHumidity 調成 58%，同時記錄此次調整於校正常數。',
    '另外記得擦乾除濕機底盤，完成後回報，我會在 02:00 自動檢查一次。',
  ])

  return makeRecord(user, assistant)
}

function zhHydrationMedication(ctx) {
  const { cat, caregiver, rng } = ctx
  const intakeToday = randomInt(rng, 90, 140)
  const targetIntake = intakeToday + randomInt(rng, 80, 120)
  const reminderTime = `${randomInt(rng, 18, 22)}:${randomChoice(rng, ['00', '10', '30', '45'])}`
  const med = randomChoice(rng, ['腸胃益生菌', '口服補水粉', '眼藥水'])

  const user = joinLines([
    `${cat} 今天喝水只有 ${intakeToday} ml，還要點 ${med}。`,
    '我想安排提醒，也希望你監測今晚有沒有補足水分並記錄。可以幫忙設計流程嗎？',
  ])

  const assistant = joinLines([
    `目前 hydration tracker 顯示 ${cat} 今日攝取 ${intakeToday} ml，低於目標的 ${targetIntake} ml。`,
    '我會幫你做三件事：',
    `1. 安排 ${reminderTime} 的推播：「餵溫水＋${med}」，並在提醒中附上量匙照片。`,
    '2. 20 分鐘後檢查飲水站流量，若 <20 ml 會提醒你用凍乾泡水引導他飲用。',
    '3. 明早 07:30 自動生成「昨夜補水紀錄」並更新健康筆記；若三日平均仍偏低，我會建議排遠距獸醫。',
    `補水時留意是否出現噴嚏或流淚，一旦異常可直接說「請連線獸醫」，我會切換到 Pro 緊急流程。`,
  ])

  return makeRecord(user, assistant)
}

function zhMultiCatConflict(ctx) {
  const { cat, secondaryCat, caregiver, rng, room, activity } = ctx
  const tension = randomChoice(rng, ['打架', '互相盯著', '互搶貓砂'])
  const pheromone = randomChoice(rng, ['費洛蒙夜燈', '貓草噴霧', '熟悉毯子'])

  const user = joinLines([
    `${cat} 跟 ${secondaryCat} 剛剛又${tension}，尤其在 ${room}。`,
    `${secondaryCat} 現在${activity}，但 ${caregiver} 擔心一轉身又衝突。`,
    '你可以幫我分析原因並排一個安撫流程嗎？',
  ])

  const assistant = joinLines([
    `衝突偵測到兩個 RFID 同時出現在 ${room}，${cat} 心率 118 bpm，${secondaryCat} 尾巴豎直代表緊張。`,
    '建議：',
    `1. 立即播放「低頻呼嚕」音檔 3 分鐘，並放置 ${pheromone} 降低攻擊訊號。`,
    '2. 將自動餵食器排程錯開 7 分鐘，避免搶食；照顧者晚上可陪主動貓玩互動玩具。',
    '3. 我會在 24 小時內記錄衝突次數，若超過 3 次會提示啟用「分隔模式」並同步給行為顧問。',
    '若再次爆發只要說「啟動安全門檻」，我會鎖定門磁並通知你。',
  ])

  return makeRecord(user, assistant)
}

function zhTravelMonitoring(ctx) {
  const { cat, caregiver, rng, room } = ctx
  const daysAway = randomInt(rng, 2, 4)
  const sitter = pad(zhCaregivers, ctx.index + 6)
  const cameraCount = randomInt(rng, 2, 4)
  const morningCheck = `${randomInt(rng, 7, 9)}:${randomChoice(rng, ['05', '20', '40'])}`

  const user = joinLines([
    `${caregiver} 週末要出差 ${daysAway} 天，只剩 ${sitter} 晚上來補食物。`,
    `我想確保 ${cat} 的飲水、溫度、視訊都自動化，尤其 ${room} 的鏡頭常忘記調角度。`,
    '可以給我一個完整的遠端巡檢腳本嗎？',
  ])

  const assistant = joinLines([
    '我會開啟「出差模式」並重點監控：',
    `1. 每天 ${morningCheck} 產生《宅內巡檢摘要》，含飲水、溫濕度與最近 ${cameraCount} 支鏡頭截圖，推播給你和 ${sitter}。`,
    `2. ${room} 的雲台攝影機預設「投遞視角」，${sitter} 到場後說「定位完成」我會截圖存檔。`,
    '3. 若 6 小時內沒有重量或動態變化，我會升級主動巡查並發 SMS。',
    '你回家後說「結束出差」，我會恢復排程並輸出旅程總結。',
  ])

  return makeRecord(user, assistant)
}

function zhSensorCalibration(ctx) {
  const { cat, rng } = ctx
  const baseline = randomInt(rng, 120, 160)
  const drift = randomFloat(rng, 2.8, 5.2, 1)
  const plannedTime = `${randomInt(rng, 9, 11)}:${randomChoice(rng, ['00', '15', '45'])}`

  const user = joinLines([
    `新的 FSR 墊 baseline 是 ${baseline} ± 3，但 ${cat} 起身後仍殘留 ${baseline - drift}。`,
    '我想重新校正並存成模板，可以帶我走一遍嗎？',
  ])

  const assistant = joinLines([
    `最近 48 小時 drift 上升到 ${drift}，確實需要校正。`,
    '步驟：',
    `1. ${plannedTime} 前把墊子清空，說「開始校正」，我會鎖定感測值並倒數 30 秒。`,
    '2. 完成後自動計算新 baseline 與 hysteresis，存成 preset：「FSR-sofa-lowSpring」。',
    '3. 24 小時內若仍有殘留值，我會貼出除錯指南並建議檢查訊號線或改用加厚泡棉。',
    '校正記錄會同步到設備履歷方便對照。',
  ])

  return makeRecord(user, assistant)
}

function zhWeightTrend(ctx) {
  const { cat, caregiver, rng } = ctx
  const weightDrop = randomFloat(rng, 0.25, 0.6, 2)
  const currentWeight = randomFloat(rng, 3.4, 4.6, 1)
  const stoolNote = randomChoice(rng, ['軟便', '正常', '略為乾硬'])

  const user = joinLines([
    `重量記錄顯示 ${cat} 這週掉了 ${weightDrop} kg，目前 ${currentWeight} kg，便便是 ${stoolNote}。`,
    `${caregiver} 想知道是不是壓力太大或飲食要調整。可以分析並安排後續嗎？`,
  ])

  const assistant = joinLines([
    `過去 14 天平均下降 ${weightDrop} kg，飲水正常但活動量較上週多 12%。`,
    '建議流程：',
    '1. 早餐調整為主食罐 60 g + 濕糧 40 g，暫停零食。',
    `2. 晚上 21:00 設定「體重複測提醒」，提示你把 ${cat} 放上智能秤並自動記錄。`,
    '3. 若三日平均仍低於 3.2 kg，我會自動生成「健康匯總」並寄給指定獸醫。',
    '同時開啟情緒追蹤，觀察是否因陌生聲音造成壓力。',
  ])

  return makeRecord(user, assistant)
}

function zhVisionCheck(ctx) {
  const { cat, rng, activity } = ctx
  const glare = randomChoice(rng, ['窗外汽車燈', '鄰居施工燈', '樓下霓虹燈'])
  const clipLength = randomInt(rng, 12, 18)

  const user = joinLines([
    `我剛上傳一段 ${clipLength} 秒影片，${cat} ${activity}，眼睛對著 ${glare}。`,
    '你可以判讀是不是光線太強或眼睛不舒服？',
  ])

  const assistant = joinLines([
    '影片分析：瞳孔收縮頻率偏高但沒有頻繁眨眼或眼瞼下垂。',
    '建議：',
    '1. 將窗簾角度調 15°，讓 ambientLightPercent 維持在 35～45%。',
    `2. 22:30 預載「柔和夜燈」場景，若 ${cat} 仍避開燈源會推播提醒是否需洗眼。`,
    '3. 影片已標記為「視覺敏感」，下回會自動對照趨勢。',
  ])

  return makeRecord(user, assistant)
}

function zhNightChecklist(ctx) {
  const { cat, secondaryCat, rng } = ctx
  const tasks = [
    `檢查 ${cat} 的自動餵食器是否剩餘 >40 g`,
    `確認 ${secondaryCat} 飲水站維持在 ${randomInt(rng, 55, 70)}%`,
    '更新客廳攝影機朝向抓板區域',
    `於 23:${randomChoice(rng, ['00', '10', '20', '30'])} 啟動夜間安靜模式`,
  ]

  const user = joinLines([
    '今晚想快速巡檢後休息，幫我生成專業的夜間檢查清單。',
    `重點是 ${cat} 跟 ${secondaryCat} 不要在凌晨互相吵醒。`,
  ])

  const assistant = joinLines([
    '這裡是今晚的巡檢步驟：',
    `1. ${tasks[0]}`,
    `2. ${tasks[1]}`,
    `3. ${tasks[2]} (完成後說「視角定位好」我會截圖備份)`,
    `4. ${tasks[3]}`,
    '5. 開啟「睡眠觀測」卡片，若凌晨 3 點前噪音 >55 dB，我會自動播放白噪音。',
    '完成後回覆「巡檢完成」，我會關閉推播並記錄到日誌。',
  ])

  return makeRecord(user, assistant)
}

function zhEmergency(ctx) {
  const { cat, caregiver, rng } = ctx
  const vomitCount = randomInt(rng, 2, 3)
  const timeframe = randomInt(rng, 3, 5)
  const hydration = randomChoice(rng, ['清水', '補水凍乾', '口服電解質'])

  const user = joinLines([
    `${cat} ${timeframe} 小時內吐了 ${vomitCount} 次，最近吃的都是同一款主食罐。`,
    `${caregiver} 不確定要不要立刻送醫，可否先做遠端判斷？`,
  ])

  const assistant = joinLines([
    '收到，已切換到緊急 triage 模式：',
    `1. 先把 ${cat} 隔離在通風小房間，開空氣清淨中速並鋪吸水墊。`,
    '2. 若嘔吐物顏色偏黃或帶泡沫，拍照上傳，我會同步給獸醫顧問判讀。',
    `3. 20 分鐘後提供 ${hydration}，若仍拒絕或再吐一次，直接說「連線獸醫」，我會轉到 Pro 診斷。`,
    '已暫停自動餵食 6 小時，也會監控貓砂重量判斷是否脫水。',
  ])

  return makeRecord(user, assistant)
}

function zhEnergyOptimization(ctx) {
  const { cat, rng, room } = ctx
  const powerUsage = randomFloat(rng, 2.1, 3.4, 2)
  const offHours = randomInt(rng, 1, 3)

  const user = joinLines([
    `${room} 的除濕加空氣清淨昨晚耗了 ${powerUsage} kWh，我想在舒適前提下降低耗電。`,
    `${cat} 白天都待在貓屋，你可以設計節能排程並記錄嗎？`,
  ])

  const assistant = joinLines([
    '節能建議：',
    `1. 白天 10:00～${10 + offHours}:00 改用自然風＋溫和除濕 (target 62%)，若濕度 >68% 會立刻恢復原設定。`,
    '2. 晚上 19:30 啟動「舒眠潔淨」場景：除濕機低速、清淨機自動、循環扇轉向窗邊。',
    '3. 明早 09:00 我會產生能耗比較圖，若節能超過 12% 會自動延續。',
    `同時觀察 ${cat} 是否因風速改變而改位置，我會記錄到舒適度分析。`,
  ])

  return makeRecord(user, assistant)
}

const zhScenarioBuilders = [
  zhHumidityPlan,
  zhHydrationMedication,
  zhMultiCatConflict,
  zhTravelMonitoring,
  zhSensorCalibration,
  zhWeightTrend,
  zhVisionCheck,
  zhNightChecklist,
  zhEmergency,
  zhEnergyOptimization,
]

// ---------- English scenarios ----------

function enClimateControl(ctx) {
  const { cat, caregiver, rng, room } = ctx
  const hours = randomInt(rng, 3, 6)
  const humidity = randomFloat(rng, 68, 76, 1)
  const tempSwing = randomFloat(rng, 2.3, 3.6, 1)
  const fanMinutes = randomInt(rng, 10, 18)

  const user = joinLines([
    `Humidity has hovered around ${humidity}% for the past ${hours} hours and the HVAC keeps cycling.`,
    `${cat} is camped under the vent while ${caregiver} worries about the ${tempSwing}°C swings.`,
    'Can you craft a smarter climate plan before bedtime?',
  ])

  const assistant = joinLines([
    `Trend review: humidity ${humidity}% ±1.5, temperature oscillating within ${tempSwing}°C.`,
    'Recommended actions:',
    `1. Switch the ${room} dehumidifier to "continuous" for ${fanMinutes} minutes and confirm the drain hose is clear.`,
    `2. Angle the hallway circulator toward the ceiling to diffuse the cold air so the cat doesn't cling to the vent.`,
    `3. If humidity stays above 65% after 45 minutes I'll enable the 2:30 a.m. deep-dry routine and log the change to the calibration notes.`,
    `I'll also push a 07:00 reminder to inspect for condensation near the litter box.`,
  ])

  return makeRecord(user, assistant)
}

function enHydrationPlan(ctx) {
  const { cat, caregiver, rng } = ctx
  const intake = randomInt(rng, 80, 130)
  const target = intake + randomInt(rng, 90, 140)
  const routine = randomChoice(rng, ['broth ice cube', 'fluid gel topper', 'feline electrolytes'])
  const reminder = `${randomInt(rng, 19, 22)}:${randomChoice(rng, ['00', '20', '35', '45'])}`

  const user = joinLines([
    `${cat} barely drank ${intake} ml today and still needs the ${routine}.`,
    `${caregiver} wants a structured reminder plus a follow-up check.`,
  ])

  const assistant = joinLines([
    `Water log shows ${cat} trending ${target - intake} ml below target.`,
    'Plan:',
    `1. Scheduling a ${reminder} push alert titled "hydration + ${routine}" with step-by-step notes.`,
    `2. Twenty minutes later I'll inspect the flow sensor; if usage <25 ml I'll nudge you to offer warmed broth.`,
    `3. Tomorrow at 08:00 I'll generate a hydration digest; if intake stays low for three days I'll escalate to pro telehealth.`,
    `Say "log response" afterwards and I'll annotate whether the routine helped.`,
  ])

  return makeRecord(user, assistant)
}

function enBehaviorConflict(ctx) {
  const { cat, secondaryCat, caregiver, rng, room } = ctx
  const noise = randomInt(rng, 58, 66)
  const scent = randomChoice(rng, ['chamomile spray', 'feliway plug-in', 'catnip sachet'])

  const user = joinLines([
    `${cat} and ${secondaryCat} just had another standoff near the ${room}.`,
    `The noise meter spiked at ${noise} dB and ${caregiver} is exhausted.`,
    'Can you broker a truce and log the steps?',
  ])

  const assistant = joinLines([
    `Conflict detector confirms both collars within 0.6 m, tails upright.`,
    `Let's dampen the tension:`,
    `1. Trigger the "Calm Corridor" light scene and set out the ${scent}.`,
    `2. Offset the paired feeders by seven minutes so they don't crowd each other.`,
    `3. I'll track conflict counts for 24 hours; if we hit three incidents I'll DM you a rehearsal plan and flag it for the behaviorist.`,
    `If you need an emergency partition say "activate safe zone" and I'll lock the smart gate.`,
  ])

  return makeRecord(user, assistant)
}

function enTravelRoutine(ctx) {
  const { cat, caregiver, rng, room } = ctx
  const days = randomInt(rng, 2, 5)
  const sitter = pad(enCaregivers, ctx.index + 6)
  const camera = randomChoice(rng, ['pan-tilt cam', 'wide-angle cam', 'ceiling cam'])
  const checkTime = `${randomInt(rng, 7, 9)}:${randomChoice(rng, ['05', '20', '35'])}`

  const user = joinLines([
    `${caregiver} will be away for ${days} days and only ${sitter} can drop by at night.`,
    `${cat} lives in the ${room} but the ${camera} drifts off angle.`,
    'Assemble a remote routine so nothing gets missed?',
  ])

  const assistant = joinLines([
    'Travel routine:',
    `1. Each day at ${checkTime} I'll send a "home pulse" summary covering water, climate, and the latest ${camera} snapshot.`,
    `2. I'll pin a checklist for ${sitter}: refill feeder, rotate the litter cam, and confirm the locking window is sealed.`,
    `3. If I don't detect movement or weight shifts for six hours I'll escalate with SMS and chime through the speaker.`,
    `When you say "I'm back" I'll exit travel mode, restore schedules, and archive the logs.`,
  ])

  return makeRecord(user, assistant)
}

function enSensorDiagnostics(ctx) {
  const { cat, rng, altRoom } = ctx
  const sensor = randomChoice(rng, ['CO2 sensor', 'temperature probe', 'water level reader'])
  const drift = randomFloat(rng, 3.5, 6.2, 1)
  const calibrationSlot = `${randomInt(rng, 11, 14)}:${randomChoice(rng, ['00', '15', '40'])}`

  const user = joinLines([
    `The ${sensor} in the ${altRoom} is stuck near baseline even when ${cat} walks past.`,
    `Offset graph shows about +${drift}. Help me recalibrate and log it?`,
  ])

  const assistant = joinLines([
    `Trend check: median readings have been off by ${drift} for 48 hours.`,
    'Diagnostics plan:',
    `1. At ${calibrationSlot} say "start calibration"; I'll freeze readings for 30 seconds and capture raw data.`,
    `2. I'll fit a new bias curve tagged "high humidity offset" for future reference.`,
    `3. If post-calibration deviation stays above 2 I'll send the cleaning guide or suggest swapping the module.`,
    `All notes sync into the maintenance ledger alongside ${cat}'s comfort history.`,
  ])

  return makeRecord(user, assistant)
}

function enWeightAlert(ctx) {
  const { cat, caregiver, rng } = ctx
  const drop = randomFloat(rng, 0.18, 0.45, 2)
  const current = randomFloat(rng, 3.6, 4.9, 1)
  const activityDelta = randomInt(rng, 8, 18)

  const user = joinLines([
    `${cat} lost about ${drop} kg this week, now at ${current} kg.`,
    `Activity is up ${activityDelta}% and ${caregiver} is nervous.`,
  ])

  const assistant = joinLines([
    `Weight tracker confirms a ${drop} kg decline while play sessions jumped ${activityDelta}%.`,
    'Plan:',
    `1. Shift the evening meal to a calorie-dense pouch plus 10 g of freeze-dried topper.`,
    `2. At 21:30 I'll remind you to weigh the cat; reply "logged" and I'll sync it to the health notebook.`,
    `3. If the three-day moving average drops below 3.2 kg I'll pre-fill the vet triage form and reserve a telehealth slot.`,
    `I'll also watch resting heart rate overnight for anomalies.`,
  ])

  return makeRecord(user, assistant)
}

function enVisionReview(ctx) {
  const { cat, rng, activity } = ctx
  const clip = randomInt(rng, 14, 20)
  const stimulus = randomChoice(rng, ['laser pointer dot', 'flickering lamp', 'neighbor drone'])

  const user = joinLines([
    `I uploaded a ${clip}-second clip: ${cat} keeps ${activity} while staring at the ${stimulus}.`,
    'Interpret it and advise adjustments?',
  ])

  const assistant = joinLines([
    'Video analysis: eye blinking normal, posture relaxed, but head tilt suggests mild overstimulation.',
    `1. Dim ambient lighting by 20% and switch the enrichment toy to "slow hunt" mode.`,
    `2. Tagging the clip as "visual stimuli" so future anomalies auto-compare.`,
    `3. If the cat avoids that zone twice tomorrow I'll propose a different play schedule and flag it in the diary.`,
  ])

  return makeRecord(user, assistant)
}

function enEmergencyTriage(ctx) {
  const { cat, caregiver, rng } = ctx
  const incidents = randomInt(rng, 2, 4)
  const span = randomInt(rng, 2, 5)
  const hydration = randomChoice(rng, ['subcutaneous fluids', 'clear broth', 'oral electrolytes'])

  const user = joinLines([
    `${cat} vomited ${incidents} times within ${span} hours after dinner.`,
    `${caregiver} already withheld treats. Escalate or monitor?`,
  ])

  const assistant = joinLines([
    'Emergency triage:',
    `1. Move the cat to a quiet room, start the purifier on medium, lay absorbent pads.`,
    `2. Snap a photo of the latest vomit; I'll upload it to the vet portal with timestamps.`,
    `3. Offer ${hydration} in 20 minutes - if ignored or vomiting continues, say "connect vet" and I'll escalate to pro teleconsult.`,
    `Feeders are paused for six hours and I'll watch litter box output for dehydration signs.`,
  ])

  return makeRecord(user, assistant)
}

function enEnergyPlan(ctx) {
  const { cat, rng, room } = ctx
  const power = randomFloat(rng, 1.8, 3.2, 2)
  const window = randomInt(rng, 40, 60)

  const user = joinLines([
    `${room} appliances pulled ${power} kWh yesterday.`,
    `${cat} naps there all afternoon - how can we trim usage without sacrificing comfort?`,
  ])

  const assistant = joinLines([
    'Energy optimizations:',
    `1. From 11:00 to 14:00 use passive ventilation with vents opened ${window}% while keeping humidity under 62%.`,
    `2. At 19:30 run the "Evening breeze" scene: dehumidifier low, purifier auto, ceiling fan oscillating away from the nap zone.`,
    `3. Tomorrow morning I'll email a before/after consumption graph; if savings exceed 12% we'll keep the schedule.`,
    `I'll also log the cat's location data to ensure airflow changes don't disturb their routine.`,
  ])

  return makeRecord(user, assistant)
}

function enNightAudit(ctx) {
  const { cat, secondaryCat, rng } = ctx
  const litter = randomInt(rng, 35, 55)
  const reminder = `${randomInt(rng, 22, 23)}:${randomChoice(rng, ['05', '25', '40'])}`

  const user = joinLines([
    'Could you prep a professional bedtime audit?',
    `I need both ${cat} and ${secondaryCat} to stay calm overnight.`,
  ])

  const assistant = joinLines([
    'Night audit checklist:',
    '1. Confirm feeder A has >40 g and feeder B stays locked until 06:30.',
    `2. Scoop litter to keep ammonia below 15 ppm; add ${litter}% fresh litter if needed.`,
    `3. Rotate the lounge camera toward the scratcher and say "angle set" so I can snapshot it.`,
    `4. Activate quiet mode at ${reminder}; white noise auto-plays if noise rises above 55 dB.`,
    `Reply "audit done" and I'll file the log plus mute non-critical alerts until morning.`,
  ])

  return makeRecord(user, assistant)
}

function enSummaryReport(ctx) {
  const { cat, caregiver, rng } = ctx
  const days = randomInt(rng, 5, 7)
  const alerts = randomInt(rng, 2, 4)

  const user = joinLines([
    `${caregiver} wants a professional report summarizing the last ${days} days for ${cat}.`,
    `Include sensor trends, ${alerts} alerts, and caregiver follow-ups.`,
  ])

  const assistant = joinLines([
    `I'll compile the "Weekly Pro Brief" in three sections:`,
    '1. Environment & comfort: humidity, temperature, light exposure with trend graphs.',
    '2. Health metrics: weight, hydration, activity variance, plus notable alerts ranked by severity.',
    '3. Action items: completed tasks and recommended follow-ups with quick links.',
    'Expect the report in chat and email within 10 minutes; it will also sync to the shared vet folder.',
  ])

  return makeRecord(user, assistant)
}

const enScenarioBuilders = [
  enClimateControl,
  enHydrationPlan,
  enBehaviorConflict,
  enTravelRoutine,
  enSensorDiagnostics,
  enWeightAlert,
  enVisionReview,
  enEmergencyTriage,
  enEnergyPlan,
  enNightAudit,
  enSummaryReport,
]

function generateRecords({ count, seed, builders, contextBuilder }) {
  const rng = createRng(seed)
  const records = []
  for (let i = 0; i < count; i += 1) {
    const context = contextBuilder(i, rng)
    const builder = builders[i % builders.length]
    records.push(builder(context))
  }
  return records
}

const zhRecords = generateRecords({
  count: TOTAL_RECORDS_PER_LANGUAGE,
  seed: 0x5f3759df,
  builders: zhScenarioBuilders,
  contextBuilder: buildZhContext,
})

const enRecords = generateRecords({
  count: TOTAL_RECORDS_PER_LANGUAGE,
  seed: 0x9e3779b9,
  builders: enScenarioBuilders,
  contextBuilder: buildEnContext,
})

const allRecords = []
for (let i = 0; i < Math.max(zhRecords.length, enRecords.length); i += 1) {
  if (i < zhRecords.length) allRecords.push(zhRecords[i])
  if (i < enRecords.length) allRecords.push(enRecords[i])
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
const serialized = allRecords.map((record) => JSON.stringify(record))
fs.writeFileSync(OUTPUT_PATH, `${serialized.join('\n')}\n`, 'utf8')

console.log(`Generated ${allRecords.length} pro-tier samples -> ${OUTPUT_PATH}`)
