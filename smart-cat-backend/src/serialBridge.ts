import { SerialPort, ReadlineParser } from 'serialport'
import type { SmartHomeReading } from './types'
import { isSmartHomeReading } from './utils'
import { logger } from './logger'

interface SerialBridgeOptions {
  portPath: string
  baudRate: number
  onReading: (reading: SmartHomeReading) => void
}

export interface SerialBridgeConnection {
  sendCommand: (command: unknown) => Promise<void>
  close: () => Promise<void>
}

type PendingWrite = {
  line: string
  resolve: () => void
  reject: (error: Error) => void
}

export function startSerialBridge(options: SerialBridgeOptions): SerialBridgeConnection {
  const { portPath, baudRate, onReading } = options

  const port = new SerialPort({
    path: portPath,
    baudRate,
    autoOpen: false,
  })

  let isOpen = false
  let isClosing = false
  let openError: Error | null = null
  const writeQueue: PendingWrite[] = []

  // 💓 Heartbeat detection: Track last data received
  const HEARTBEAT_TIMEOUT_MS = 30 * 1000 // 30 seconds
  let lastDataTime = Date.now()
  let heartbeatCheckInterval: NodeJS.Timeout | null = null

  const processQueue = () => {
    if (!isOpen || isClosing || openError) return
    const next = writeQueue.shift()
    if (!next) return

    port.write(`${next.line}\n`, (writeError) => {
      if (writeError) {
        next.reject(writeError)
        processQueue()
        return
      }
      port.drain((drainError) => {
        if (drainError) {
          next.reject(drainError)
        } else {
          next.resolve()
        }
        processQueue()
      })
    })
  }

  port.open((error) => {
    if (error) {
      logger.error('[serial] Failed to open port', error.message)
      openError = error instanceof Error ? error : new Error(String(error))
      while (writeQueue.length > 0) {
        writeQueue.shift()?.reject(openError)
      }
      return
    }
    logger.info(`[serial] Connected to ${portPath} @ ${baudRate} baud`)
  })

  port.on('open', () => {
    isOpen = true
    lastDataTime = Date.now() // Reset heartbeat on connect
    processQueue()

    // 💓 Start heartbeat monitoring
    heartbeatCheckInterval = setInterval(() => {
      const timeSinceLastData = Date.now() - lastDataTime
      if (timeSinceLastData > HEARTBEAT_TIMEOUT_MS) {
        logger.error(
          `[serial] ⚠️  No data received for ${Math.round(timeSinceLastData / 1000)}s (timeout: ${HEARTBEAT_TIMEOUT_MS / 1000}s)`
        )
        logger.error('[serial] Arduino may be disconnected or frozen. Manual intervention required.')
        // Note: Auto-reconnection could be added here, but requires careful handling
        // to avoid infinite loops if Arduino is permanently dead
      }
    }, 10 * 1000) // Check every 10 seconds
  })

  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }))

  parser.on('data', (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return

    // 💓 Update heartbeat timestamp on any data received
    lastDataTime = Date.now()

    try {
      const payload = JSON.parse(trimmed)
      if (isSmartHomeReading(payload)) {
        onReading(payload)
      } else if (payload?.reading && isSmartHomeReading(payload.reading)) {
        onReading(payload.reading)
      } else {
        logger.warn('[serial] Received unsupported payload', payload)
      }
    } catch (error) {
      logger.warn('[serial] Failed to parse incoming line', trimmed, error)
    }
  })

  parser.on('error', (error) => {
    logger.error('[serial] Parser error', error)
  })

  port.on('error', (error) => {
    logger.error('[serial] Port error', error)
    if (!openError) {
      openError = error instanceof Error ? error : new Error(String(error))
      while (writeQueue.length > 0) {
        writeQueue.shift()?.reject(openError)
      }
    }
  })

  const sendCommand = (command: unknown) => {
    if (isClosing) {
      return Promise.reject(new Error('Serial port is closing.'))
    }
    if (openError) {
      return Promise.reject(openError)
    }
    const line = typeof command === 'string' ? command : JSON.stringify(command)
    return new Promise<void>((resolve, reject) => {
      writeQueue.push({
        line,
        resolve,
        reject,
      })
      if (isOpen && writeQueue.length === 1) {
        processQueue()
      }
    })
  }

  const close = async () => {
    isClosing = true
    // 💓 Stop heartbeat monitoring
    if (heartbeatCheckInterval) {
      clearInterval(heartbeatCheckInterval)
      heartbeatCheckInterval = null
    }
    parser.removeAllListeners()
    while (writeQueue.length > 0) {
      writeQueue.shift()?.reject(new Error('Serial port closed.'))
    }
    return new Promise<void>((resolve) => {
      port.close(() => {
        isOpen = false
        resolve()
      })
    })
  }

  return {
    sendCommand,
    close,
  }
}

export function maybeStartSerialBridge(onReading: (reading: SmartHomeReading) => void): SerialBridgeConnection | null {
  const enabled = (process.env.SERIAL_ENABLED ?? 'false').toLowerCase() === 'true'
  if (!enabled) {
    logger.info('[serial] SERIAL_ENABLED not true, skipping serial bridge.')
    return null
  }

  const portPath = process.env.SERIAL_PORT
  if (!portPath) {
    logger.warn('[serial] SERIAL_PORT is not configured; skipping serial bridge.')
    return null
  }

  const baudRate = Number(process.env.SERIAL_BAUD ?? 115200)

  return startSerialBridge({
    portPath,
    baudRate,
    onReading,
  })
}
