#!/usr/bin/env node
/**
 * esbuild 構建腳本 - 快速編譯 TypeScript 後端
 * esbuild build script - Fast TypeScript backend compilation
 *
 * 速度對比 / Speed comparison:
 * - TypeScript (tsc): ~234 秒 / ~234 seconds
 * - esbuild: ~1-3 秒 / ~1-3 seconds
 *
 * 注意 / Note:
 * esbuild 不執行類型檢查，請使用 npm run typecheck 檢查類型
 * esbuild does not perform type checking, use npm run typecheck for that
 */

import esbuild from 'esbuild'
import { glob } from 'glob'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = path.resolve(__dirname, 'src')
const DIST_ROOT = path.resolve(__dirname, 'dist')
const FORCE_FULL_BUILD = ['1', 'true', 'yes'].includes(String(process.env.FORCE_FULL_BUILD ?? '').toLowerCase())

// 找出所有 TypeScript 入口檔案
// Find all TypeScript entry files
const entryPoints = await glob('src/**/*.ts', {
  ignore: [
    'src/**/*.test.ts',
    'src/**/*.spec.ts',
    // 排除那些文檔類型的檔案（在 tsconfig.json 中也被排除）
    'src/AI_REFACTORING_GUIDE.ts',
    'src/AI_IMPROVEMENTS_DETAILED.ts',
    'src/DATABASE_ERROR_HANDLING.ts',
    'src/IMPROVEMENTS_EXAMPLE.ts',
    // ❌ REMOVED: src/validators.ts is actually used by index.ts!
  ],
})

console.log(`📦 Building ${entryPoints.length} TypeScript files with esbuild...`)

try {
  const startTime = Date.now()

  // 🔁 清理不存在的輸出檔案 / Remove orphaned outputs
  const distOutputs = await glob('dist/**/*.js')
  let removedOutputs = 0
  await Promise.all(
    distOutputs.map(async (distPath) => {
      const relative = path.relative(DIST_ROOT, path.resolve(__dirname, distPath))
      const sourceCandidate = path.resolve(SRC_ROOT, relative.replace(/\.js$/, '.ts'))
      if (!existsSync(sourceCandidate)) {
        await rm(path.resolve(__dirname, distPath), { force: true })
        removedOutputs += 1
      }
    }),
  )
  if (removedOutputs > 0) {
    console.log(`🧹 Removed ${removedOutputs} orphaned output file(s)`)
  }

  const toBuild = []

  if (!FORCE_FULL_BUILD) {
    await Promise.all(
      entryPoints.map(async (entry) => {
        const absSrc = path.resolve(__dirname, entry)
        const rel = path.relative(SRC_ROOT, absSrc)
        const distCandidate = path.resolve(DIST_ROOT, rel.replace(/\.ts$/, '.js'))

        try {
          const [srcStat, distStat] = await Promise.all([
            stat(absSrc),
            stat(distCandidate),
          ])
          if (srcStat.mtimeMs > distStat.mtimeMs) {
            toBuild.push(entry)
          }
        } catch (error) {
          // 若 dist 不存在或無法讀取，將其視為需要重建
          toBuild.push(entry)
        }
      }),
    )
  }

  const entryPointsToBuild = FORCE_FULL_BUILD ? entryPoints : toBuild

  if (entryPointsToBuild.length === 0) {
    console.log('✅ All outputs are up to date. Skipping rebuild. (Use FORCE_FULL_BUILD=1 to override)')
    process.exit(0)
  }

  await esbuild.build({
    entryPoints: entryPointsToBuild,
    bundle: false, // 不打包，保持模組結構（因為我們有 node_modules）
    platform: 'node', // Node.js 平台
    target: 'node18', // 目標 Node.js 版本
    format: 'cjs', // CommonJS 格式（符合 package.json type: "commonjs"）
    outdir: 'dist', // 輸出目錄
    outbase: 'src', // 保持原始目錄結構
    sourcemap: false, // 不生成 sourcemap（更快，符合 tsconfig.json）
    logLevel: 'info', // 顯示構建信息
    minify: false, // 不壓縮（保持可讀性，方便調試）
    keepNames: true, // 保留函數名稱（方便錯誤追蹤）
  })

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log(`✅ Compiled ${entryPointsToBuild.length} file(s) in ${duration}s`)
  console.log(`📁 Output: dist/`)
  console.log(``)
  console.log(`💡 Tip: Run 'npm run typecheck' to verify TypeScript types`)
  console.log(`💡 提示：運行 'npm run typecheck' 來檢查 TypeScript 類型`)
} catch (error) {
  console.error('❌ Build failed:', error)
  process.exit(1)
}
