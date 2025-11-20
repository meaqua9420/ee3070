#!/usr/bin/env node

const chalk = require('chalk')

const url = process.env.BACKEND_URL ?? 'http://localhost:4000'

if (
  process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined &&
  url.startsWith('https://') &&
  /localhost|127\.0\.0\.1/.test(new URL(url).hostname)
) {
  // allow seeding against local self-signed certs; opt out by setting the env var yourself
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

const parseOptionalNumber = (input) => {
  if (input === undefined || input === '') return undefined
  const parsed = Number(input)
  return Number.isFinite(parsed) ? parsed : undefined
}

const payload = {
  reading: {
    temperatureC: Number(process.env.TEMP ?? 25.6),
    humidityPercent: Number(process.env.HUMIDITY ?? 48),
    waterIntakeMl: Number(process.env.WATER ?? 210),
    airQualityIndex: Number(process.env.AQI ?? 32),
    catWeightKg: Number(process.env.WEIGHT ?? 4.05),
    lastFeedingMinutesAgo: Number(process.env.SINCE_FEED ?? 110),
    ambientLightPercent: parseOptionalNumber(process.env.BRIGHTNESS) ?? 55,
    waterLevelPercent: parseOptionalNumber(process.env.WATER_LEVEL_PERCENT),
    timestamp: new Date().toISOString(),
  },
}

async function main() {
  console.log(chalk.cyanBright('[seed] POST'), chalk.white(url))
  console.log(
    chalk.gray('┌ Payload'),
    '\n',
    chalk.gray('│'),
    chalk.white(JSON.stringify(payload.reading, null, 2).replace(/\n/g, '\n │ ')),
    '\n',
    chalk.gray('└'),
  )
  const response = await fetch(`${url.replace(/\/$/, '')}/api/snapshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Request failed (${response.status}): ${text}`)
  }

  const data = await response.json()
  console.log(chalk.green('[seed] snapshot stored'))
  console.log(
    chalk.gray('┌ Latest reading'),
    '\n',
    chalk.gray('│'),
    chalk.white(JSON.stringify(data.data?.reading ?? data, null, 2).replace(/\n/g, '\n │ ')),
    '\n',
    chalk.gray('└'),
  )
}

main().catch((error) => {
  console.error(chalk.red('[seed] failed to post snapshot'), error instanceof Error ? error.message : error)
  process.exitCode = 1
  process.exit(1)
})
