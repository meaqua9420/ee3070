import 'dotenv/config'
import express from 'express'
import fetch from 'node-fetch'

const app = express()

const PORT = Number.parseInt(process.env.PORT ?? '5858', 10)
const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY ?? process.env.GOOGLE_API_KEY ?? ''
const GOOGLE_CX = process.env.GOOGLE_SEARCH_CX ?? process.env.GOOGLE_CX ?? ''

if (!GOOGLE_API_KEY) {
  console.warn('[proxy] GOOGLE_SEARCH_API_KEY is not set. Requests will fail until it is configured.')
}
if (!GOOGLE_CX) {
  console.warn('[proxy] GOOGLE_SEARCH_CX is not set. Requests will fail until it is configured.')
}

function buildQueryParams(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}

app.get('/search', async (req, res) => {
  const rawQuery = (req.query.q ?? req.query.query ?? '').toString().trim()
  const lang = (req.query.lang ?? '').toString().trim().slice(0, 8)
  const limitParam = Number.parseInt((req.query.limit ?? '3').toString(), 10)
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 5)) : 3

  if (!rawQuery) {
    res.status(400).json({ ok: false, message: 'Missing query parameter ?q=' })
    return
  }

  if (!GOOGLE_API_KEY || !GOOGLE_CX) {
    res.status(500).json({ ok: false, message: 'Google Custom Search credentials not configured.' })
    return
  }

  const queryParams = buildQueryParams({
    key: GOOGLE_API_KEY,
    cx: GOOGLE_CX,
    q: rawQuery,
    num: limit,
    lr: lang ? `lang_${lang}` : undefined,
    safe: 'active',
  })

  const url = `https://www.googleapis.com/customsearch/v1?${queryParams}`
  console.log(`[proxy] ${new Date().toISOString()} q="${rawQuery}" lang="${lang || 'default'}" limit=${limit}`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      res.status(response.status).json({
        ok: false,
        message: `Google API responded with HTTP ${response.status}`,
        detail,
      })
      return
    }

    const payload = await response.json()
    const items = Array.isArray(payload?.items) ? payload.items : []
    const results = items.map((item) => ({
      title: item.title ?? '',
      url: item.link ?? '',
      snippet: item.snippet ?? item.htmlSnippet ?? '',
    }))

    res.json({
      ok: true,
      query: rawQuery,
      results,
      totalResults: Number(payload?.searchInformation?.totalResults ?? 0),
      searchTimeMs: Number(payload?.searchInformation?.searchTime ?? 0) * 1000,
    })
  } catch (error) {
    console.error('[proxy] search failed', error)
    res.status(502).json({
      ok: false,
      message:
        error instanceof Error && error.name === 'AbortError'
          ? 'Search request timed out before Google responded.'
          : 'Failed to contact Google Custom Search API.',
      detail: error instanceof Error ? error.message : String(error),
    })
  } finally {
    clearTimeout(timeoutId)
  }
})

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Smart Cat search proxy online.',
    timestamp: new Date().toISOString(),
  })
})

app.listen(PORT, () => {
  console.log(`[proxy] listening on http://127.0.0.1:${PORT}`)
})
