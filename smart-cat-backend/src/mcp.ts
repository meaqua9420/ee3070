import fs from 'node:fs'
import path from 'node:path'

type McpToolDefinition = {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: unknown
    [key: string]: unknown
  }
}

type McpToolPayload = {
  tool: string
  args: unknown
}

type McpToolResponse =
  | {
      ok?: boolean
      output?: string
      result?: unknown
      message?: string
      data?: unknown
    }
  | string
  | null

const DEFAULT_MCP_ENDPOINT = (() => {
  const port = process.env.PORT || '4000'
  return `http://127.0.0.1:${port}/mcp/invoke`
})()
const MCP_SERVER_URL = (process.env.MCP_SERVER_URL?.trim() || DEFAULT_MCP_ENDPOINT).trim()
const MCP_API_KEY = process.env.MCP_API_KEY?.trim() || ''
const MCP_TIMEOUT_MS = Number.isFinite(Number(process.env.MCP_TIMEOUT_MS))
  ? Math.max(1000, Number(process.env.MCP_TIMEOUT_MS))
  : 15_000
const PROJECT_ROOT = path.resolve(__dirname, '..')
const RAW_MCP_TOOLS_FILE = process.env.MCP_TOOLS_FILE?.trim()
const MCP_TOOLS_JSON = process.env.MCP_TOOLS_JSON?.trim()

const MCP_TOOLS_FILE_CANDIDATES = (() => {
  const candidates = new Set<string>()

  if (RAW_MCP_TOOLS_FILE) {
    if (path.isAbsolute(RAW_MCP_TOOLS_FILE)) {
      candidates.add(RAW_MCP_TOOLS_FILE)
    } else {
      candidates.add(path.resolve(process.cwd(), RAW_MCP_TOOLS_FILE))
      candidates.add(path.resolve(PROJECT_ROOT, RAW_MCP_TOOLS_FILE))
    }
  } else {
    candidates.add(path.join(PROJECT_ROOT, 'mcp-tools.json'))
    candidates.add(path.join(process.cwd(), 'mcp-tools.json'))
  }

  return Array.from(candidates)
})()

let cachedTools: McpToolDefinition[] | null = null

function parseToolDefinitions(raw: string, source: string): McpToolDefinition[] {
  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) {
      console.warn(`[mcp] Tool definition from ${source} is not an array, ignoring.`)
      return []
    }
    return data.filter(
      (entry) => entry && entry.type === 'function' && entry.function && typeof entry.function.name === 'string',
    )
  } catch (error) {
    console.warn(`[mcp] Failed to parse tool definition from ${source}:`, error)
    return []
  }
}

function loadToolsFromFile(): McpToolDefinition[] {
  if (MCP_TOOLS_FILE_CANDIDATES.length === 0) {
    return []
  }

  let lastError: unknown = null
  for (const [index, candidate] of MCP_TOOLS_FILE_CANDIDATES.entries()) {
    try {
      const fileContent = fs.readFileSync(candidate, 'utf-8')
      if (index > 0) {
        console.warn(`[mcp] Loaded MCP tools from fallback path: ${candidate}`)
      }
      return parseToolDefinitions(fileContent, candidate)
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) {
    console.warn(
      `[mcp] Failed to read MCP tools file. Tried: ${MCP_TOOLS_FILE_CANDIDATES.join(', ')}`,
      lastError,
    )
  }
  return []
}

function loadMcpTools(): McpToolDefinition[] {
  if (MCP_TOOLS_JSON) {
    return parseToolDefinitions(MCP_TOOLS_JSON, 'MCP_TOOLS_JSON')
  }
  return loadToolsFromFile()
}

export function refreshMcpToolDefinitions(): void {
  cachedTools = null
}

export function getMcpToolDefinitions(): McpToolDefinition[] {
  if (cachedTools) {
    return cachedTools
  }
  cachedTools = loadMcpTools()
  if (cachedTools.length > 0) {
    console.log(`[mcp] Loaded ${cachedTools.length} tool definition(s).`)
  }
  return cachedTools
}

export function isMcpTool(toolName: string): boolean {
  if (!toolName) return false
  return getMcpToolDefinitions().some((entry) => entry.function?.name === toolName)
}

export async function executeMcpTool(
  toolName: string,
  args: unknown,
): Promise<{ output: string; data?: McpToolResponse }> {
  if (!MCP_SERVER_URL) {
    throw new Error('MCP_SERVER_URL is not configured.')
  }
  const payload: McpToolPayload = {
    tool: toolName,
    args: typeof args === 'undefined' ? {} : args,
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS)
  try {
    const response = await fetch(MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(MCP_API_KEY ? { Authorization: `Bearer ${MCP_API_KEY}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = await response.text()
    const data: McpToolResponse = text ? safeParseJson(text) : null

    if (!response.ok || (data && typeof data === 'object' && 'ok' in data && data.ok === false)) {
      const message =
        (data && typeof data === 'object' && typeof data.message === 'string'
          ? data.message
          : typeof data === 'string'
            ? data
            : text) || `MCP request failed with HTTP ${response.status}`
      throw new Error(message)
    }

    const output = extractOutputFromResponse(data, text)
    return { output, data }
  } finally {
    clearTimeout(timeout)
  }
}

function safeParseJson(raw: string): McpToolResponse {
  try {
    return JSON.parse(raw)
  } catch (error) {
    console.warn('[mcp] Failed to parse MCP response JSON:', error)
    return raw
  }
}

function extractOutputFromResponse(data: McpToolResponse, fallback: string): string {
  if (!data) {
    return fallback || 'MCP tool executed successfully.'
  }
  if (typeof data === 'string') {
    return data
  }
  if (typeof data.output === 'string' && data.output.trim().length > 0) {
    return data.output.trim()
  }
  if (typeof data.result === 'string' && data.result.trim().length > 0) {
    return data.result.trim()
  }
  if (typeof data.data === 'string' && data.data.trim().length > 0) {
    return data.data.trim()
  }
  return JSON.stringify(data)
}

export function isMcpEnabled(): boolean {
  return Boolean(MCP_SERVER_URL && getMcpToolDefinitions().length > 0)
}
