import { NextResponse } from 'next/server'
import { supabase, verifyCronSecret, unauthorizedResponse } from '../_lib/supabase'

interface Trade {
  pnl: number
  executed_at: string
}

function computeDrawdown(trades: Trade[], base = 100) {
  let equity = base
  let peak = base
  for (const t of trades) {
    equity += Number(t.pnl) || 0
    if (equity > peak) peak = equity
  }
  const dd = peak > 0 ? (peak - equity) / peak : 0
  return { equity, peak, dd }
}

// Audi Auditor: checks drawdown per strategy and tunes parameters if needed
// Schedule: every 4 hours
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) return unauthorizedResponse()

  const { data: strategies } = await supabase.from('strategies').select('*')
  const { data: settings } = await supabase.from('strategy_settings').select('*')

  const settingsMap: Record<string, Record<string, number | string | null>> = {}
  ;(settings || []).forEach((s) => (settingsMap[s.strategy_id] = s))

  const results: string[] = []

  for (const s of strategies || []) {
    const { data: trades } = await supabase
      .from('trades')
      .select('pnl,executed_at')
      .eq('strategy_id', s.id)
      .order('executed_at', { ascending: true })

    if (!trades?.length) continue

    const base = Number(s.paper_capital ?? 100)
    const { dd } = computeDrawdown(trades as Trade[], base)

    if (dd < 0.15) continue // only act beyond 15% drawdown

    const current = settingsMap[s.id] || {}
    const updates: Record<string, number | string | null> = { strategy_id: s.id }

    if (s.name.toLowerCase().includes('contrarian')) {
      updates.divergence_threshold = Math.min(50, (Number(current.divergence_threshold) || 20) + 2)
      updates.order_size_multiplier = Math.max(0.5, (Number(current.order_size_multiplier) || 1.0) * 0.9)
    } else {
      updates.certainty_threshold = Math.min(0.99, (Number(current.certainty_threshold) || 0.95) + 0.01)
      updates.liquidity_floor = Math.min(0.9, (Number(current.liquidity_floor) || 0.5) + 0.05)
      updates.order_size_multiplier = Math.max(0.5, (Number(current.order_size_multiplier) || 1.0) * 0.9)
    }

    updates.last_tuned_at = new Date().toISOString()

    await supabase.from('strategy_settings').upsert(updates)
    await supabase.from('events').insert({
      agent_id: null,
      event_type: 'auditor',
      severity: 'info',
      message: `Audi tuning applied for ${s.name} (drawdown ${(dd * 100).toFixed(1)}%)`,
    })

    results.push(`${s.name}: tuned (dd ${(dd * 100).toFixed(1)}%)`)
  }

  return NextResponse.json({ ok: true, tuned: results.length, results })
}
