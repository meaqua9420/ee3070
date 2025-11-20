#!/usr/bin/env node
/**
 * Smart Cat Pro Dataset Generator v2
 *
 * Generates high-quality training samples from golden templates
 * with variations in:
 * - Numerical values (within realistic ranges)
 * - Cat names and caregiver names
 * - Time periods (morning/afternoon/evening/night)
 * - Severity levels (minor/moderate/severe)
 * - Language (Chinese/English)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  templatesDir: path.join(__dirname, '../datasets/pro-finetune-v2/templates'),
  outputDir: path.join(__dirname, '../datasets/pro-finetune-v2/generated'),
  variantsPerTemplate: 50, // Generate 50 variants per golden sample
  targetTotal: 400, // Target ~400 samples total
}

// ============================================================================
// Name Banks (for variety)
// ============================================================================

const CAT_NAMES_ZH = ['米香', '布偶', '阿飛', '樂樂', '奶茶', '芝麻', '金寶', '茄子', '布丁', '小虎', '豆腐', '橘子']
const CAT_NAMES_EN = ['Misty', 'Luna', 'Poppy', 'Sage', 'Indigo', 'Hazel', 'Cosmo', 'Milo', 'Olive', 'Ginger']
const CAREGIVER_NAMES_ZH = ['阿姨', 'Jeff', '小琪', '阿偉', '庭庭', '阿哲', '小葵', '晨晨']
const CAREGIVER_NAMES_EN = ['Jordan', 'Dakota', 'Morgan', 'Harper', 'Logan', 'Avery', 'Emerson', 'Taylor', 'Brooke']

// ============================================================================
// Variation Generators
// ============================================================================

/**
 * Vary a numerical value within a ±range
 */
function varyNumber(baseValue, range, decimals = 1) {
  const variation = (Math.random() - 0.5) * 2 * range
  return Number((baseValue + variation).toFixed(decimals))
}

/**
 * Generate realistic timestamp
 */
function generateTimestamp(hourRange = [8, 22]) {
  const [minHour, maxHour] = hourRange
  const hour = Math.floor(Math.random() * (maxHour - minHour) + minHour)
  const minute = Math.floor(Math.random() * 60)
  return `2025-01-0${4 + Math.floor(Math.random() * 3)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`
}

/**
 * Replace names in text while preserving context
 */
function replaceNames(text, oldCatName, newCatName, oldCaregiver, newCaregiver) {
  let result = text
  // Replace cat names (case-insensitive for English)
  result = result.replace(new RegExp(oldCatName, 'gi'), newCatName)
  // Replace caregiver names
  if (oldCaregiver && newCaregiver) {
    result = result.replace(new RegExp(oldCaregiver, 'gi'), newCaregiver)
  }
  return result
}

/**
 * Vary sensor data in system message
 */
function varySensorData(systemContent) {
  let varied = systemContent

  // Vary temperature (±2°C)
  varied = varied.replace(/\"temperatureC\":\s*([\d.]+)/g, (match, value) => {
    return `"temperatureC": ${varyNumber(parseFloat(value), 2, 1)}`
  })

  // Vary humidity (±5%)
  varied = varied.replace(/\"humidityPercent\":\s*([\d.]+)/g, (match, value) => {
    return `"humidityPercent": ${varyNumber(parseFloat(value), 5, 1)}`
  })

  // Vary water intake (±30ml)
  varied = varied.replace(/\"waterIntakeMl\":\s*(\d+)/g, (match, value) => {
    return `"waterIntakeMl": ${Math.floor(varyNumber(parseInt(value), 30, 0))}`
  })

  // Vary weight (±0.2kg)
  varied = varied.replace(/\"(?:catWeightKg|weightKg)\":\s*([\d.]+)/g, (match, value) => {
    return match.replace(value, varyNumber(parseFloat(value), 0.2, 2))
  })

  // Vary heart rate (±10 bpm)
  varied = varied.replace(/\"heartRateBpm\":\s*(\d+)/g, (match, value) => {
    return `"heartRateBpm": ${Math.floor(varyNumber(parseInt(value), 10, 0))}`
  })

  // Vary timestamps
  varied = varied.replace(/\"timestamp\":\s*\"[^\"]+\"/g, () => {
    return `"timestamp": "${generateTimestamp()}"`
  })

  return varied
}

/**
 * Extract cat name and caregiver from sample
 */
function extractNames(sample) {
  const catNameMatch = sample.messages[1]?.content?.match(/(米香|布偶|阿飛|樂樂|奶茶|芝麻|金寶|茄子|布丁|小虎|Misty|Luna|Poppy|Sage|Indigo|Hazel|Cosmo|Milo|Olive|Ginger)/)
  const caregiverMatch = sample.messages[1]?.content?.match(/(阿姨|Jeff|小琪|阿偉|庭庭|阿哲|小葵|晨晨|Jordan|Dakota|Morgan|Harper|Logan|Avery|Emerson|Taylor|Brooke)/)

  return {
    catName: catNameMatch ? catNameMatch[1] : null,
    caregiver: caregiverMatch ? caregiverMatch[1] : null,
  }
}

/**
 * Detect language of sample
 */
function detectLanguage(sample) {
  const userContent = sample.messages[1]?.content || ''
  // Simple heuristic: if contains Chinese characters, it's Chinese
  return /[\u4e00-\u9fa5]/.test(userContent) ? 'zh' : 'en'
}

/**
 * Generate variant of a golden sample
 */
function generateVariant(goldenSample, index) {
  const lang = detectLanguage(goldenSample)
  const { catName: oldCatName, caregiver: oldCaregiver } = extractNames(goldenSample)

  // Pick new names
  const newCatName = lang === 'zh'
    ? CAT_NAMES_ZH[index % CAT_NAMES_ZH.length]
    : CAT_NAMES_EN[index % CAT_NAMES_EN.length]

  const newCaregiver = lang === 'zh'
    ? CAREGIVER_NAMES_ZH[index % CAREGIVER_NAMES_ZH.length]
    : CAREGIVER_NAMES_EN[index % CAREGIVER_NAMES_EN.length]

  // Deep clone the sample
  const variant = JSON.parse(JSON.stringify(goldenSample))

  // Vary system message (sensor data)
  variant.messages[0].content = varySensorData(variant.messages[0].content)

  // Replace names in user message
  if (oldCatName) {
    variant.messages[1].content = replaceNames(
      variant.messages[1].content,
      oldCatName,
      newCatName,
      oldCaregiver,
      newCaregiver
    )
  }

  // Replace names in assistant message
  if (oldCatName) {
    variant.messages[2].content = replaceNames(
      variant.messages[2].content,
      oldCatName,
      newCatName,
      oldCaregiver,
      newCaregiver
    )
  }

  // Replace names in thinking
  if (variant.messages[2].thinking && oldCatName) {
    variant.messages[2].thinking = replaceNames(
      variant.messages[2].thinking,
      oldCatName,
      newCatName,
      oldCaregiver,
      newCaregiver
    )
  }

  return variant
}

// ============================================================================
// Main Generation Logic
// ============================================================================

async function main() {
  console.log('🚀 Smart Cat Pro Dataset Generator v2\\n')

  // Create output directory if it doesn't exist
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true })
  }

  // Read all template files
  const templateFiles = fs.readdirSync(CONFIG.templatesDir).filter(f => f.endsWith('.jsonl'))
  console.log(`📂 Found ${templateFiles.length} template files`)

  const allSamples = []

  // Process each template file
  for (const templateFile of templateFiles) {
    const templatePath = path.join(CONFIG.templatesDir, templateFile)
    const templateContent = fs.readFileSync(templatePath, 'utf-8')
    const goldenSamples = templateContent
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line))

    console.log(`\\n📄 Processing: ${templateFile}`)
    console.log(`   Golden samples: ${goldenSamples.length}`)

    // Generate variants for each golden sample
    for (let i = 0; i < goldenSamples.length; i++) {
      const goldenSample = goldenSamples[i]
      const lang = detectLanguage(goldenSample)
      const categoryName = templateFile.replace('.jsonl', '')

      console.log(`   ├─ Sample ${i + 1} (${lang}): Generating ${CONFIG.variantsPerTemplate} variants...`)

      // Keep the golden sample
      allSamples.push(goldenSample)

      // Generate variants
      for (let j = 0; j < CONFIG.variantsPerTemplate; j++) {
        const variant = generateVariant(goldenSample, j)
        allSamples.push(variant)
      }

      // Save variants to separate file
      const outputFile = path.join(
        CONFIG.outputDir,
        `${categoryName}_${lang}_${i + 1}_variants.jsonl`
      )
      const variants = [goldenSample]
      for (let j = 0; j < CONFIG.variantsPerTemplate; j++) {
        variants.push(generateVariant(goldenSample, j))
      }
      fs.writeFileSync(outputFile, variants.map(v => JSON.stringify(v)).join('\n'))
      console.log(`      ✓ Saved to ${path.basename(outputFile)}`)
    }
  }

  console.log(`\\n✅ Generated ${allSamples.length} total samples`)

  // Split into train/valid/test (80/10/10)
  const shuffled = allSamples.sort(() => Math.random() - 0.5)
  const trainSize = Math.floor(shuffled.length * 0.8)
  const validSize = Math.floor(shuffled.length * 0.1)

  const trainSamples = shuffled.slice(0, trainSize)
  const validSamples = shuffled.slice(trainSize, trainSize + validSize)
  const testSamples = shuffled.slice(trainSize + validSize)

  // Save splits
  const outputBase = path.join(__dirname, '../datasets/pro-finetune-v2')
  fs.writeFileSync(
    path.join(outputBase, 'train.jsonl'),
    trainSamples.map(s => JSON.stringify(s)).join('\n')
  )
  fs.writeFileSync(
    path.join(outputBase, 'valid.jsonl'),
    validSamples.map(s => JSON.stringify(s)).join('\n')
  )
  fs.writeFileSync(
    path.join(outputBase, 'test.jsonl'),
    testSamples.map(s => JSON.stringify(s)).join('\n')
  )

  console.log(`\\n📊 Dataset splits:`)
  console.log(`   ├─ train.jsonl: ${trainSamples.length} samples (${Math.round(trainSamples.length / shuffled.length * 100)}%)`)
  console.log(`   ├─ valid.jsonl: ${validSamples.length} samples (${Math.round(validSamples.length / shuffled.length * 100)}%)`)
  console.log(`   └─ test.jsonl: ${testSamples.length} samples (${Math.round(testSamples.length / shuffled.length * 100)}%)`)

  console.log(`\\n🎉 Dataset generation complete!`)
  console.log(`\\n💡 Next steps:`)
  console.log(`   1. Review samples: head -n 1 datasets/pro-finetune-v2/train.jsonl | jq`)
  console.log(`   2. Validate quality: node scripts/validate-dataset-v2.mjs`)
  console.log(`   3. Start training: mlx_lm.lora --data datasets/pro-finetune-v2`)
}

main().catch(console.error)
