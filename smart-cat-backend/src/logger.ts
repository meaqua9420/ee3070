import type { RequestHandler } from 'express'
import morgan from 'morgan'
import chalk from 'chalk'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const DEFAULT_LEVEL: LogLevel =
  process.env.LOG_LEVEL === 'debug'
    ? 'debug'
    : process.env.LOG_LEVEL === 'warn'
      ? 'warn'
      : process.env.LOG_LEVEL === 'error'
        ? 'error'
        : process.env.NODE_ENV === 'production'
          ? 'info'
          : 'debug'

type LogMeta = Record<string, unknown> | string | unknown[]

function formatMeta(meta?: LogMeta): string {
  if (!meta) return ''
  try {
    if (Array.isArray(meta)) {
      return meta.length ? ` ${meta.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join(' ')}` : ''
    }
    if (typeof meta === 'string') {
      return meta.length ? ` ${meta}` : ''
    }
    const fragments = Object.entries(meta as Record<string, unknown>)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`)
    return fragments.length ? ` ${fragments.join(' ')}` : ''
  } catch {
    return ''
  }
}

function createLogger(level: LogLevel = DEFAULT_LEVEL) {
  const activeLevel = level

  const log = (logLevel: LogLevel, message: string, ...meta: LogMeta[]) => {
    if (LEVEL_PRIORITY[logLevel] < LEVEL_PRIORITY[activeLevel]) {
      return
    }
    const timestamp = new Date().toISOString()
    const output = `[${timestamp}] [${logLevel.toUpperCase()}] ${message}${meta.length ? formatMeta(meta.length === 1 ? meta[0] : meta) : ''}`
    if (logLevel === 'error') {
      console.error(output)
    } else if (logLevel === 'warn') {
      console.warn(output)
    } else if (logLevel === 'info') {
      console.info(output)
    } else {
      console.debug(output)
    }
  }

  return {
    debug(message: string, ...meta: LogMeta[]) {
      log('debug', message, ...meta)
    },
    info(message: string, ...meta: LogMeta[]) {
      log('info', message, ...meta)
    },
    warn(message: string, ...meta: LogMeta[]) {
      log('warn', message, ...meta)
    },
    error(message: string, ...meta: LogMeta[]) {
      log('error', message, ...meta)
    },
  }
}

export const logger = createLogger()

export function createHttpLogger(): RequestHandler {
  return morgan((tokens, req, res) => {
    const method = tokens.method(req, res)
    const url = tokens.url(req, res)
    const status = tokens.status(req, res)
    const responseTime = tokens['response-time'](req, res)
    const length = tokens.res(req, res, 'content-length') || '0'

    const statusNumber = Number(status)
    let coloredStatus = status
    if (statusNumber >= 500) {
      coloredStatus = chalk.red(status ?? '')
    } else if (statusNumber >= 400) {
      coloredStatus = chalk.yellow(status ?? '')
    } else if (statusNumber >= 200) {
      coloredStatus = chalk.green(status ?? '')
    } else {
      coloredStatus = chalk.cyan(status ?? '')
    }

    const coloredMethod = chalk.blue(method ?? '')

    logger.info(
      `[http] ${coloredMethod} ${url} ${coloredStatus} - ${responseTime}ms size=${length}`,
    )
    return ''
  })
}
