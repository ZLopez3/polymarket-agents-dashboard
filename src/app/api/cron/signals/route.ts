import { NextResponse } from 'next/server'
import { supabase, verifyCronSecret, unauthorizedResponse, fetchJson } from '../_lib/supabase'
import { checkSafeguards, logTradeEvent } from '../_lib/safeguards'
import { placeOrder, resolveTokenIds } from '@/lib/polymarket'

// Run from Tokyo to avoid Polymarket geoblock (US, UK, EU all blocked)
export const preferredRegion = 'hnd1'

const POLY_AGENT_API_BASE = 'https://gzydspfquuaudqeztorw.supabase.co/functions/v1/agent-api'
const ORDER_AMOUNT_USD = Number(process.env.ORDER_AMOUNT_USD || 20)

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) return unauthorizedResponse()

  const { data: strategies } = await supabase.from('strategies').select('id,name,trading_mode,max_position_size,max_orders_per_minute,daily_loss_limit')
  const { data: agents } = await supabase.from('agents').select('id,name,strategy_id')
  const { data: settings } = await supabase.from('strategy_settings').select('*')

  const strategyMap: Record<string, typeof strategies extends (infer T)[] | null ? T : never> = {}
  ;(strategies || []).forEach((s) => (strategyMap[s.name] = s))

  const agentMap: Record<string, string> = {}
  ;(agents || []).forEach((a) => { if (a.strategy_id) agentMap[a.strategy_id] = a.id })

  const settingsMap: Record<string, Record<string, number>> = {}
  ;(settings || []).forEach((s) => (settingsMap[s.strategy_id] = s))

  const results: string[] = []

  // --- Fetch Fin recommendations ---
  const { data: hotBetRecs } = await supabase
    .from('fin_recommendations')
    .select('payload')
    .eq('recommendation_type', 'hot_bet')
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(10)

  const finHotMarkets = new Set(
    (hotBetRecs || []).map((r) => (r.payload as { market_title?: string }).market_title).filter(Boolean)
  )

  const { data: tuningRecs } = await supabase
    .from('fin_recommendations')
    .select('payload')
    .eq('recommendation_type', 'tuning')
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)

  const tuning = tuningRecs?.[0]?.payload as {
    certainty_delta?: number
    size_multiplier_delta?: number
    avg_win_rate?: number
  } | undefined

  if (tuning) {
    console.log(`[signals] Fin tuning active: certainty_delta=${tuning.certainty_delta ?? 0}, size_delta=${tuning.size_multiplier_delta ?? 0}, avg_win_rate=${tuning.avg_win_rate ?? '?'}`)
    await supabase.from('events').insert({
      event_type: 'fin_tuning_applied',
      severity: 'info',
      message: `Fin auto-tune applied: certainty ${(tuning.certainty_delta ?? 0) >= 0 ? '+' : ''}${tuning.certainty_delta ?? 0}, size ${(tuning.size_multiplier_delta ?? 0) >= 0 ? '+' : ''}${tuning.size_multiplier_delta ?? 0} (avg wallet win rate: ${tuning.avg_win_rate?.toFixed(1) ?? '?'}%)`,
    })
  }

  console.log(`[signals] Fin recs: ${hotBetRecs?.length ?? 0} hot bets, ${finHotMarkets.size} unique markets, tuning: ${tuning ? 'yes' : 'no'}`)

  // Helper: check if a market's resolution date is within the configured window
  function withinResolutionWindow(closesAt: string | null | undefined, maxDays: number): boolean {
    if (!maxDays || maxDays <= 0) return true // 0 = no filter
    if (!closesAt) return false // no resolution date = skip when filter is active
    const closesMs = new Date(closesAt).getTime()
    if (Number.isNaN(closesMs)) return false
    const maxMs = Date.now() + maxDays * 24 * 60 * 60 * 1000
    return closesMs <= maxMs
  }

  // Helper: execute a trade (paper or live)
  async function executeTrade(
    strategyRow: { id: string; name: string; trading_mode: string | null; max_position_size: number | null; max_orders_per_minute: number | null; daily_loss_limit: number | null },
    trade: { market: string; side: string; notional: number; pnl: number; market_id?: string | null; market_slug?: string | null; closes_at?: string | null; is_resolved?: boolean },
    agentId: string | null,
    tokenId?: string | null,
    tickSize?: string,
    negRisk?: boolean,
  ) {
    const mode = strategyRow.trading_mode ?? 'paper'
    const strategyId = strategyRow.id
    let liveError: string | null = null

    if (mode === 'live') {
      // Run safeguard checks
      const safeguard = await checkSafeguards({
        supabase,
        strategyId,
        notional: trade.notional,
        maxPositionSize: strategyRow.max_position_size ?? 500,
        maxOrdersPerMinute: strategyRow.max_orders_per_minute ?? 5,
        dailyLossLimit: strategyRow.daily_loss_limit ?? -200,
      })

      if (!safeguard.passed) {
        await logTradeEvent(supabase, {
          strategyId,
          event: 'safety_block',
          mode: 'live',
          marketId: trade.market_id,
          orderDetails: { market: trade.market, side: trade.side, notional: trade.notional },
          result: safeguard.reason,
        })
        results.push(`${strategyRow.name}: BLOCKED - ${safeguard.reason}`)
        return
      }

      // Attempt live execution
      if (tokenId) {
        try {
          await logTradeEvent(supabase, {
            strategyId,
            event: 'live_request',
            mode: 'live',
            marketId: trade.market_id,
            orderDetails: { tokenId, side: trade.side, size: trade.notional, price: trade.side === 'YES' ? 0.5 : 0.5 },
          })

          const orderResult = await placeOrder({
            tokenId,
            price: trade.side === 'YES' ? 0.5 : 0.5,
            size: trade.notional,
            side: trade.side as 'BUY' | 'SELL',
            tickSize: tickSize || '0.01',
            negRisk: negRisk || false,
          })

          await logTradeEvent(supabase, {
            strategyId,
            event: 'live_response',
            mode: 'live',
            marketId: trade.market_id,
            orderDetails: orderResult as unknown as Record<string, unknown>,
            result: 'success',
          })

          results.push(`${strategyRow.name}: LIVE ${trade.market} ${trade.side}`)
        } catch (err) {
          liveError = (err as Error).message
          await logTradeEvent(supabase, {
            strategyId,
            event: 'live_error',
            mode: 'live',
            marketId: trade.market_id,
            error: liveError,
            result: 'failed',
          })
        }
      } else {
        liveError = 'No tokenId available for live execution'
        await logTradeEvent(supabase, {
          strategyId,
          event: 'safety_block',
          mode: 'live',
          marketId: trade.market_id,
          result: liveError,
        })
      }
    }

    // Always insert trade record -- with status and error for failed live trades
    const tradeStatus = mode === 'live' && liveError ? 'failed' : 'filled'
    await supabase.from('trades').insert({
      strategy_id: strategyId,
      agent_id: agentId,
      market: trade.market,
      side: trade.side,
      notional: trade.notional,
      pnl: tradeStatus === 'failed' ? 0 : trade.pnl,
      market_id: trade.market_id || null,
      market_slug: trade.market_slug || null,
      closes_at: trade.closes_at || null,
      is_resolved: trade.is_resolved ?? false,
      status: tradeStatus,
      error: liveError || null,
      trading_mode: mode,
    })

    await logTradeEvent(supabase, {
      strategyId,
      event: mode === 'live' ? 'live_exec' : 'paper_exec',
      mode,
      marketId: trade.market_id,
      orderDetails: { market: trade.market, side: trade.side, notional: trade.notional, pnl: trade.pnl, status: tradeStatus },
      result: tradeStatus === 'failed' ? `failed: ${liveError}` : 'recorded',
    })

    if (mode === 'paper') {
      results.push(`${strategyRow.name}: PAPER ${trade.market} ${trade.side}`)
    }
  }

  // --- Bond Ladder Signal ---
  const bondRow = strategyMap['Polymarket Bond Ladder']
  if (bondRow) {
    try {
      const markets = await fetchJson(`${POLY_AGENT_API_BASE}?action=markets&limit=25&sort=volume_usd&agent_id=BondLadder-Agent`)
      const s = settingsMap[bondRow.id] || {}
      // Apply Fin tuning deltas with safety clamps
      const baseCertainty = s.certainty_threshold ?? 0.95
      const certainty = Math.max(0.85, Math.min(0.99, baseCertainty + (tuning?.certainty_delta ?? 0)))
      const liquidityFloor = (s.liquidity_floor ?? 0.5) * 1_000_000
      const baseSizeMult = s.order_size_multiplier ?? 1.0
      const sizeMult = Math.max(0.3, Math.min(2.0, baseSizeMult + (tuning?.size_multiplier_delta ?? 0)))
      const maxResDays = s.max_resolution_days ?? 0
      const now = Date.now()
      let candidates = (markets.data || []).filter(
        (m: Record<string, unknown>) =>
          ((m.yes_price as number) >= certainty || (m.no_price as number) >= certainty) &&
          !m.is_resolved &&
          ((m.liquidity_usd as number) ?? 0) >= liquidityFloor &&
          withinResolutionWindow(m.closes_at as string | null, maxResDays) &&
          (!m.closes_at || new Date(m.closes_at as string).getTime() > now)
      )

      // Prioritize Fin-recommended markets: move them to the front
      if (finHotMarkets.size > 0 && candidates.length > 1) {
        candidates.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
          const aFin = finHotMarkets.has(a.title as string) ? 1 : 0
          const bFin = finHotMarkets.has(b.title as string) ? 1 : 0
          return bFin - aFin
        })
      }

      // Fallback: if no candidates from main scan, check Fin hot bets that pass certainty
      if (candidates.length === 0 && finHotMarkets.size > 0) {
        const allMarkets = markets.data || []
        candidates = allMarkets.filter(
          (m: Record<string, unknown>) =>
            finHotMarkets.has(m.title as string) &&
            ((m.yes_price as number) >= certainty * 0.95 || (m.no_price as number) >= certainty * 0.95) &&
            !m.is_resolved &&
            (!m.closes_at || new Date(m.closes_at as string).getTime() > now)
        )
        if (candidates.length) console.log(`[signals] BondLadder: using ${candidates.length} Fin hot bet fallback candidates`)
      }

      if (candidates.length) {
        const pick = candidates[Math.floor(Math.random() * Math.min(3, candidates.length))]
        const side = pick.yes_price >= pick.no_price ? 'YES' : 'NO'
        const price = side === 'YES' ? pick.yes_price : pick.no_price
        const baseSize = ORDER_AMOUNT_USD * sizeMult
        const jitter = 0.6 + Math.random() * 0.8
        const size = Number((baseSize * jitter).toFixed(2))
        const pnl = Number((size * (1.0 - price)).toFixed(2))
        const finBoosted = finHotMarkets.has(pick.title)

        // Resolve CLOB token IDs from Gamma API using slug
        let bondTokenId: string | null = null
        let bondTickSize = '0.01'
        let bondNegRisk = false
        if (pick.slug) {
          const tokens = await resolveTokenIds(pick.slug)
          if (tokens) {
            bondTokenId = side === 'YES' ? tokens.yesTokenId : tokens.noTokenId
            bondTickSize = tokens.tickSize
            bondNegRisk = tokens.negRisk
          }
        }

        await executeTrade(
          bondRow,
          { market: pick.title, side, notional: size, pnl, market_id: pick.market_id, market_slug: pick.slug, closes_at: pick.closes_at, is_resolved: pick.is_resolved ?? false },
          agentMap[bondRow.id] || null,
          bondTokenId,
          bondTickSize,
          bondNegRisk,
        )

        await supabase.from('events').insert({
          agent_id: agentMap[bondRow.id] || null,
          event_type: 'bond_ladder_signal',
          severity: 'info',
          message: `Signal: ${pick.title} @ ${price} (${side}) [${bondRow.trading_mode ?? 'paper'}]${finBoosted ? ' [Fin-recommended]' : ''}`,
        })
      } else {
        results.push('BondLadder: no candidates')
      }
    } catch (err) {
      results.push(`BondLadder: error - ${(err as Error).message}`)
    }
  }

  // --- AI Contrarian Signal ---
  const aiRow = strategyMap['AI Contrarian']
  if (aiRow) {
    try {
      const res = await fetchJson(`${POLY_AGENT_API_BASE}?action=ai-vs-humans&limit=25&agent_id=AIContrarian-Agent`)
      const s = settingsMap[aiRow.id] || {}
      // Apply Fin tuning: divergence threshold stays in [10, 50] range
      // Note: for divergence, a positive certainty_delta means tighter markets -> we can be less aggressive
      const baseDiv = s.divergence_threshold ?? 20
      const threshold = Math.max(10, Math.min(50, baseDiv))
      const aiBaseSizeMult = s.order_size_multiplier ?? 1.0
      const aiSizeMult = Math.max(0.3, Math.min(2.0, aiBaseSizeMult + (tuning?.size_multiplier_delta ?? 0)))
      // Fin hot bet confirmation: lower threshold by 30% for Fin-confirmed markets
      const candidates = (res.data || []).filter(
        (m: Record<string, unknown>) => {
          const div = Math.abs((m.divergence as number) || 0)
          const finConfirmed = finHotMarkets.has(m.title as string)
          return div >= (finConfirmed ? threshold * 0.7 : threshold)
        }
      )
      if (candidates.length) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)]
        const side = pick.divergenceDirection === 'bullish' ? 'YES' : 'NO'
        const yesPrice = pick.polymarketPrice
        const noPrice = 1 - yesPrice
        const aiConsensus = pick.aiConsensus ?? 0.5
        const price = side === 'YES' ? yesPrice : noPrice
        const fairValue = side === 'YES' ? aiConsensus : 1 - aiConsensus
        const baseSize = ORDER_AMOUNT_USD * aiSizeMult
        const jitter = 0.6 + Math.random() * 0.8
        const size = Number((baseSize * jitter).toFixed(2))
        const pnl = Number((size * (fairValue - price)).toFixed(2))
        const aiFin = finHotMarkets.has(pick.title)

        // Use market-level slug (not event slug) for Gamma lookups
        const marketSlug = pick.slug
        const eventSlug = pick.polymarketEventSlug
        let details: Record<string, unknown> | null = null
        // Try market slug first for agent API details, fall back to event slug
        for (const s of [marketSlug, eventSlug].filter(Boolean)) {
          try {
            const d = await fetchJson(`${POLY_AGENT_API_BASE}?action=market&slug=${encodeURIComponent(s)}`)
            if (d.data) { details = d.data; break }
          } catch { /* try next */ }
        }

        // Resolve CLOB token IDs from Gamma API using market-level slug only
        let tokenId: string | null = null
        let tickSize = '0.01'
        let negRisk = false
        if (marketSlug) {
          const tokens = await resolveTokenIds(marketSlug)
          if (tokens) {
            tokenId = side === 'YES' ? tokens.yesTokenId : tokens.noTokenId
            tickSize = tokens.tickSize
            negRisk = tokens.negRisk
          }
        }

        // Apply resolution window filter
        const aiMaxResDays = s.max_resolution_days ?? 0
        const closesAt = (details?.closes_at as string) || null
        if (!withinResolutionWindow(closesAt, aiMaxResDays)) {
          results.push(`Contrarian: skipped ${pick.title} - resolves outside ${aiMaxResDays}d window`)
        } else {

        await executeTrade(
          aiRow,
          { market: pick.title, side, notional: size, pnl, market_id: (details?.market_id as string) || null, market_slug: marketSlug || eventSlug || null, closes_at: (details?.closes_at as string) || null, is_resolved: (details?.is_resolved as boolean) ?? false },
          agentMap[aiRow.id] || null,
          tokenId,
          tickSize,
          negRisk,
        )

        await supabase.from('events').insert({
          agent_id: agentMap[aiRow.id] || null,
          event_type: 'ai_contrarian_signal',
          severity: 'info',
          message: `Signal: ${pick.title} (AI ${pick.aiConsensus?.toFixed?.(2) ?? pick.aiConsensus} vs market ${pick.polymarketPrice}) [${aiRow.trading_mode ?? 'paper'}]${aiFin ? ' [Fin-confirmed]' : ''}`,
        })

        } // end withinResolutionWindow else
      } else {
        results.push('Contrarian: no candidates')
      }
    } catch (err) {
      results.push(`Contrarian: error - ${(err as Error).message}`)
    }
  }

  return NextResponse.json({ ok: true, results })
}
