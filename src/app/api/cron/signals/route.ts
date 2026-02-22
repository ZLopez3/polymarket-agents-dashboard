import { NextResponse } from 'next/server'
import { supabase, verifyCronSecret, unauthorizedResponse, fetchJson } from '../_lib/supabase'

const POLY_AGENT_API_BASE = 'https://gzydspfquuaudqeztorw.supabase.co/functions/v1/agent-api'
const ORDER_AMOUNT_USD = Number(process.env.ORDER_AMOUNT_USD || 20)

// Core signal logic for BondLadder + AI Contrarian (from live_signals.js)
// Schedule: every 15 minutes

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) return unauthorizedResponse()

  const { data: strategies } = await supabase.from('strategies').select('id,name')
  const { data: agents } = await supabase.from('agents').select('id,name,strategy_id')
  const { data: settings } = await supabase.from('strategy_settings').select('*')

  const strategyMap: Record<string, string> = {}
  ;(strategies || []).forEach((s) => (strategyMap[s.name] = s.id))

  const agentMap: Record<string, string> = {}
  ;(agents || []).forEach((a) => { if (a.strategy_id) agentMap[a.strategy_id] = a.id })

  const settingsMap: Record<string, Record<string, number>> = {}
  ;(settings || []).forEach((s) => (settingsMap[s.strategy_id] = s))

  const results: string[] = []

  // --- Bond Ladder Signal ---
  const bondId = strategyMap['Polymarket Bond Ladder']
  if (bondId) {
    try {
      const markets = await fetchJson(`${POLY_AGENT_API_BASE}?action=markets&limit=25&sort=volume_usd&agent_id=BondLadder-Agent`)
      const s = settingsMap[bondId] || {}
      const certainty = s.certainty_threshold ?? 0.95
      const liquidityFloor = (s.liquidity_floor ?? 0.5) * 1_000_000
      const candidates = (markets.data || []).filter(
        (m: Record<string, unknown>) =>
          ((m.yes_price as number) >= certainty || (m.no_price as number) >= certainty) &&
          !m.is_resolved &&
          ((m.liquidity_usd as number) ?? 0) >= liquidityFloor
      )
      if (candidates.length) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)]
        const side = pick.yes_price >= pick.no_price ? 'YES' : 'NO'
        const price = side === 'YES' ? pick.yes_price : pick.no_price
        const baseSize = ORDER_AMOUNT_USD * (s.order_size_multiplier ?? 1.0)
        const jitter = 0.6 + Math.random() * 0.8
        const size = Number((baseSize * jitter).toFixed(2))
        const pnl = Number((size * (1.0 - price)).toFixed(2))

        await supabase.from('trades').insert({
          strategy_id: bondId,
          agent_id: agentMap[bondId] || null,
          market: pick.title,
          side,
          notional: size,
          pnl,
          market_id: pick.market_id || null,
          market_slug: pick.slug || null,
          closes_at: pick.closes_at || null,
          is_resolved: pick.is_resolved ?? false,
        })

        await supabase.from('events').insert({
          agent_id: agentMap[bondId] || null,
          event_type: 'bond_ladder_signal',
          severity: 'info',
          message: `Signal: ${pick.title} @ ${price} (${side})`,
        })
        results.push(`BondLadder: ${pick.title} ${side}`)
      } else {
        results.push('BondLadder: no candidates')
      }
    } catch (err) {
      results.push(`BondLadder: error - ${(err as Error).message}`)
    }
  }

  // --- AI Contrarian Signal ---
  const aiId = strategyMap['AI Contrarian']
  if (aiId) {
    try {
      const res = await fetchJson(`${POLY_AGENT_API_BASE}?action=ai-vs-humans&limit=25&agent_id=AIContrarian-Agent`)
      const s = settingsMap[aiId] || {}
      const threshold = s.divergence_threshold ?? 20
      const candidates = (res.data || []).filter(
        (m: Record<string, unknown>) => Math.abs((m.divergence as number) || 0) >= threshold
      )
      if (candidates.length) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)]
        const side = pick.divergenceDirection === 'bullish' ? 'YES' : 'NO'
        const yesPrice = pick.polymarketPrice
        const noPrice = 1 - yesPrice
        const aiConsensus = pick.aiConsensus ?? 0.5
        const price = side === 'YES' ? yesPrice : noPrice
        const fairValue = side === 'YES' ? aiConsensus : 1 - aiConsensus
        const baseSize = ORDER_AMOUNT_USD * (s.order_size_multiplier ?? 1.0)
        const jitter = 0.6 + Math.random() * 0.8
        const size = Number((baseSize * jitter).toFixed(2))
        const pnl = Number((size * (fairValue - price)).toFixed(2))

        const slug = pick.polymarketEventSlug || pick.slug
        let details: Record<string, unknown> | null = null
        if (slug) {
          try {
            const d = await fetchJson(`${POLY_AGENT_API_BASE}?action=market&slug=${encodeURIComponent(slug)}`)
            details = d.data || null
          } catch { /* ignore */ }
        }

        await supabase.from('trades').insert({
          strategy_id: aiId,
          agent_id: agentMap[aiId] || null,
          market: pick.title,
          side,
          notional: size,
          pnl,
          market_id: details?.market_id || null,
          market_slug: slug || null,
          closes_at: details?.closes_at || null,
          is_resolved: details?.is_resolved ?? false,
        })

        await supabase.from('events').insert({
          agent_id: agentMap[aiId] || null,
          event_type: 'ai_contrarian_signal',
          severity: 'info',
          message: `Signal: ${pick.title} (AI ${pick.aiConsensus?.toFixed?.(2) ?? pick.aiConsensus} vs market ${pick.polymarketPrice})`,
        })
        results.push(`Contrarian: ${pick.title} ${side}`)
      } else {
        results.push('Contrarian: no candidates')
      }
    } catch (err) {
      results.push(`Contrarian: error - ${(err as Error).message}`)
    }
  }

  return NextResponse.json({ ok: true, results })
}
