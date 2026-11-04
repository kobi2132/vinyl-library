// Discogs for the app: /api/discogs/* is forwarded to api.discogs.com with our token, and every
// answer is kept in SQLite so the same release is fetched from Discogs once for all users.
//
// Why: Discogs allows about 60 requests a minute for our one token, shared by everyone using
// the app. Release details almost never change, so they are kept for a month; prices and search
// results for a day. When Discogs is busy or down, an older saved answer is served instead.
//
// The token is read from DATA_DIR/discogs-token (a file on the server, never in git).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const HOUR = 3_600_000
const DAY = 24 * HOUR

// only these Discogs paths are passed through, each with how long its answer is kept
const ROUTES = [
  [/^\/database\/search$/, DAY],
  [/^\/releases\/\d+$/, 30 * DAY],
  [/^\/masters\/\d+\/versions$/, 7 * DAY],
  [/^\/artists\/\d+\/releases$/, 7 * DAY],
  [/^\/marketplace\/price_suggestions\/\d+$/, DAY],
]
// query parameters the app uses; anything else is dropped so the cache key stays clean
const PARAMS = new Set(['type', 'per_page', 'page', 'barcode', 'artist', 'release_title', 'q', 'catno', 'sort', 'sort_order'])

// overridable for local testing against a fake Discogs
const API = process.env.DISCOGS_API || 'https://api.discogs.com'
const FX_URL = process.env.FX_URL || 'https://api.frankfurter.dev/v1/latest?base=ILS&symbols=USD,EUR,GBP'
const USER_AGENT = 'MyVinylLibrary/1.0 +https://my-vinyl-library.jacob-apps.co.il'
const MAX_PER_MINUTE = 50 // stay under Discogs' 60
const MAX_PER_IP = 40 // one person (or a big import) can't take the whole minute

export function discogsProxy(db, dataDir, limited, ipOf) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS discogs_cache (
      key TEXT PRIMARY KEY, ts INTEGER NOT NULL, status INTEGER NOT NULL, body TEXT NOT NULL
    );
  `)
  const getCached = db.prepare('SELECT ts, status, body FROM discogs_cache WHERE key = ?')
  const putCached = db.prepare('INSERT OR REPLACE INTO discogs_cache (key, ts, status, body) VALUES (?, ?, ?, ?)')
  const prune = db.prepare('DELETE FROM discogs_cache WHERE ts < ?')
  const countCached = db.prepare('SELECT COUNT(*) AS n FROM discogs_cache')
  setInterval(() => prune.run(Date.now() - 60 * DAY), DAY).unref()

  const token = () => {
    try {
      return readFileSync(join(dataDir, 'discogs-token'), 'utf8').trim()
    } catch {
      return ''
    }
  }

  let sent = [] // times of requests sent to Discogs in the last minute
  let pausedUntil = 0 // Discogs said we are out of requests
  const stats = { hits: 0, misses: 0, stale: 0, limited: 0 }
  const inflight = new Map() // the same request asked twice at once goes to Discogs once

  function reply(res, status, body, source) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Cache': source,
    })
    res.end(body)
  }

  async function fetchDiscogs(key) {
    const r = await fetch(`${API}${key}`, {
      headers: { Authorization: `Discogs token=${token()}`, 'User-Agent': USER_AGENT, Accept: 'application/json' },
    })
    if (r.headers.get('x-discogs-ratelimit-remaining') === '0') pausedUntil = Date.now() + 60_000
    const body = await r.text()
    return { status: r.status, body }
  }

  async function handle(req, res, url) {
    if (req.method !== 'GET') return reply(res, 405, '{"error":"method"}', 'none')
    const path = url.pathname.replace(/^\/api\/discogs/, '')
    const route = ROUTES.find(([re]) => re.test(path))
    if (!route) return reply(res, 404, '{"error":"not found"}', 'none')
    const params = [...url.searchParams].filter(([k]) => PARAMS.has(k)).sort(([a], [b]) => a.localeCompare(b))
    const key = path + (params.length ? '?' + new URLSearchParams(params) : '')

    const saved = getCached.get(key)
    if (saved && Date.now() - saved.ts < route[1]) {
      stats.hits++
      return reply(res, saved.status, saved.body, 'hit')
    }

    // out of requests for this minute: an older answer is better than none
    const now = Date.now()
    sent = sent.filter((t) => now - t < 60_000)
    if (now < pausedUntil || sent.length >= MAX_PER_MINUTE || limited(`dg:${ipOf(req)}`, MAX_PER_IP, 60_000)) {
      if (saved) {
        stats.stale++
        return reply(res, saved.status, saved.body, 'stale')
      }
      stats.limited++
      return reply(res, 429, '{"error":"busy"}', 'none')
    }
    if (!token()) return reply(res, 502, '{"error":"no token"}', 'none')

    stats.misses++
    sent.push(now)
    let p = inflight.get(key)
    if (!p) {
      p = fetchDiscogs(key).finally(() => inflight.delete(key))
      inflight.set(key, p)
    }
    try {
      const { status, body } = await p
      // keep good answers and "not found"; errors and rate limits are not kept
      if (status === 200 || status === 404) putCached.run(key, Date.now(), status, body)
      if (status >= 500 && saved) return reply(res, saved.status, saved.body, 'stale')
      if (status === 401 || status === 403) return reply(res, 502, '{"error":"discogs auth"}', 'none')
      return reply(res, status, body, 'miss')
    } catch {
      if (saved) return reply(res, saved.status, saved.body, 'stale')
      return reply(res, 502, '{"error":"discogs unreachable"}', 'none')
    }
  }

  // for the developer page
  handle.info = () => ({ ...stats, cached: countCached.get().n, lastMinute: sent.filter((t) => Date.now() - t < 60_000).length })
  return handle
}

// Exchange rates for showing Discogs prices in shekels (European Central Bank rates via Frankfurter),
// fetched by the server at most every 12 hours so users' browsers don't call a third party.
let fx = null
export async function fxRates() {
  if (fx && Date.now() - fx.at < 12 * HOUR) return fx
  try {
    const r = await fetch(FX_URL)
    if (!r.ok) throw new Error(String(r.status))
    const j = await r.json()
    const toILS = { ILS: 1 }
    for (const [cur, perShekel] of Object.entries(j.rates || {})) if (perShekel > 0) toILS[cur] = 1 / perShekel
    fx = { at: Date.now(), toILS }
  } catch (e) {
    console.error('fx:', e.message)
  }
  return fx
}
