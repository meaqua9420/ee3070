import type { TranslationKey } from '../i18n/translations'

type SerialPort = {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
}

type SerialPortRequestOptions = {
  filters?: Array<{ usbVendorId?: number; usbProductId?: number }>
}

interface NavigatorSerial {
  getPorts(): Promise<SerialPort[]>
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>
}

declare global {
  interface Navigator {
    serial?: NavigatorSerial
  }
}

const BAUD_RATE = 9600
const PING_COMMAND = 'PING\n'
const EXPECTED_RESPONSE = 'PONG'
const TIMEOUT_MS = 2000

interface ArduinoTestResult {
  success: boolean
  latencyMs: number
  messageKey: TranslationKey
}

function timeoutPromise<T>(ms: number): Promise<T> {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer)
      reject(new Error('timeout'))
    }, ms)
  })
}

async function readResponse(port: SerialPort) {
  if (!port.readable) return ''
  const reader = port.readable.getReader()
  try {
    const decoder = new TextDecoder()
    const { value } = await Promise.race([
      reader.read(),
      timeoutPromise<ReadableStreamReadResult<Uint8Array>>(TIMEOUT_MS),
    ])
    return value ? decoder.decode(value) : ''
  } finally {
    reader.releaseLock()
  }
}

async function writeCommand(port: SerialPort, command: string) {
  if (!port.writable) return
  const writer = port.writable.getWriter()
  try {
    const encoder = new TextEncoder()
    await writer.write(encoder.encode(command))
  } finally {
    writer.releaseLock()
  }
}

async function pickSerialPort(): Promise<SerialPort | null> {
  if (typeof navigator === 'undefined' || !navigator.serial) {
    return null
  }

  const serial = navigator.serial
  const ports = await serial.getPorts()
  if (ports.length > 0) {
    return ports[0]
  }

  try {
    return await serial.requestPort({})
  } catch (error) {
    console.warn('[serial] User denied port selection', error)
    return null
  }
}

export async function runArduinoPing(): Promise<ArduinoTestResult> {
  if (typeof navigator === 'undefined' || !('serial' in navigator)) {
    return {
      success: false,
      latencyMs: 0,
      messageKey: 'equipment.status.serialUnsupported',
    }
  }

  const port = await pickSerialPort()
  if (!port) {
    return {
      success: false,
      latencyMs: 0,
      messageKey: 'equipment.status.serialDenied',
    }
  }

  const start = performance.now()
  try {
    if (!port.readable || !port.writable) {
      await port.open({ baudRate: BAUD_RATE })
    }

    await writeCommand(port, PING_COMMAND)
    const response = await readResponse(port)
    const latency = Math.round(performance.now() - start)

    if (response.trim().includes(EXPECTED_RESPONSE)) {
      return {
        success: true,
        latencyMs: latency,
        messageKey: 'equipment.status.ok',
      }
    }

    return {
      success: false,
      latencyMs: latency,
      messageKey: 'equipment.status.arduinoUnexpected',
    }
  } catch (error) {
    console.warn('[serial] Ping failed', error)
    const latency = Math.round(performance.now() - start)
    const isTimeout = error instanceof Error && error.message === 'timeout'

    return {
      success: false,
      latencyMs: latency,
      messageKey: isTimeout
        ? 'equipment.status.arduinoTimeout'
        : 'equipment.status.arduinoError',
    }
  } finally {
    try {
      if (port.readable || port.writable) {
        await port.close()
      }
    } catch (error) {
      console.warn('[serial] Failed to close port', error)
    }
  }
}
