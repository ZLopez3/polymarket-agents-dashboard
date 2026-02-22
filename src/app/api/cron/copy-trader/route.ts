import { NextResponse } from 'next/server'
import { supabase, verifyCronSecret, unauthorizedResponse, fetchJson } from '../_lib/supabase'

const BASE = 'https://gzydspfquuaudqeztorw.supabase.co/functions/v1/agent-api'
const MAX_RESOLUTION_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

const WATCH_WALLETS = new Set(
  [
    '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee',
    '0x63ce342161250d705dc0b16df89036c8e5f9ba9a',
    '0xdfe3fedc5c7679be42c3d393e99d4b55247b73c4',
    '0xd1ecfa3e7d221851663f739626dcd15fca565d8e',
    '0x5739ddf8672627ce076eff5f444610a250075f1a',
    '0x7f3c8979d0afa00007bae4747d5347122af05613',
    '0x4dfd481c16d9995b809780fd8a9808e8689f6e4a',
    '0xe52c0a1327a12edc7bd54ea6f37ce00a4ca96924',
    '0x0b219cf3d297991b58361dbebdbaa91e56b8deb6',
    '0x85d575c99b977e9e39543747c859c83b727aaece',
    '0xf5fe759cece500f58a431ef8dacea321f6e3e23d',
    '0x9c667a1d1c1337c6dca9d93241d386e4ed346b66',
  ].map((w) => w.toLowerCase())
)

function sizeFromTier(tier: string) {
  if (tier === 'mega') return 30
  if (tier === 'large') return 20
  if (tier === 'medium') return 15
  return 10
}

// Copy Trader: scans whale wallets for crypto trades and mirrors them
// Schedule: every 2 minutes
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) return unauthorizedResponse()

  // Find copy trader strategy
  const { data: strategies } = await supabase
    .from('strategies')
    .select('id,name')
    .ilike('name', '%Copy Trader%')
    .limit(1)
  const strategyId = strategies?.[0]?.id
  if (!strategyId) {
    return NextResponse.json({ ok: false, error: 'Copy Trader strategy not found' }, { status: 404 })
  }

  // Get recent trade hashes to deduplicate
  const { data: recentTrades } = await supabase
    .from('trades')
    .select('market,side')
    .eq('strategy_id', strategyId)
    .order('executed_at', { ascending: false })
    .limit(100)
  const recentSet = new Set((recentTrades || []).map((t) => `${t.market}-${t.side}`))

  const results: string[] = []

  try {
    const feed = await fetchJson(`${BASE}?action=whales&limit=50`)
    const rows = feed.data || []

    for (const w of rows) {
      const wallet = (w.wallet || '').toLowerCase()
      if (!WATCH_WALLETS.has(wallet)) continue
      if (w.market_category && w.market_category.toLowerCase() !== 'crypto') continue

      if (!w.closes_at) continue
      const closesAt = new Date(w.closes_at)
      if (Number.isNaN(closesAt.getTime())) continue
      if (closesAt.getTime() - Date.now() > MAX_RESOLUTION_WINDOW_MS) continue

      const side = (w.outcome || '').toLowerCase().includes('no') ? 'NO' : 'YES'
      const dedupeKey = `${w.market_title}-${side}`
      if (recentSet.has(dedupeKey)) continue
      recentSet.add(dedupeKey)

      const notional = sizeFromTier(w.tier)

      await supabase.from('trades').insert({
        strategy_id: strategyId,
        market: w.market_title,
        side,
        notional,
        pnl: 0,
        market_id: w.market_id || null,
        market_slug: w.market_slug || null,
        closes_at: w.closes_at || null,
        is_resolved: w.is_resolved ?? false,
      })

      await supabase.from('events').insert({
        agent_id: null,
        event_type: 'copy_trade_signal',
        severity: 'info',
        message: `Copy-trade: ${wallet.slice(0, 6)}... ${side} ${w.market_title} @ ${w.price} (tier: ${w.tier})`,
      })

      results.push(`${w.market_title} ${side}`)
    }
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, trades: results.length, results })
}
