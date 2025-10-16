import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const certPath = path.resolve(__dirname, 'localhost+2.pem')
const keyPath = path.resolve(__dirname, 'localhost+2-key.pem')

const useHttps = fs.existsSync(certPath) && fs.existsSync(keyPath)
const basePath =
  process.env.SMART_CAT_BASE ??
  (process.env.NODE_ENV === 'production' ? '/ee3070/' : '/')

export default defineConfig({
  base: basePath,
  plugins: [react()],
  server: {
    host: true,
    hmr: false,
    https: useHttps
      ? {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath),
        }
      : undefined,
  },
})
