import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcrypt'
import type { Request, Response } from 'express'

import { logger } from './logger'

export type UserRole = 'developer' | 'user'

export interface AuthenticatedUser {
  username: string
  displayName: string
  role: UserRole
}

// 🔒 安全性改進：使用 bcrypt 並設定固定成本，避免載入時 TDZ 觸發
const BCRYPT_ROUNDS = 12 // 成本因子：2^12 次迭代（約 250-350ms）

const SESSION_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours

interface UserAccount {
  username: string
  passwordHash: string
  role: UserRole
  displayName: string
}

interface AuthConfigEntry {
  username?: string
  passwordHash?: string
  password?: string
  role?: UserRole
  displayName?: string
}

interface SessionEntry {
  user: AuthenticatedUser
  createdAt: number
}

function resolveUsersConfigFromEnv(): AuthConfigEntry[] {
  const inline = process.env.SMARTCAT_AUTH_USERS?.trim()
  const filePath = process.env.SMARTCAT_AUTH_USERS_FILE?.trim()

  if (inline && inline.length > 0) {
    try {
      const parsed = JSON.parse(inline) as unknown
      if (!Array.isArray(parsed)) {
        throw new Error('SMARTCAT_AUTH_USERS must be a JSON array.')
      }
      return parsed as AuthConfigEntry[]
    } catch (error) {
      throw new Error(
        `[auth] Failed to parse SMARTCAT_AUTH_USERS: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  if (filePath && filePath.length > 0) {
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8')
      const parsed = JSON.parse(content) as unknown
      if (!Array.isArray(parsed)) {
        throw new Error('SMARTCAT_AUTH_USERS_FILE must contain a JSON array.')
      }
      return parsed as AuthConfigEntry[]
    } catch (error) {
      throw new Error(
        `[auth] Failed to read SMARTCAT_AUTH_USERS_FILE (${resolvedPath}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  throw new Error(
    '[auth] Authentication requires SMARTCAT_AUTH_USERS or SMARTCAT_AUTH_USERS_FILE to be configured.',
  )
}

function normalizeConfigEntry(entry: AuthConfigEntry): UserAccount {
  if (!entry || typeof entry.username !== 'string' || entry.username.trim().length === 0) {
    throw new Error('[auth] Each user entry must include a non-empty username.')
  }
  const username = entry.username.trim()
  const displayName =
    typeof entry.displayName === 'string' && entry.displayName.trim().length > 0
      ? entry.displayName.trim()
      : username
  const role: UserRole = entry.role === 'developer' ? 'developer' : 'user'

  let passwordHash = typeof entry.passwordHash === 'string' ? entry.passwordHash.trim() : ''
  if (!passwordHash && typeof entry.password === 'string' && entry.password.length > 0) {
    passwordHash = bcrypt.hashSync(entry.password, BCRYPT_ROUNDS)
  }
  if (!passwordHash || !passwordHash.startsWith('$2')) {
    throw new Error(
      `[auth] Account "${username}" is missing a valid bcrypt passwordHash (supply "passwordHash" or plaintext "password").`,
    )
  }

  return {
    username,
    displayName,
    role,
    passwordHash,
  }
}

function loadUserAccounts(): UserAccount[] {
  const parsedEntries = resolveUsersConfigFromEnv()
  const accounts: UserAccount[] = []
  const seen = new Set<string>()
  for (const rawEntry of parsedEntries) {
    const account = normalizeConfigEntry(rawEntry)
    const normalized = normalizeUsername(account.username)
    if (seen.has(normalized)) {
      throw new Error(`[auth] Duplicate username detected: ${account.username}`)
    }
    seen.add(normalized)
    accounts.push(account)
  }

  if (accounts.length === 0) {
    throw new Error('[auth] No valid user accounts configured.')
  }
  return accounts
}

const USER_ACCOUNTS: UserAccount[] = loadUserAccounts()

const activeSessions = new Map<string, SessionEntry>()

/**
 * 使用 bcrypt 產生密碼雜湊（新密碼用）
 * @param password 明文密碼
 * @returns Promise<string> bcrypt 雜湊字串（包含鹽值）
 */
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

/**
 * 驗證密碼是否符合雜湊（登入驗證用）
 * @param password 使用者輸入的密碼
 * @param hash 儲存的 bcrypt 雜湊
 * @returns Promise<boolean> 密碼是否正確
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash)
  } catch (error) {
    console.error('Password verification error:', error)
    return false
  }
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

function findAccount(username: string): UserAccount | undefined {
  const normalized = normalizeUsername(username)
  return USER_ACCOUNTS.find((account) => normalizeUsername(account.username) === normalized)
}

const DEV_AUTO_LOGIN_ACCOUNT: AuthenticatedUser | null = (() => {
  const raw = process.env.SMARTCAT_DEV_AUTO_LOGIN_USER?.trim()
  if (!raw) return null
  if (process.env.NODE_ENV === 'production') {
    logger.warn('[auth] SMARTCAT_DEV_AUTO_LOGIN_USER ignored in production.')
    return null
  }
  const account = findAccount(raw)
  if (!account) {
    logger.warn(`[auth] SMARTCAT_DEV_AUTO_LOGIN_USER "${raw}" not found in SMARTCAT_AUTH_USERS.`)
    return null
  }
  logger.warn(`[auth] 🔓 Development auto-login enabled as "${account.username}".`)
  return {
    username: account.username,
    displayName: account.displayName,
    role: account.role,
  }
})()
let devAutoLoginLogged = false

function pruneExpiredSessions() {
  const now = Date.now()
  for (const [token, session] of activeSessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      activeSessions.delete(token)
    }
  }
}

function createSessionToken(): string {
  return crypto.randomBytes(48).toString('base64url')
}

export async function authenticateUser(username: string, password: string): Promise<AuthenticatedUser | null> {
  const account = findAccount(username)
  if (!account) return null

  // 使用 bcrypt 安全驗證密碼
  const isValid = await verifyPassword(password, account.passwordHash)
  if (!isValid) {
    return null
  }

  return {
    username: account.username,
    displayName: account.displayName,
    role: account.role,
  }
}

export function issueSession(user: AuthenticatedUser): string {
  pruneExpiredSessions()
  const token = createSessionToken()
  activeSessions.set(token, { user, createdAt: Date.now() })
  return token
}

export function invalidateSession(token: string | null | undefined) {
  if (!token) return
  activeSessions.delete(token)
}

function sessionFromToken(token: string | null | undefined): AuthenticatedUser | null {
  if (!token) return null
  pruneExpiredSessions()
  const session = activeSessions.get(token)
  if (!session) {
    return null
  }
  return session.user
}

function extractTokenFromRequest(req: Request): string | null {
  const header = req.headers.authorization
  if (header && typeof header === 'string') {
    const [scheme, value] = header.split(' ')
    if (scheme && scheme.toLowerCase() === 'bearer' && value) {
      return value.trim()
    }
  }

  const fallback = req.headers['x-session-token']
  if (typeof fallback === 'string' && fallback.trim().length > 0) {
    return fallback.trim()
  }

  return null
}

export function attachAuthContext(req: Request): AuthenticatedUser | null {
  const token = extractTokenFromRequest(req)
  let user = sessionFromToken(token)
  if (!user && DEV_AUTO_LOGIN_ACCOUNT) {
    user = DEV_AUTO_LOGIN_ACCOUNT
    if (!devAutoLoginLogged) {
      logger.warn('[auth] Development auto-login session attached (no credentials provided).')
      devAutoLoginLogged = true
    }
  }
  req.authToken = token
  req.authUser = user
  return user
}

export function requireAuthenticated(req: Request, res: Response): req is Request & { authUser: AuthenticatedUser } {
  if (!req.authUser) {
    res.status(401).json({ ok: false, message: 'unauthorized' })
    return false
  }
  return true
}

export function requireDeveloper(req: Request, res: Response): req is Request & { authUser: AuthenticatedUser } {
  if (!requireAuthenticated(req, res)) {
    return false
  }
  if (req.authUser.role !== 'developer') {
    res.status(403).json({ ok: false, message: 'forbidden' })
    return false
  }
  return true
}

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Request {
      authUser?: AuthenticatedUser | null
      authToken?: string | null
    }
  }
}

export function getPublicUser(user: AuthenticatedUser) {
  return {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  }
}
