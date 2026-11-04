/*
 * Discogs gives prices in dollars (or the currency of the token's account). To show shekels we
 * need the day's rate, which our server gets (European Central Bank rates) and the device keeps
 * for a day. If it can't be had, prices stay in the original currency.
 */
const KEY = 'vl.fx'
const DAY = 24 * 60 * 60 * 1000

type Rates = { at: number; toILS: Record<string, number> }

function load(): Rates | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}

let pending: Promise<Rates | null> | null = null

async function rates(): Promise<Rates | null> {
  const saved = load()
  if (saved && Date.now() - saved.at < DAY) return saved
  pending ??= (async () => {
    try {
      const res = await fetch('/api/app/fx')
      const j = res.ok && (res.headers.get('content-type') ?? '').includes('json') ? ((await res.json()) as Rates | null) : null
      if (!j?.toILS) throw new Error()
      const r = { at: Date.now(), toILS: j.toILS }
      try {
        localStorage.setItem(KEY, JSON.stringify(r))
      } catch {
        /* ignore */
      }
      return r
    } catch {
      return saved // an old rate is better than none
    } finally {
      pending = null
    }
  })()
  return pending
}

const SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', ILS: '₪' }

/** "₪85" when the rate is known, otherwise "$23". Rounded: these are estimates. */
export async function formatPrice(value: number, currency: string): Promise<string> {
  const r = await rates()
  const rate = r?.toILS[currency]
  if (rate) return `₪${Math.round((value * rate) / 5) * 5 || Math.round(value * rate)}`
  return `${SYMBOL[currency] ?? currency + ' '}${Math.round(value)}`
}
