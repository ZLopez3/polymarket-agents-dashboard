import { NextResponse } from 'next/server'
import { supabase, verifyCronSecret, unauthorizedResponse, fetchJson } from '../_lib/supabase'
import { checkSafeguards, logTradeEvent } from '../_lib/safeguards'
import { placeOrder, resolveTokenIds } from '@/lib/polymarket'

// Run from Tokyo to avoid Polymarket geoblock (US, UK, EU all blocked)
export const preferredRegion = 'hnd1'

const BASE = 'https://gzydspfquuaudqeztorw.supabase.co/functions/v1/agent-api'

// Permanent wallets -- always included as baseline regardless of Fin recommendations
const SEED_WALLETS = new Set(
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

async function buildWatchlist(): Promise<Set<string>> {
  const { data: walletRecs } = await supabase
    .from('fin_recommendations')
    .select('payload')
    .eq('recommendation_type', 'wallet')
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(20)

  const finWallets = new Set(
    (walletRecs || [])
      .map((r) => {
        const p = r.payload as { address?: string }
        return p.address?.toLowerCase()
      })
      .filter((a): a is string => Boolean(a))
  )

  const combined = new Set([...SEED_WALLETS, ...finWallets])
  console.log(`[copy-trader] Watchlist: ${combined.size} wallets (${SEED_WALLETS.size} seed + ${finWallets.size} Fin-recommended)`)
  return combined
}

function sizeFromTier(tier: string) {
  if (tier === 'mega') return 30
  if (tier === 'large') return 20
  if (tier === 'medium') return 15
  return 10
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) return unauthorizedResponse()

  // Find copy trader strategy with trading mode info
  const { data: strategies } = await supabase
    .from('strategies')
    .select('id,name,trading_mode,max_position_size,max_orders_per_minute,daily_loss_limit')
    .ilike('name', '%Copy Trader%')
    .limit(1)
  const strategyRow = strategies?.[0]
  if (!strategyRow) {
    return NextResponse.json({ ok: false, error: 'Copy Trader strategy not found' }, { status: 404 })
  }

  const mode = strategyRow.trading_mode ?? 'paper'

  // Fetch strategy settings for resolution window filter
  const { data: settingsRows } = await supabase
    .from('strategy_settings')
    .select('max_resolution_days')
    .eq('strategy_id', strategyRow.id)
    .limit(1)
  const maxResDays = settingsRows?.[0]?.max_resolution_days ?? 0
  const maxResolutionMs = maxResDays > 0 ? maxResDays * 24 * 60 * 60 * 1000 : 0

  // Get recent trade hashes to deduplicate
  const { data: recentTrades } = await supabase
    .from('trades')
    .select('market,side')
    .eq('strategy_id', strategyRow.id)
    .order('executed_at', { ascending: false })
    .limit(100)
  const recentSet = new Set((recentTrades || []).map((t) => `${t.market}-${t.side}`))

  const results: string[] = []

  try {
    const WATCH_WALLETS = await buildWatchlist()

    const feed = await fetchJson(`${BASE}?action=whales&limit=200`)
    const rows = feed.data || []

    console.log(`[copy-trader] Fetched ${rows.length} whale rows, watching ${WATCH_WALLETS.size} wallets`)

    let matchedWallet = 0
    let passedResolution = 0

    for (const w of rows) {
      const wallet = (w.wallet || '').toLowerCase()
      if (!WATCH_WALLETS.has(wallet)) continue
      matchedWallet++

      if (maxResolutionMs > 0) {
        if (!w.closes_at) continue
        const closesAt = new Date(w.closes_at)
        if (Number.isNaN(closesAt.getTime())) continue
        if (closesAt.getTime() - Date.now() > maxResolutionMs) continue
      }
      passedResolution++

      const side = (w.outcome || '').toLowerCase().includes('no') ? 'NO' : 'YES'
      const dedupeKey = `${w.market_title}-${side}`
      if (recentSet.has(dedupeKey)) continue
      recentSet.add(dedupeKey)

      const notional = sizeFromTier(w.tier)
      let liveError: string | null = null

      if (mode === 'live') {
        // Run safeguard checks
        const safeguard = await checkSafeguards({
          supabase,
          strategyId: strategyRow.id,
          notional,
          maxPositionSize: strategyRow.max_position_size ?? 500,
          maxOrdersPerMinute: strategyRow.max_orders_per_minute ?? 5,
          dailyLossLimit: strategyRow.daily_loss_limit ?? -200,
        })

        if (!safeguard.passed) {
          await logTradeEvent(supabase, {
            strategyId: strategyRow.id,
            event: 'safety_block',
            mode: 'live',
            marketId: w.market_id,
            orderDetails: { market: w.market_title, side, notional, wallet: wallet.slice(0, 10) },
            result: safeguard.reason,
          })
          results.push(`BLOCKED: ${w.market_title} - ${safeguard.reason}`)
          continue
        }

        // Resolve CLOB token IDs from Gamma API using slug
        let tokenId: string | null = null
        let tickSize = '0.01'
        let negRisk = false
        if (w.market_slug || w.slug) {
          const tokens = await resolveTokenIds(w.market_slug || w.slug)
          if (tokens) {
            tokenId = side === 'YES' ? tokens.yesTokenId : tokens.noTokenId
            tickSize = tokens.tickSize
            negRisk = tokens.negRisk
          }
        }

        if (tokenId) {
          try {
            await logTradeEvent(supabase, {
              strategyId: strategyRow.id,
              event: 'live_request',
              mode: 'live',
              marketId: w.market_id,
              orderDetails: { tokenId, side, size: notional, wallet: wallet.slice(0, 10) },
            })

            const orderResult = await placeOrder({
              tokenId,
              price: w.price ?? 0.5,
              size: notional,
              side: side === 'YES' ? 'BUY' : 'SELL',
              tickSize,
              negRisk,
            })

            await logTradeEvent(supabase, {
              strategyId: strategyRow.id,
              event: 'live_response',
              mode: 'live',
              marketId: w.market_id,
              orderDetails: orderResult as unknown as Record<string, unknown>,
              result: 'success',
            })
          } catch (err) {
            liveError = (err as Error).message
            await logTradeEvent(supabase, {
              strategyId: strategyRow.id,
              event: 'live_response',
              mode: 'live',
              marketId: w.market_id,
              error: liveError,
              result: 'failed',
            })
          }
        } else {
          liveError = 'No tokenId for live execution'
          await logTradeEvent(supabase, {
            strategyId: strategyRow.id,
            event: 'safety_block',
            mode: 'live',
            marketId: w.market_id,
            result: liveError,
          })
        }
      }

      // Always insert trade record -- with status and error for failed live trades
      const tradeStatus = mode === 'live' && liveError ? 'failed' : 'filled'
      await supabase.from('trades').insert({
        strategy_id: strategyRow.id,
        market: w.market_title,
        side,
        notional,
        pnl: tradeStatus === 'failed' ? 0 : 0,
        market_id: w.market_id || null,
        market_slug: w.market_slug || null,
        closes_at: w.closes_at || null,
        is_resolved: w.is_resolved ?? false,
        status: tradeStatus,
        error: liveError || null,
        trading_mode: mode,
      })

      await logTradeEvent(supabase, {
        strategyId: strategyRow.id,
        event: mode === 'live' ? 'live_exec' : 'paper_exec',
        mode,
        marketId: w.market_id,
        orderDetails: { market: w.market_title, side, notional, wallet: wallet.slice(0, 10), status: tradeStatus },
        result: tradeStatus === 'failed' ? `failed: ${liveError}` : 'recorded',
      })

      await supabase.from('events').insert({
        agent_id: null,
        event_type: 'copy_trade_signal',
        severity: 'info',
        message: `Copy-trade: ${wallet.slice(0, 6)}... ${side} ${w.market_title} @ ${w.price} (tier: ${w.tier}) [${mode}]`,
      })

      results.push(`${mode.toUpperCase()}: ${w.market_title} ${side}`)
    }

    console.log(`[copy-trader] Summary: ${rows.length} fetched, ${matchedWallet} wallet-matched, ${passedResolution} passed-resolution, ${results.length} traded`)

    return NextResponse.json({ ok: true, mode, trades: results.length, results, diagnostics: { fetched: rows.length, matchedWallet, passedResolution } })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
