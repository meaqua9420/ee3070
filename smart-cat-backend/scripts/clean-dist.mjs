#!/usr/bin/env node

import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 清空 dist 輸出，讓重新建置時完整生成所有 AI 相關檔案。
 * Remove the dist output so the next build regenerates every AI artifact.
 */
const here = fileURLToPath(new URL('.', import.meta.url))
const distDir = resolve(here, '..', 'dist')

await rm(distDir, { recursive: true, force: true })
