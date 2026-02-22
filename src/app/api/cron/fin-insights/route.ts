import { NextResponse } from 'next/server'
import { supabase, verifyCronSecret, unauthorizedResponse } from '../_lib/supabase'

const POLYVISION_API_KEY = process.env.POLYVISION_API_KEY || ''
const FIN_AGENT_NAME = 'Fin-Agent'
const FIN_TOP_WALLETS = 5
const FIN_HOT_BETS = 5

async function fetchPolyVision(pathname: string, params = '') {
  const url = `https://api.polyvisionx.com${pathname}${params}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${POLYVISION_API_KEY}` },
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`PolyVision error ${res.status}: ${txt}`)
  }
  return res.json()
}

interface WalletEntry {
  wallet_address: string
  username?: string
  win_rate: number
  copy_score?: number
  total_pnl: number
  tier?: string
  categories?: Record<string, number>
  red_flags?: string[]
  last_trade_date?: string
}

interface HotBet {
  market_title: string
  outcome: string
  unrealized_pnl?: number
  pnl?: number
  username?: string
  wallet?: string
  current_price: number
}

function shortlistWallets(entries: WalletEntry[], max = 5) {
  return entries
    .filter((e) => e.win_rate >= 50 || (e.copy_score ?? 0) >= 8)
    .slice(0, max)
    .map((e) => {
      const cats = Object.entries(e.categories || {})
        .filter(([, pct]) => pct && pct > 0.5)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([name, pct]) => `${name.replace('_pct', '')} ${pct.toFixed(1)}%`)
      const focus = cats.length ? `Focus: ${cats.join(', ')}` : 'Focus: mixed'
      const score = typeof e.copy_score === 'number' ? e.copy_score.toFixed(1) : '?'
      return `- ${e.username || e.wallet_address.slice(0, 8)} (${e.win_rate.toFixed(1)}% win, score ${score}) -- ${focus}`
    })
}

function summarizeHotBets(bets: HotBet[], max = 5) {
  return bets.slice(0, max).map((b) => {
    const pnl = b.unrealized_pnl ?? b.pnl ?? 0
    const trader = b.username || (b.wallet ? `${b.wallet.slice(0, 8)}...` : 'anon')
    return `- ${b.market_title} (${b.outcome}) -- ${trader} | EV ${pnl.toFixed(2)} @ ${b.current_price}`
  })
}

// Fin Insights: fetches PolyVision leaderboard + hot bets and posts a summary event
// Schedule: every 6 hours
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) return unauthorizedResponse()

  if (!POLYVISION_API_KEY) {
    return NextResponse.json({ ok: false, error: 'POLYVISION_API_KEY not set' }, { status: 500 })
  }

  // Ensure Fin agent exists
  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('name', FIN_AGENT_NAME)
    .maybeSingle()

  let agentId = existing?.id
  if (!agentId) {
    const { data: inserted } = await supabase
      .from('agents')
      .insert({ name: FIN_AGENT_NAME, agent_type: 'research', status: 'active' })
      .select('id')
      .single()
    agentId = inserted?.id
  }

  try {
    const nowLabel = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
    const leaderboard = await fetchPolyVision('/v1/leaderboard', '?sort_by=rank')
    const hotBets = await fetchPolyVision('/v1/hot-bets', `?limit=${FIN_HOT_BETS}`)

    const walletEntries = leaderboard.entries || []
    const walletSummary = shortlistWallets(walletEntries, FIN_TOP_WALLETS)
    const hotBetEntries = hotBets?.bets || []
    const betsSummary = summarizeHotBets(hotBetEntries, FIN_HOT_BETS)

    const message = [
      `Fin Insight (${nowLabel})`,
      '',
      'Top wallets:',
      ...(walletSummary.length ? walletSummary : ['- No elite wallets met the win-rate filter today.']),
      '',
      'Hot bets:',
      ...(betsSummary.length ? betsSummary : ['- No hot bets published.']),
    ].join('\n')

    await supabase.from('events').insert({
      agent_id: agentId || null,
      event_type: 'fin_insight',
      severity: 'info',
      message,
    })

    // --- Structured recs for execution agents ---

    // 1. Wallet recommendations (24h TTL)
    const topWallets = walletEntries
      .filter((e: WalletEntry) => e.win_rate >= 50 || (e.copy_score ?? 0) >= 8)
      .slice(0, 10)
    if (topWallets.length > 0) {
      const walletRecs = topWallets.map((e: WalletEntry) => ({
        recommendation_type: 'wallet',
        payload: {
          address: (e.wallet_address || '').toLowerCase(),
          username: e.username || null,
          win_rate: e.win_rate,
          copy_score: e.copy_score ?? null,
          categories: e.categories || {},
        },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }))
      await supabase.from('fin_recommendations').insert(walletRecs)
    }

    // 2. Hot bet recommendations (12h TTL)
    const topBets = hotBetEntries.slice(0, 10)
    if (topBets.length > 0) {
      const hotBetRecs = topBets.map((b: HotBet) => ({
        recommendation_type: 'hot_bet',
        payload: {
          market_title: b.market_title,
          outcome: b.outcome,
          current_price: b.current_price,
          ev: b.unrealized_pnl ?? b.pnl ?? 0,
          wallet: b.wallet || null,
          username: b.username || null,
        },
        expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      }))
      await supabase.from('fin_recommendations').insert(hotBetRecs)
    }

    // 3. Tuning recommendations (12h TTL)
    const avgWinRate = walletEntries.length
      ? walletEntries.reduce((sum: number, e: WalletEntry) => sum + e.win_rate, 0) / walletEntries.length
      : 65
    const highConfidence = avgWinRate > 72
    const lowConfidence = avgWinRate < 58

    const tuningPayload: Record<string, number> = {}
    if (highConfidence) {
      tuningPayload.certainty_delta = -0.02
      tuningPayload.size_multiplier_delta = 0.1
    } else if (lowConfidence) {
      tuningPayload.certainty_delta = 0.02
      tuningPayload.size_multiplier_delta = -0.1
    }
    if (Object.keys(tuningPayload).length > 0) {
      tuningPayload.avg_win_rate = avgWinRate
      await supabase.from('fin_recommendations').insert({
        recommendation_type: 'tuning',
        payload: tuningPayload,
        expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      })
    }

    // Cleanup expired recs
    await supabase
      .from('fin_recommendations')
      .delete()
      .lt('expires_at', new Date().toISOString())

    const recsWritten = topWallets.length + topBets.length + (Object.keys(tuningPayload).length > 0 ? 1 : 0)
    console.log(`[fin-insights] Posted insight + ${recsWritten} structured recs (${topWallets.length} wallets, ${topBets.length} bets, ${Object.keys(tuningPayload).length > 0 ? '1 tuning' : '0 tuning'})`)

    return NextResponse.json({ ok: true, message: 'Fin insight posted', recs: recsWritten })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
