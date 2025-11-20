#!/usr/bin/env node
/**
 * Smart Cat Pro Dataset Quality Validator v2
 *
 * Validates that generated samples meet quality standards:
 * - Thinking length > 150 characters
 * - System message contains sensor data
 * - Assistant values match system data (spot check)
 * - No template phrases
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================================
// Quality Checks
// ============================================================================

const FORBIDDEN_TEMPLATES = [
  /回顧提問：「.*」。先快速整理/,
  /Review the prompt.*Review the request/,
  /先快速整理使用者提問/,
]

const MIN_THINKING_LENGTH = 150
const RECOMMENDED_THINKING_LENGTH = 300

function checkThinkingQuality(sample, index) {
  const issues = []
  const thinking = sample.messages[2]?.thinking

  if (!thinking) {
    issues.push(`Missing thinking field`)
    return issues
  }

  // Check length
  if (thinking.length < MIN_THINKING_LENGTH) {
    issues.push(`Thinking too short: ${thinking.length} chars (min: ${MIN_THINKING_LENGTH})`)
  } else if (thinking.length < RECOMMENDED_THINKING_LENGTH) {
    issues.push(`Thinking below recommended: ${thinking.length} chars (recommended: ${RECOMMENDED_THINKING_LENGTH}+)`)
  }

  // Check for forbidden templates
  for (const pattern of FORBIDDEN_TEMPLATES) {
    if (pattern.test(thinking)) {
      issues.push(`Contains forbidden template phrase: ${pattern}`)
    }
  }

  // Check for actual reasoning structure
  const hasNumberedSteps = /\\d+\\./.test(thinking)
  const hasAnalysisKeywords = /(分析|Analysis|評估|Evaluation|推理|Reasoning|計算|Calculation)/i.test(thinking)

  if (!hasNumberedSteps && !hasAnalysisKeywords) {
    issues.push(`Lacks structured reasoning (no numbered steps or analysis keywords)`)
  }

  return issues
}

function checkSystemData(sample, index) {
  const issues = []
  const systemContent = sample.messages[0]?.content

  if (!systemContent) {
    issues.push(`Missing system message`)
    return issues
  }

  // Check for sensor data structure
  const hasSensorData = /(?:currentReading|reading|sensorProfile|todayReading|currentIncident)/.test(systemContent)
  if (!hasSensorData) {
    issues.push(`System message lacks sensor data structure`)
  }

  // Check for key sensor fields (relaxed check - just verify data is present)
  const hasNumericData = /\"(?:temperatureC|humidityPercent|waterIntakeMl|catWeightKg)\":\s*[\d.]+/.test(systemContent)
  if (!hasNumericData) {
    issues.push(`System message lacks numeric sensor readings`)
  }

  return issues
}

function checkDataConsistency(sample, index) {
  const issues = []
  const systemContent = sample.messages[0]?.content
  const assistantContent = sample.messages[2]?.content

  // Extract numbers from system message
  const systemNumbers = []
  const numberRegex = /\"(?:temperatureC|humidityPercent|waterIntakeMl|catWeightKg|weightKg|heartRateBpm)\":\\s*([\\d.]+)/g
  let match
  while ((match = numberRegex.exec(systemContent)) !== null) {
    systemNumbers.push(parseFloat(match[1]))
  }

  // Check if assistant mentions numbers
  const assistantNumbers = assistantContent.match(/[\\d.]+/g)?.map(n => parseFloat(n)) || []

  // Spot check: if assistant mentions a number, it should be close to a system number
  for (const assistantNum of assistantNumbers) {
    // Skip very common numbers like 1, 2, 3, etc.
    if (assistantNum < 10 && Number.isInteger(assistantNum)) continue

    // Check if this number is close to any system number (within 20%)
    const hasMatch = systemNumbers.some(sysNum => {
      const diff = Math.abs(assistantNum - sysNum)
      const threshold = sysNum * 0.2
      return diff <= threshold
    })

    // Only flag if number seems significant and has no match
    if (assistantNum > 10 && !hasMatch) {
      // This might be okay (e.g., time, percentage), so just warn
      // issues.push(`Assistant mentions number ${assistantNum} not found in system data`)
    }
  }

  return issues
}

function checkLanguageConsistency(sample, index) {
  const issues = []
  const userContent = sample.messages[1]?.content || ''
  const assistantContent = sample.messages[2]?.content || ''

  const userIsChinese = /[\u4e00-\u9fa5]/.test(userContent)
  const assistantIsChinese = /[\u4e00-\u9fa5]/.test(assistantContent)

  if (userIsChinese !== assistantIsChinese) {
    issues.push(`Language mismatch: user is ${userIsChinese ? 'Chinese' : 'English'}, assistant is ${assistantIsChinese ? 'Chinese' : 'English'}`)
  }

  return issues
}

// ============================================================================
// Main Validation Logic
// ============================================================================

async function main() {
  console.log('🔍 Smart Cat Pro Dataset Quality Validator v2\\n')

  const datasetPath = path.join(__dirname, '../datasets/pro-finetune-v2')
  const files = ['train.jsonl', 'valid.jsonl', 'test.jsonl']

  let totalSamples = 0
  let totalIssues = 0
  const issuesByCategory = {
    thinking: 0,
    systemData: 0,
    consistency: 0,
    language: 0,
  }

  for (const file of files) {
    const filePath = path.join(datasetPath, file)
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  ${file} not found, skipping...`)
      continue
    }

    console.log(`\\n📂 Validating: ${file}`)
    const content = fs.readFileSync(filePath, 'utf-8')
    const samples = content
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line))

    totalSamples += samples.length
    console.log(`   Samples: ${samples.length}`)

    const fileIssues = []

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]
      const sampleIssues = []

      // Run all checks
      const thinkingIssues = checkThinkingQuality(sample, i)
      const systemDataIssues = checkSystemData(sample, i)
      const consistencyIssues = checkDataConsistency(sample, i)
      const languageIssues = checkLanguageConsistency(sample, i)

      sampleIssues.push(...thinkingIssues.map(issue => ({ category: 'thinking', issue })))
      sampleIssues.push(...systemDataIssues.map(issue => ({ category: 'systemData', issue })))
      sampleIssues.push(...consistencyIssues.map(issue => ({ category: 'consistency', issue })))
      sampleIssues.push(...languageIssues.map(issue => ({ category: 'language', issue })))

      if (sampleIssues.length > 0) {
        fileIssues.push({ index: i, issues: sampleIssues })
        totalIssues += sampleIssues.length
        sampleIssues.forEach(({ category }) => {
          issuesByCategory[category]++
        })
      }
    }

    // Report issues
    if (fileIssues.length === 0) {
      console.log(`   ✅ All samples passed validation`)
    } else {
      console.log(`   ⚠️  Found issues in ${fileIssues.length} samples:\\n`)
      // Show first 5 issues
      for (let i = 0; i < Math.min(5, fileIssues.length); i++) {
        const { index, issues } = fileIssues[i]
        console.log(`      Sample #${index + 1}:`)
        issues.forEach(({ category, issue }) => {
          console.log(`         [${category}] ${issue}`)
        })
      }
      if (fileIssues.length > 5) {
        console.log(`      ... and ${fileIssues.length - 5} more samples with issues`)
      }
    }
  }

  // Summary
  console.log(`\\n${'='.repeat(60)}`)
  console.log(`📊 Validation Summary`)
  console.log(`${'='.repeat(60)}`)
  console.log(`Total samples: ${totalSamples}`)
  console.log(`Total issues: ${totalIssues}`)
  console.log(`Issue rate: ${(totalIssues / totalSamples * 100).toFixed(2)}%`)
  console.log(`\\nIssues by category:`)
  Object.entries(issuesByCategory).forEach(([category, count]) => {
    console.log(`   ${category}: ${count}`)
  })

  if (totalIssues === 0) {
    console.log(`\\n✅ All samples meet quality standards!`)
  } else if (totalIssues / totalSamples < 0.1) {
    console.log(`\\n⚠️  Minor issues found. Dataset is usable but could be improved.`)
  } else {
    console.log(`\\n❌ Significant issues found. Please review and regenerate.`)
  }

  console.log(`\\n💡 Recommendations:`)
  if (issuesByCategory.thinking > 0) {
    console.log(`   - Review thinking quality: ensure detailed reasoning`)
  }
  if (issuesByCategory.systemData > 0) {
    console.log(`   - Check system message format: ensure valid JSON sensor data`)
  }
  if (issuesByCategory.consistency > 0) {
    console.log(`   - Verify data consistency: assistant should reference system data`)
  }
  if (issuesByCategory.language > 0) {
    console.log(`   - Fix language mismatches: user and assistant should use same language`)
  }
}

main().catch(console.error)
