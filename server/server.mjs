// Small API for My Vinyl Library: anonymous usage events, contact messages,
// and the developer page. No dependencies: Node 22 built-ins only (http, sqlite, crypto).
// Runs in its own container next to the site; Caddy sends /api/app/* here.

import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { createHmac, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.PORT || 8080)
const DATA = process.env.DATA_DIR || '/data'
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'kobi2132@gmail.com').toLowerCase()
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '393261470985-qg616i58qiv8r4pm49tg3jlam23873b2.apps.googleusercontent.com'
const DAY = 86_400_000

mkdirSync(DATA, { recursive: true })

// Secret for turning an email into an anonymous id. Made once, kept next to the database.
const saltFile = join(DATA, 'salt')
if (!existsSync(saltFile)) writeFileSync(saltFile, randomBytes(32).toString('hex'), { mode: 0o600 })
const SALT = readFileSync(saltFile, 'utf8').trim()
const accountId = (email) => createHmac('sha256', SALT).update(email.toLowerCase()).digest('hex').slice(0, 24)
const ADMIN_ACCOUNT = accountId(ADMIN_EMAIL)

const dbFile = join(DATA, 'app.db')
const db = new DatabaseSync(dbFile)
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY, account TEXT, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
    platform TEXT, installed INTEGER DEFAULT 0, records INTEGER, lib_bytes INTEGER, genres TEXT
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY, device TEXT NOT NULL, ts INTEGER NOT NULL, name TEXT NOT NULL, detail TEXT
  );
  CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
  CREATE INDEX IF NOT EXISTS events_device ON events(device);
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, type TEXT, name TEXT, email TEXT, body TEXT,
    tech TEXT, device TEXT, handled INTEGER NOT NULL DEFAULT 0
  );
`)

const FEATURES = new Set([
  'open', 'scan_barcode', 'scan_catno', 'search_name', 'add_manual', 'add', 'lookup', 'edit',
  'export_excel', 'export_pdf', 'backup', 'restore', 'install', 'contact', 'sync',
])
const TYPES = new Set(['bug', 'idea', 'feedback', 'other'])
const PLATFORMS = new Set(['android', 'iphone', 'desktop', 'other'])

// ---------- helpers ----------

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const int = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : null)
const validId = (v) => typeof v === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(v)
const validEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

function send(res, status, body) {
  const json = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(json)
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(Object.assign(new Error('too large'), { status: 413 }))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        reject(Object.assign(new Error('bad json'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

// Google access token -> verified email. Cached so each token is checked with Google only once.
const tokenCache = new Map()
async function emailFromToken(req) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  if (!token || token.length > 4096) return null
  const hit = tokenCache.get(token)
  if (hit && hit.until > Date.now()) return hit.email
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`)
    if (!r.ok) return null
    const j = await r.json()
    const ok = j.aud === CLIENT_ID && j.email && (j.email_verified === true || j.email_verified === 'true')
    const email = ok ? String(j.email).toLowerCase() : null
    const life = Math.min(Number(j.expires_in) || 300, 3600) * 1000
    if (tokenCache.size > 5000) tokenCache.clear()
    tokenCache.set(token, { email, until: Date.now() + life })
    return email
  } catch {
    return null
  }
}

// very small per-key rate limiter
const hits = new Map()
function limited(key, max, windowMs) {
  const now = Date.now()
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs)
  list.push(now)
  hits.set(key, list)
  if (hits.size > 20000) hits.clear()
  return list.length > max
}
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()

// ---------- public: events ----------

const upsertDevice = db.prepare(`
  INSERT INTO devices (id, account, first_seen, last_seen, platform, installed, records, lib_bytes, genres)
  VALUES (:id, COALESCE(:account, :hint), :now, :now, :platform, :installed, :records, :lib_bytes, :genres)
  ON CONFLICT(id) DO UPDATE SET
    account = COALESCE(:account, account, :hint), last_seen = MAX(last_seen, :now),
    platform = COALESCE(:platform, platform), installed = MAX(installed, :installed),
    records = COALESCE(:records, records), lib_bytes = COALESCE(:lib_bytes, lib_bytes), genres = COALESCE(:genres, genres)
`)
const insertEvent = db.prepare('INSERT INTO events (device, ts, name, detail) VALUES (?, ?, ?, ?)')

async function postEvents(req, res) {
  const b = await readBody(req)
  if (!validId(b.device)) return send(res, 400, { error: 'device' })
  if (limited(`ev:${b.device}`, 120, 3600_000)) return send(res, 429, { error: 'slow down' })
  const email = await emailFromToken(req)
  const now = Date.now()
  const s = b.snapshot && typeof b.snapshot === 'object' ? b.snapshot : {}
  let genres = null
  if (s.genres && typeof s.genres === 'object') {
    const top = Object.entries(s.genres)
      .filter(([g, n]) => typeof g === 'string' && Number.isFinite(n))
      .slice(0, 15)
      .map(([g, n]) => [g.slice(0, 40), Math.max(0, Math.floor(n))])
    genres = JSON.stringify(Object.fromEntries(top))
  }
  upsertDevice.run({
    id: b.device,
    // a verified sign-in sets (or corrects) the account; the unverified hint only fills a gap
    account: email ? accountId(email) : null,
    hint: validEmail(b.account) ? accountId(b.account) : null,
    now,
    platform: PLATFORMS.has(s.platform) ? s.platform : null,
    installed: s.installed ? 1 : 0,
    records: int(s.records),
    lib_bytes: int(s.libBytes),
    genres,
  })
  const events = Array.isArray(b.events) ? b.events.slice(0, 100) : []
  db.exec('BEGIN')
  try {
    for (const e of events) {
      if (!e || !FEATURES.has(e.name)) continue
      // events queued offline keep their own time, but never in the future or older than 30 days
      const ts = Number.isFinite(e.ts) ? Math.min(now, Math.max(now - 30 * DAY, e.ts)) : now
      insertEvent.run(b.device, ts, e.name, str(e.detail, 40) || null)
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  send(res, 204)
}

// ---------- public: contact ----------

const insertMessage = db.prepare(
  'INSERT INTO messages (ts, type, name, email, body, tech, device) VALUES (?, ?, ?, ?, ?, ?, ?)',
)

async function postContact(req, res) {
  const b = await readBody(req, 32 * 1024)
  const device = validId(b.device) ? b.device : null
  if (limited(`ct:${device || ipOf(req)}`, 5, DAY) || limited(`ctip:${ipOf(req)}`, 20, DAY))
    return send(res, 429, { error: 'too many' })
  const m = {
    type: TYPES.has(b.type) ? b.type : null,
    name: str(b.name, 100),
    email: str(b.email, 200),
    body: str(b.body, 3000),
    tech: str(b.tech, 200),
  }
  if (!m.type && !m.name && !m.email && !m.body) return send(res, 400, { error: 'empty' })
  insertMessage.run(Date.now(), m.type, m.name || null, m.email || null, m.body || null, m.tech || null, device)
  send(res, 201, { ok: true })
}

// ---------- admin ----------

// a person is their Google account when known, otherwise the device
const PERSON = `COALESCE(d.account, 'd:' || d.id)`

function stats(since, excludeMe) {
  const now = Date.now()
  // the owner can leave themselves out of the numbers (a checkbox on the developer page)
  const notMe = excludeMe ? `(d.account IS NULL OR d.account != '${ADMIN_ACCOUNT}')` : '1'
  const people = db
    .prepare(
      `SELECT ${PERSON} AS p, MIN(d.first_seen) AS first, MAX(d.account IS NOT NULL) AS google
       FROM devices d WHERE ${notMe} GROUP BY p`,
    )
    .all()
  const total = people.length
  const firstOf = new Map(people.map((x) => [x.p, x.first]))

  const active = db
    .prepare(
      `SELECT DISTINCT ${PERSON} AS p, MAX(d.account IS NOT NULL) AS google FROM events e JOIN devices d ON d.id = e.device
       WHERE e.ts >= ? AND ${notMe} GROUP BY p`,
    )
    .all(since)
  const newUsers = people.filter((x) => x.first >= since).length

  // retention: of people who started at least N days ago, how many opened the app again N+ days after starting
  const opens = db
    .prepare(`SELECT ${PERSON} AS p, MAX(e.ts) AS last FROM events e JOIN devices d ON d.id = e.device WHERE e.name = 'open' AND ${notMe} GROUP BY p`)
    .all()
  const retention = (days) => {
    const eligible = people.filter((x) => x.first <= now - days * DAY)
    if (!eligible.length) return null
    const lastOf = new Map(opens.map((x) => [x.p, x.last]))
    const back = eligible.filter((x) => (lastOf.get(x.p) || 0) >= x.first + days * DAY).length
    return { back, of: eligible.length }
  }

  const features = db
    .prepare(
      `SELECT e.name AS name, COUNT(DISTINCT ${PERSON}) AS users, COUNT(*) AS uses FROM events e JOIN devices d ON d.id = e.device
       WHERE e.ts >= ? AND e.name NOT IN ('open', 'lookup', 'add') AND ${notMe} GROUP BY e.name ORDER BY users DESC`,
    )
    .all(since)
  const lookups = db
    .prepare(`SELECT e.detail AS result, COUNT(*) AS n FROM events e JOIN devices d ON d.id = e.device WHERE e.name = 'lookup' AND e.ts >= ? AND ${notMe} GROUP BY e.detail`)
    .all(since)
  const adds = db
    .prepare(`SELECT e.detail AS method, COUNT(*) AS n FROM events e JOIN devices d ON d.id = e.device WHERE e.name = 'add' AND e.ts >= ? AND ${notMe} GROUP BY e.detail`)
    .all(since)

  // collection size per person: the largest library any of their devices reported
  const libs = db
    .prepare(`SELECT ${PERSON} AS p, MAX(d.records) AS records FROM devices d WHERE d.records IS NOT NULL AND ${notMe} GROUP BY p`)
    .all()
    .map((x) => x.records)
    .sort((a, b) => a - b)
  const sum = libs.reduce((a, b) => a + b, 0)

  const genreTotals = {}
  for (const row of db.prepare(`SELECT d.genres FROM devices d WHERE d.genres IS NOT NULL AND ${notMe}`).all()) {
    try {
      for (const [g, n] of Object.entries(JSON.parse(row.genres))) genreTotals[g] = (genreTotals[g] || 0) + n
    } catch {
      /* skip */
    }
  }
  const activeIds = new Set(active.map((x) => x.p))
  const platforms = db
    .prepare(
      `SELECT ${PERSON} AS p, d.platform AS platform, MAX(d.installed) AS installed FROM devices d
       WHERE d.last_seen >= ? AND ${notMe} GROUP BY d.id`,
    )
    .all(since)
    .filter((x) => activeIds.has(x.p))
  const byPlatform = {}
  for (const x of platforms) byPlatform[x.platform || 'other'] = (byPlatform[x.platform || 'other'] || 0) + 1

  return {
    users: { active: active.length, google: active.filter((x) => x.google).length, new: newUsers, total },
    retention: { week: retention(7), month: retention(30) },
    features,
    lookups: Object.fromEntries(lookups.map((x) => [x.result || 'none', x.n])),
    adds: Object.fromEntries(adds.map((x) => [x.method || 'other', x.n])),
    content: {
      avg: libs.length ? Math.round(sum / libs.length) : 0,
      median: libs.length ? Math.round((libs[Math.floor((libs.length - 1) / 2)] + libs[Math.ceil((libs.length - 1) / 2)]) / 2) : 0,
      total: sum,
      added: adds.reduce((a, x) => a + x.n, 0),
    },
    genres: Object.entries(genreTotals).sort((a, b) => b[1] - a[1]).slice(0, 8),
    platforms: byPlatform,
    installed: platforms.filter((x) => x.installed).length,
    firstEvent: firstOf.size ? Math.min(...firstOf.values()) : null,
  }
}

function users(since) {
  const rows = db
    .prepare(
      `SELECT ${PERSON} AS p, MAX(d.account IS NOT NULL) AS google, MIN(d.first_seen) AS first, MAX(d.last_seen) AS last,
              MAX(d.records) AS records
       FROM devices d GROUP BY p HAVING MAX(d.last_seen) >= ? ORDER BY last DESC LIMIT 500`,
    )
    .all(since)
  // the platform of the device each person used most recently
  const platformOf = new Map()
  for (const x of db.prepare(`SELECT ${PERSON} AS p, d.platform AS platform FROM devices d ORDER BY d.last_seen ASC`).all())
    platformOf.set(x.p, x.platform)
  const visits = new Map(
    db
      .prepare(`SELECT ${PERSON} AS p, COUNT(*) AS n FROM events e JOIN devices d ON d.id = e.device WHERE e.name = 'open' GROUP BY p`)
      .all()
      .map((x) => [x.p, x.n]),
  )
  const feats = new Map()
  for (const x of db
    .prepare(
      `SELECT DISTINCT ${PERSON} AS p, e.name AS name FROM events e JOIN devices d ON d.id = e.device
       WHERE e.ts >= ? AND e.name NOT IN ('open', 'lookup', 'add')`,
    )
    .all(since)) {
    if (!feats.has(x.p)) feats.set(x.p, [])
    feats.get(x.p).push(x.name)
  }
  // a short label that is the same every time but says nothing about the person
  const label = (p) => '#' + createHmac('sha256', SALT).update('label:' + p).digest('hex').slice(0, 4).toUpperCase()
  return rows.map((r) => ({
    id: label(r.p),
    me: r.p === ADMIN_ACCOUNT,
    google: Boolean(r.google),
    platform: platformOf.get(r.p) || 'other',
    first: r.first,
    last: r.last,
    visits: visits.get(r.p) || 0,
    records: r.records ?? null,
    features: feats.get(r.p) || [],
  }))
}

function info() {
  const size = (f) => {
    try {
      return statSync(f).size
    } catch {
      return 0
    }
  }
  const one = (sql) => db.prepare(sql).get()
  return {
    dbBytes: size(dbFile) + size(dbFile + '-wal'),
    events: one('SELECT COUNT(*) AS n FROM events').n,
    devices: one('SELECT COUNT(*) AS n FROM devices').n,
    messages: one('SELECT COUNT(*) AS n FROM messages').n,
    avgLibBytes: Math.round(one('SELECT AVG(lib_bytes) AS n FROM devices WHERE lib_bytes IS NOT NULL').n || 0),
    serverStarted: STARTED,
  }
}

const listMessages = db.prepare('SELECT * FROM messages ORDER BY ts DESC LIMIT 500')
const openCount = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE handled = 0')
const setHandled = db.prepare('UPDATE messages SET handled = ? WHERE id = ?')
const deleteMessage = db.prepare('DELETE FROM messages WHERE id = ?')
const linkOwner = db.prepare('UPDATE devices SET account = ? WHERE id = ?')

async function admin(req, res, path) {
  const email = await emailFromToken(req)
  if (email !== ADMIN_EMAIL) return send(res, 403, { error: 'forbidden' })
  // the owner's device is now known for sure, even if it never sent a signed-in batch
  const dev = req.headers['x-device']
  if (validId(dev)) linkOwner.run(ADMIN_ACCOUNT, dev)
  const url = new URL(req.url, 'http://x')
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0)
  if (req.method === 'GET' && path === 'summary') return send(res, 200, { open: openCount.get().n })
  if (req.method === 'GET' && path === 'stats') return send(res, 200, stats(since, url.searchParams.get('excludeMe') === '1'))
  if (req.method === 'GET' && path === 'users') return send(res, 200, users(since))
  if (req.method === 'GET' && path === 'info') return send(res, 200, info())
  if (req.method === 'GET' && path === 'messages')
    return send(res, 200, listMessages.all().map((m) => ({ ...m, handled: Boolean(m.handled) })))
  const m = path.match(/^messages\/(\d+)$/)
  if (m && req.method === 'PATCH') {
    const b = await readBody(req, 1024)
    setHandled.run(b.handled ? 1 : 0, Number(m[1]))
    return send(res, 204)
  }
  if (m && req.method === 'DELETE') {
    deleteMessage.run(Number(m[1]))
    return send(res, 204)
  }
  send(res, 404, { error: 'not found' })
}

// ---------- server ----------

const STARTED = Date.now()

createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://x').pathname.replace(/^\/api\/app\/?/, '').replace(/\/$/, '')
    if (req.method === 'GET' && path === 'health') return send(res, 200, { ok: true })
    if (req.method === 'POST' && path === 'events') return await postEvents(req, res)
    if (req.method === 'POST' && path === 'contact') return await postContact(req, res)
    if (path.startsWith('admin/')) return await admin(req, res, path.slice(6))
    send(res, 404, { error: 'not found' })
  } catch (e) {
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'server error' })
    if (!e.status) console.error(e)
  }
}).listen(PORT, () => console.log(`vinyl-api listening on ${PORT}`))
