#!/usr/bin/env node

/**
 * 🔐 API Key Generator / API 金鑰生成器
 *
 * Generates cryptographically secure random API keys for Smart Cat Home
 * 為 Smart Cat Home 生成加密安全的隨機 API 金鑰
 *
 * Usage / 使用方式:
 *   node scripts/generate-api-keys.js
 *
 * Output / 輸出:
 *   - HARDWARE_API_KEY (for Arduino ↔ Backend / Arduino 與後端通訊)
 *   - ADMIN_API_KEY (for Frontend admin actions / 前端管理操作)
 *   - VAPID_KEYS (for Web Push Notifications / 網頁推播通知)
 */

const crypto = require('crypto')

console.log('\n🔐 Smart Cat Home - API Key Generator\n')
console.log('=' .repeat(70))
console.log('Copy these keys to your .env file / 複製這些金鑰到你的 .env 檔案')
console.log('=' .repeat(70))
console.log()

// Generate Hardware API Key (32 bytes = 64 hex chars)
const hardwareKey = crypto.randomBytes(32).toString('hex')
console.log('# Hardware Authentication (Arduino → Backend)')
console.log(`HARDWARE_API_KEY=cat_hardware_key_${hardwareKey}`)
console.log()

// Generate Admin API Key (32 bytes = 64 hex chars)
const adminKey = crypto.randomBytes(32).toString('hex')
console.log('# Admin Authentication (Frontend → Backend)')
console.log(`ADMIN_API_KEY=cat_admin_key_${adminKey}`)
console.log()

// Generate VAPID keys for Web Push (if web-push is installed)
try {
  const webpush = require('web-push')
  const vapidKeys = webpush.generateVAPIDKeys()

  console.log('# Web Push Notification Keys')
  console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`)
  console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`)
  console.log(`VAPID_CONTACT=mailto:your-email@example.com`)
  console.log()
} catch (error) {
  console.log('# Web Push Notification Keys')
  console.log('# (Install web-push to generate: npm install web-push)')
  console.log('# VAPID_PUBLIC_KEY=<run with web-push installed>')
  console.log('# VAPID_PRIVATE_KEY=<run with web-push installed>')
  console.log('# VAPID_CONTACT=mailto:your-email@example.com')
  console.log()
}

console.log('=' .repeat(70))
console.log('⚠️  IMPORTANT / 重要提醒:')
console.log('=' .repeat(70))
console.log('1. Update BOTH .env files (backend + frontend)')
console.log('   更新兩個 .env 檔案（後端 + 前端）')
console.log()
console.log('2. Update arduino/smart_cat_serial_bridge/credentials.h')
console.log('   Set BACKEND_API_KEY_STR to match HARDWARE_API_KEY')
console.log('   將 BACKEND_API_KEY_STR 設為與 HARDWARE_API_KEY 相同')
console.log()
console.log('3. Restart all services after updating')
console.log('   更新後重啟所有服務')
console.log('=' .repeat(70))
console.log()
