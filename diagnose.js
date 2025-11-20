#!/usr/bin/env node
/**
 * 🔧 Smart Cat Home - 性能诊断工具
 * Performance Diagnostic Tool
 */

const { exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)

console.log('🔍 Smart Cat Home - 性能诊断工具')
console.log('===================================\n')

async function checkPorts() {
  console.log('📡 检查端口占用...')
  try {
    const { stdout } = await execAsync('lsof -i :4000 -i :5173 2>/dev/null || true')
    if (stdout) {
      console.log('  ⚠️  发现占用的端口:')
      console.log(stdout)
    } else {
      console.log('  ✅ 端口 4000 和 5173 空闲')
    }
  } catch (e) {
    console.log('  ℹ️  无法检查端口（可能需要权限）')
  }
  console.log('')
}

async function checkDependencies() {
  console.log('📦 检查依赖大小...')

  try {
    const { stdout: backendSize } = await execAsync('du -sh smart-cat-backend/node_modules 2>/dev/null || echo "未找到"')
    console.log(`  后端 node_modules: ${backendSize.trim()}`)

    const { stdout: frontendSize } = await execAsync('du -sh smart-cat-home/node_modules 2>/dev/null || echo "未找到"')
    console.log(`  前端 node_modules: ${frontendSize.trim()}`)

    // 检查 Xenova transformers (TTS 依赖，很大)
    const { stdout: xenovaSize } = await execAsync('du -sh smart-cat-backend/node_modules/@xenova 2>/dev/null || echo "未找到"')
    console.log(`  @xenova/transformers: ${xenovaSize.trim()}`)
  } catch (e) {
    console.log('  ⚠️  无法检查依赖大小')
  }
  console.log('')
}

async function checkBuildArtifacts() {
  console.log('🏗️  检查构建产物...')

  try {
    const { stdout: backendDist } = await execAsync('ls -lh smart-cat-backend/dist 2>/dev/null | head -5 || echo "未找到"')
    console.log('  后端 dist/')
    console.log('  ' + (backendDist.includes('未找到') ? '❌ 不存在' : '✅ 存在'))

    const { stdout: frontendDist } = await execAsync('ls -lh smart-cat-home/dist 2>/dev/null | head -5 || echo "未找到"')
    console.log('  前端 dist/')
    console.log('  ' + (frontendDist.includes('未找到') ? '❌ 不存在' : '✅ 存在'))
  } catch (e) {
    console.log('  ⚠️  无法检查构建产物')
  }
  console.log('')
}

async function checkNodeModulesCache() {
  console.log('🗂️  检查缓存...')

  try {
    const { stdout: viteCache } = await execAsync('du -sh smart-cat-home/node_modules/.vite 2>/dev/null || echo "未找到"')
    console.log(`  Vite 缓存: ${viteCache.trim()}`)

    const { stdout: tsBuildInfo } = await execAsync('ls -lh smart-cat-backend/dist/.tsbuildinfo 2>/dev/null || echo "未找到"')
    console.log(`  TypeScript 增量构建: ${tsBuildInfo.includes('未找到') ? '❌ 未找到' : '✅ 存在'}`)
  } catch (e) {
    console.log('  ℹ️  无缓存')
  }
  console.log('')
}

async function suggestOptimizations() {
  console.log('💡 优化建议...')

  // 检查前端配置
  try {
    const fs = require('fs')
    const viteConfig = fs.readFileSync('smart-cat-home/vite.config.ts', 'utf8')

    if (viteConfig.includes('enabled: true') && viteConfig.includes('devOptions')) {
      console.log('  ⚠️  检测到开发时启用了 PWA，建议禁用以加快启动速度')
      console.log('      修改 vite.config.ts 中的 devOptions.enabled 为 false')
    }

    if (viteConfig.includes('manualChunks') && viteConfig.match(/if.*components/)) {
      console.log('  ⚠️  检测到复杂的代码分割策略，可能影响构建速度')
      console.log('      可以简化 manualChunks 配置')
    }
  } catch (e) {
    console.log('  ℹ️  无法读取配置文件')
  }

  console.log('')
  console.log('  📚 推荐使用:')
  console.log('     - 开发: npm run dev (无需构建)')
  console.log('     - 生产: npm run build && npm start')
  console.log('     - 快速启动: ./quick-start.sh')
  console.log('')
}

async function main() {
  await checkPorts()
  await checkDependencies()
  await checkBuildArtifacts()
  await checkNodeModulesCache()
  await suggestOptimizations()

  console.log('✅ 诊断完成！')
  console.log('')
  console.log('💡 如需帮助，请查看:')
  console.log('   - README.md: 项目文档')
  console.log('   - QUICK_START_ZH.md: 快速启动指南')
  console.log('   - PERFORMANCE_FIXES_ZH.md: 性能优化指南')
}

main().catch(console.error)
