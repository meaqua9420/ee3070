#!/usr/bin/env node
/**
 * Safe Search Proxy
 * -----------------
 * Thin HTTP proxy that forwards whitelisted search queries to an upstream API.
 * Purposefully limits output fields to mitigate prompt injection and sensitive-data leakage.
 */

import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'

const PORT = Number(process.env.SMARTCAT_SEARCH_PORT ?? '5858')
const HOST = process.env.SMARTCAT_SEARCH_HOST ?? '127.0.0.1'
const UPSTREAM_BASE = process.env.SMARTCAT_SEARCH_UPSTREAM ?? ''
const API_KEY = process.env.SMARTCAT_SEARCH_API_KEY ?? ''

const ALLOWED_PARAMS = new Set(['q', 'lang', 'limit'])
const MAX_QUERY_LENGTH = 160
const MAX_LIMIT = 5

if (!UPSTREAM_BASE) {
  console.error('[search-proxy] Missing SMARTCAT_SEARCH_UPSTREAM; exiting')
  process.exit(1)
}

function sanitizeQueryParams(url) {
  const upstreamUrl = new URL(UPSTREAM_BASE)
  for (const [key, value] of url.searchParams.entries()) {
    if (!ALLOWED_PARAMS.has(key)) {
      console.warn('[search-proxy] Rejecting param', key)
      url.searchParams.delete(key)
      continue
    }
    if (key === 'q' && value.length > MAX_QUERY_LENGTH) {
      url.searchParams.set('q', value.slice(0, MAX_QUERY_LENGTH))
    }
    if (key === 'limit') {
      const parsed = Number.parseInt(value, 10)
      const safeValue = Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, MAX_LIMIT)) : 3
      url.searchParams.set('limit', String(safeValue))
    }
  }
  url.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.set(key, value)
  })
  return upstreamUrl
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, message: 'method-not-allowed' }))
    return
  }

  try {
    const originalUrl = new URL(req.url ?? '', `http://${req.headers.host}`)
    const upstreamUrl = sanitizeQueryParams(originalUrl)

    const requestOptions = {
      method: 'GET',
      headers: {
        'User-Agent': 'SmartCatSearchProxy/1.0',
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
      },
    }

    const client = upstreamUrl.protocol === 'https:' ? https : http
    const upstreamReq = client.request(upstreamUrl, requestOptions, (upstreamRes) => {
      const chunks = []
      upstreamRes.on('data', (chunk) => chunks.push(chunk))
      upstreamRes.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        try {
          const parsed = JSON.parse(body)
          const safeResponse = {
            ok: true,
            results: Array.isArray(parsed?.results)
              ? parsed.results.slice(0, MAX_LIMIT).map((item) => ({
                  title: String(item.title ?? '').slice(0, 200),
                  url: String(item.url ?? '').slice(0, 400),
                  snippet: String(item.snippet ?? '').slice(0, 500),
                }))
              : [],
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(safeResponse))
        } catch (error) {
          console.warn('[search-proxy] Failed to parse upstream response', error)
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, message: 'upstream-invalid-json' }))
        }
      })
    })

    upstreamReq.on('error', (error) => {
      console.error('[search-proxy] Upstream request failed', error)
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'upstream-failed' }))
    })

    upstreamReq.end()
  } catch (error) {
    console.error('[search-proxy] Invalid request', error)
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, message: 'invalid-request' }))
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[search-proxy] Listening on http://${HOST}:${PORT}`)
})
