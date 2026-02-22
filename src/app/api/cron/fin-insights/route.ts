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

    const walletSummary = shortlistWallets(leaderboard.entries || [], FIN_TOP_WALLETS)
    const betsSummary = summarizeHotBets(hotBets?.bets || [], FIN_HOT_BETS)

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

    return NextResponse.json({ ok: true, message: 'Fin insight posted' })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
