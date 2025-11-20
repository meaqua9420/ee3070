#!/usr/bin/env node
/**
 * Simple smoke test for /api/chat/suggestions.
 *
 * Usage:
 *   node scripts/chat_smoke_test.js
 * (Make sure the backend is running on http://localhost:4000)
 */

const API_URL = process.env.SMART_CAT_BACKEND_URL ?? 'http://localhost:4000'

const CASES = [
  '貓咪剛從收容所領回，還不太敢出來，要怎麼照顧？',
  'Water intake has been low for two days (around 120ml). What should I do?',
  '溫度連續兩天在 30°C 左右，貓咪會太熱嗎？'
]

async function runPrompt(prompt) {
  const response = await fetch(`${API_URL}/api/chat/suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for prompt: ${prompt}`)
  }

  const json = await response.json()
  const content = json?.data?.choices?.[0]?.message?.content ?? json?.message ?? ''
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error(`Empty response for prompt: ${prompt}`)
  }

  console.log(`\nPrompt: ${prompt}`)
  console.log('--- Reply ---')
  console.log(content.trim())
}

async function main() {
  for (const prompt of CASES) {
    await runPrompt(prompt)
  }
  console.log('\nSmoke test completed successfully.')
}

main().catch((error) => {
  console.error('Smoke test failed:', error)
  process.exit(1)
})
