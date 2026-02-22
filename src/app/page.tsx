import Link from 'next/link'

import CopyTraderTradesTable from '@/app/components/CopyTraderTradesTable'
import CopyTraderWatchlist from '@/app/components/CopyTraderWatchlist'

import { supabase } from '@/lib/supabaseClient'
import type { Agent, AgentEvent, AgentHeartbeat, AgentRow, CopyTraderWallet, Strategy, StrategyStats, Trade } from '@/types/dashboard'

export const dynamic = 'force-dynamic'

interface FinWalletRec {
  payload: { address?: string; username?: string; win_rate?: number; copy_score?: number; categories?: Record<string, number>; last_trade_date?: string | null }
  created_at: string
}

interface SummaryData {
  strategies: Strategy[]
  agents: Agent[]
  trades: Trade[]
  events: AgentEvent[]
  heartbeats: AgentHeartbeat[]
  copySignals: AgentEvent[]
  finWalletRecs: FinWalletRec[]
}

async function fetchSummary(): Promise<SummaryData> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { strategies: [], agents: [], trades: [], events: [], heartbeats: [], copySignals: [], finWalletRecs: [] }
  }

  const [strategiesRes, agentsRes, tradesRes, eventsRes, heartbeatsRes, copySignalsRes, finWalletRecsRes] = await Promise.all([
    supabase.from('strategies').select('*').limit(10),
    supabase.from('agents').select('*').limit(10),
    supabase.from('trades').select('*').order('executed_at', { ascending: false }).limit(500),
    supabase.from('events').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('agent_heartbeats').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('events').select('*').or('event_type.like.copy_trader%,event_type.like.copy_trade_%').order('created_at', { ascending: false }).limit(20),
    supabase.from('fin_recommendations').select('payload,created_at').eq('recommendation_type', 'wallet').gte('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(20),
  ])

  return {
    strategies: (strategiesRes.data ?? []) as Strategy[],
    agents: (agentsRes.data ?? []) as Agent[],
    trades: (tradesRes.data ?? []) as Trade[],
    events: (eventsRes.data ?? []) as AgentEvent[],
    heartbeats: (heartbeatsRes.data ?? []) as AgentHeartbeat[],
    copySignals: (copySignalsRes.data ?? []) as AgentEvent[],
    finWalletRecs: (finWalletRecsRes.data ?? []) as FinWalletRec[],
  }
}

const formatTs = (ts?: string | null) => (ts ? new Date(ts).toLocaleString('en-US', { timeZone: 'America/New_York' }) : '—')
const formatDate = (ts?: string | null) => (ts ? new Date(ts).toLocaleDateString('en-US', { timeZone: 'America/New_York' }) : '—')

const resolutionColor = (trade: Trade, nowTs: number) => {
  if (trade.is_resolved) {
    return trade.side === 'YES' ? 'bg-emerald-500' : 'bg-rose-500'
  }
  if (trade.closes_at && new Date(trade.closes_at).getTime() < nowTs) {
    return 'bg-amber-500'
  }
  return 'bg-slate-500'
}

const resolutionTitle = (trade: Trade, nowTs: number) => {
  if (trade.is_resolved) return trade.side
  if (trade.closes_at && new Date(trade.closes_at).getTime() < nowTs) return 'Past close, awaiting resolution'
  return 'Unresolved'
}

const parseFinInsight = (message?: string | null) => {
  if (!message) return null
  const topMarker = 'Top wallets:'
  const hotMarker = 'Hot bets:'
  const topIdx = message.indexOf(topMarker)
  if (topIdx === -1) {
    return { heading: message.trim(), wallets: [], bets: [] }
  }
  const hotIdx = message.indexOf(hotMarker)
  const heading = message.slice(0, topIdx).trim()
  const walletsSegment = hotIdx === -1 ? message.slice(topIdx + topMarker.length) : message.slice(topIdx + topMarker.length, hotIdx)
  const betsSegment = hotIdx === -1 ? '' : message.slice(hotIdx + hotMarker.length)
  const wallets = walletsSegment
    .split('•')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const bets = betsSegment
    .split('•')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return { heading, wallets, bets }
}

const statusColor = (status: string) => {
  const s = (status || '').toLowerCase()
  if (s.includes('ok') || s.includes('alive') || s.includes('up')) return 'bg-emerald-500'
  if (s.includes('warn')) return 'bg-amber-500'
  if (s.includes('err') || s.includes('down')) return 'bg-rose-500'
  return 'bg-slate-500'
}

export default async function Home() {
  const { strategies, agents, trades, events, heartbeats, copySignals, finWalletRecs } = await fetchSummary()
  const now = new Date().getTime()

  const executionAgents = agents.filter((agent) => (agent.agent_type ?? 'execution') === 'execution')
  const utilityAgents = agents.filter((agent) => ['utility', 'research'].includes((agent.agent_type ?? '').toLowerCase()))

  const latestHeartbeatMap = heartbeats.reduce<Record<string, AgentHeartbeat>>((acc, hb) => {
    if (!hb?.agent_id || acc[hb.agent_id]) return acc
    acc[hb.agent_id] = hb
    return acc
  }, {})

  const descriptionMap: Record<string, string> = {
    'BondLadder-Agent': 'Harvests high-certainty markets for steady yield.',
    'AIContrarian-Agent': 'Fades crowd consensus using AI divergence signals.',
    Audi: 'Audits strategy drawdowns and auto-tunes parameters.',
  }

  const strategyStats: StrategyStats[] = strategies.map((strategy) => {
    const isLive = strategy.trading_mode === 'live'
    const modeSwitchedAt = strategy.mode_switched_at ? new Date(strategy.mode_switched_at).getTime() : 0
    const strategyTrades = trades.filter((trade) => {
      if (trade.strategy_id !== strategy.id) return false
      if (modeSwitchedAt && trade.executed_at) {
        return new Date(trade.executed_at).getTime() >= modeSwitchedAt
      }
      return true
    })
    const notional = strategyTrades.reduce((acc, trade) => acc + (Number(trade.notional) || 0), 0)
    const tradeCount = strategyTrades.length

    // For live strategies, use the reset portfolio values from the DB
    // For paper strategies, compute from historical trades as before
    const paperPnl = strategyTrades.reduce((acc, trade) => acc + (Number(trade.pnl) || 0), 0)
    const base = Number(strategy.paper_capital ?? strategy.capital_allocation ?? 1000)

    const pnl = isLive ? Number(strategy.paper_pnl ?? 0) : paperPnl
    const equity = isLive
      ? base + Number(strategy.paper_pnl ?? 0)
      : base + paperPnl

    return { ...strategy, pnl, notional, tradeCount, equity, base }
  })

  const strategyMap = strategyStats.reduce<Record<string, StrategyStats>>((acc, strategy) => {
    acc[strategy.id] = strategy
    return acc
  }, {})

  const primaryStrategyByAgent = agents.reduce<Record<string, StrategyStats>>((acc, agent) => {
    if (agent.strategy_id) {
      const baseStrategy = strategyMap[agent.strategy_id]
      if (baseStrategy) {
        acc[agent.id] = baseStrategy
      }
    }
    return acc
  }, {})

  const agentNameMap = agents.reduce<Record<string, string>>((acc, agent) => {
    acc[agent.id] = agent.name
    return acc
  }, {})

  const strategyByAgent = strategyStats.reduce<Record<string, StrategyStats[]>>((acc, strategy) => {
    const key = strategy.agent_id ?? 'unassigned'
    acc[key] = acc[key] || []
    acc[key].push(strategy)
    return acc
  }, {})

  const agentRows: AgentRow[] = agents.map((agent) => {
    const strat = agent.strategy_id ? strategyMap[agent.strategy_id] : undefined
    const isLive = strat?.trading_mode === 'live'
    const sTrades = trades.filter((trade) => trade.strategy_id === agent.strategy_id)
    const notional = sTrades.reduce((acc, trade) => acc + (Number(trade.notional) || 0), 0)
    const cash = isLive
      ? Number(strat?.paper_cash ?? strat?.base ?? 1000)
      : Math.max((strat?.base ?? 1000) - notional + (strat?.pnl ?? 0), 0)
    const positions = new Set(sTrades.map((trade) => trade.market)).size
    return {
      ...agent,
      portfolio: strat?.equity ?? 0,
      pnl: strat?.pnl ?? 0,
      cash,
      positions,
      trades: isLive ? 0 : sTrades.length,
      mode: strat?.trading_mode ?? 'paper',
    }
  })

  const agentRowMap = agentRows.reduce<Record<string, AgentRow>>((acc, row) => {
    acc[row.id] = row
    return acc
  }, {})

  const leaderboardRows = agentRows.filter((agent) => (agent.agent_type ?? '').toLowerCase() !== 'utility')

  // Build strategy-level leaderboard rows (execution agents only, exclude utility/research)
  const utilityAgentIds = new Set(
    agents.filter((a) => ['utility', 'research'].includes((a.agent_type ?? '').toLowerCase())).map((a) => a.id)
  )
  const leaderboardStrategies = strategyStats.filter((s) => {
    if (!s.agent_id) return false
    return !utilityAgentIds.has(s.agent_id)
  })
  const liveLeaderboard = leaderboardStrategies
    .filter((s) => s.trading_mode === 'live')
    .sort((a, b) => b.pnl - a.pnl)
  const paperLeaderboard = leaderboardStrategies
    .filter((s) => s.trading_mode !== 'live')
    .sort((a, b) => b.pnl - a.pnl)

  const leaderboardMeta = (s: StrategyStats) => {
    const agentName = s.agent_id ? agentNameMap[s.agent_id] ?? 'Unknown' : 'Unassigned'
    const isLive = s.trading_mode === 'live'
    const modeSwitchedAt = s.mode_switched_at ? new Date(s.mode_switched_at).getTime() : 0
    // Only count trades that belong to the current mode epoch
    const sTrades = trades.filter((t) => {
      if (t.strategy_id !== s.id) return false
      if (modeSwitchedAt && t.executed_at) {
        return new Date(t.executed_at).getTime() >= modeSwitchedAt
      }
      return true
    })
    const notional = sTrades.reduce((acc, t) => acc + (Number(t.notional) || 0), 0)
    const base = s.base ?? Number(s.paper_capital ?? 1000)
    const cash = Math.max(0, isLive
      ? base + (s.pnl ?? 0) - notional
      : base - notional + (s.pnl ?? 0))
    const positions = new Set(sTrades.map((t) => t.market)).size
    const tradeCount = sTrades.length
    return { agentName, cash, positions, tradeCount }
  }

  const totalPositions = new Set(trades.map((trade) => trade.market)).size
  const recentTrades = trades.slice(0, 30)
  const recentEvents = events.slice(0, 30)

  const finAgent = agents.find((agent) => agent.name === 'Fin') ?? null
  const finHeartbeat = finAgent ? latestHeartbeatMap[finAgent.id] : undefined
  const finLastUpdated = finHeartbeat ? formatTs(finHeartbeat.created_at) : null
  const finEvent = finAgent
    ? events.find((event) => event.agent_id === finAgent.id)
    : undefined
  const parsedFinInsight = parseFinInsight(finEvent?.message)

  // Locate the Copy Trader strategy first (name is reliable), then find the Cot agent via agent_id
  const copyTraderStrategy = strategyStats.find((s) => {
    const n = s.name.toLowerCase().replace(/[-_]/g, ' ')
    return n.includes('copy trader') || n.includes('copytrader') || n.includes('whale mirror')
  }) ?? null

  // The copy-trader agent is named "Cot" in the DB -- match by agent_id from the strategy, or by name
  const copyTraderAgent = agents.find((a) => {
    if (copyTraderStrategy?.agent_id && a.id === copyTraderStrategy.agent_id) return true
    const n = a.name.toLowerCase()
    return n === 'cot' || (n.includes('copy') && n.includes('trader'))
  }) ?? null

  // Match trades by strategy_id, or by any strategy linked to the Cot agent
  const copyTraderStrategyIds = new Set(
    strategyStats
      .filter((s) => copyTraderAgent && s.agent_id === copyTraderAgent.id)
      .map((s) => s.id)
  )
  if (copyTraderStrategy) copyTraderStrategyIds.add(copyTraderStrategy.id)

  const cotModeSwitchedAt = copyTraderStrategy?.mode_switched_at ? new Date(copyTraderStrategy.mode_switched_at).getTime() : 0
  const copyTraderTrades = trades.filter((t) => {
    if (!copyTraderStrategyIds.has(t.strategy_id)) return false
    if (cotModeSwitchedAt && t.executed_at) {
      return new Date(t.executed_at).getTime() >= cotModeSwitchedAt
    }
    return true
  })

  const copyTraderTotalNotional = copyTraderTrades.reduce((acc, trade) => acc + (Number(trade.notional) || 0), 0)
  const copyTraderAvgNotional = copyTraderTrades.length ? copyTraderTotalNotional / copyTraderTrades.length : 0
  const copyTraderUniqueMarkets = new Set(copyTraderTrades.map((trade) => trade.market)).size
  const copyTraderWins = copyTraderTrades.filter((trade) => Number(trade.pnl) > 0).length
  const copyTraderWinRate = copyTraderTrades.length ? (copyTraderWins / copyTraderTrades.length) * 100 : 0

  // Collect copy trader signals: dedicated query + events from the Cot agent + matching event_type fallback
  const cotAgentEvents = copyTraderAgent
    ? events.filter((e) => e.agent_id === copyTraderAgent.id)
    : []
  const copyTraderSignals = [
  ...copySignals,
  ...cotAgentEvents.filter((e) => !copySignals.some((cs) => cs.id === e.id)),
  ].filter((e) => e.event_type !== 'copy_trader_online') // exclude heartbeats
  const copyTraderRecentSignals = copyTraderSignals.slice(0, 5)
  const copyTraderLastSignal = copyTraderSignals[0] ?? null


  // Build watchlist: permanent wallets + Fin-recommended wallets
  // Build a lookup from Fin recs so we can enrich permanent wallets with live data
  const finRecMap = new Map<string, FinWalletRec['payload']>()
  for (const r of finWalletRecs) {
    if (r.payload?.address) finRecMap.set(r.payload.address.toLowerCase(), r.payload)
  }

  const permanentWallets: { address: string; label: string; defaultWinRate: number; defaultCopyScore: number; notes: string }[] = [
    { address: '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee', label: 'Pilot wallet A', defaultWinRate: 60, defaultCopyScore: 7, notes: 'Seed wallet' },
    { address: '0x63ce342161250d705dc0b16df89036c8e5f9ba9a', label: 'Pilot wallet B', defaultWinRate: 60, defaultCopyScore: 7, notes: 'Seed wallet' },
    { address: '0xdfe3fedc5c7679be42c3d393e99d4b55247b73c4', label: 'cqs', defaultWinRate: 67.8, defaultCopyScore: 10, notes: 'Leaderboard #1' },
    { address: '0xd1ecfa3e7d221851663f739626dcd15fca565d8e', label: 'Scott8153', defaultWinRate: 84.5, defaultCopyScore: 10, notes: 'High win rate politics' },
    { address: '0x5739ddf8672627ce076eff5f444610a250075f1a', label: 'hopedieslast', defaultWinRate: 69.5, defaultCopyScore: 10, notes: 'Balanced exposure' },
    { address: '0x7f3c8979d0afa00007bae4747d5347122af05613', label: 'LucasMeow', defaultWinRate: 95.2, defaultCopyScore: 10, notes: 'Crypto specialist' },
    { address: '0x4dfd481c16d9995b809780fd8a9808e8689f6e4a', label: 'Magamyman', defaultWinRate: 66.7, defaultCopyScore: 10, notes: 'Diversified' },
    { address: '0xe52c0a1327a12edc7bd54ea6f37ce00a4ca96924', label: 'aff3', defaultWinRate: 78.0, defaultCopyScore: 10, notes: 'Steady risk profile' },
    { address: '0x0b219cf3d297991b58361dbebdbaa91e56b8deb6', label: 'TerreMoto', defaultWinRate: 83.7, defaultCopyScore: 10, notes: 'High confidence' },
    { address: '0x85d575c99b977e9e39543747c859c83b727aaece', label: 'warlasfutpro', defaultWinRate: 79.6, defaultCopyScore: 10, notes: 'Politics heavy' },
    { address: '0xf5fe759cece500f58a431ef8dacea321f6e3e23d', label: 'Stavenson', defaultWinRate: 89.2, defaultCopyScore: 10, notes: 'Ultra-consistent' },
    { address: '0x9c667a1d1c1337c6dca9d93241d386e4ed346b66', label: 'InfiniteCrypt0', defaultWinRate: 71.2, defaultCopyScore: 10, notes: 'Fast cadence' },
  ]

  const permanentAddresses = new Set(permanentWallets.map((w) => w.address.toLowerCase()))

  // Build permanent wallet entries, enriched with live Fin data when available
  const watchlistPermanent: CopyTraderWallet[] = permanentWallets.map((pw) => {
    const addr = pw.address.toLowerCase()
    const fin = finRecMap.get(addr)
    const winRate = fin?.win_rate ?? pw.defaultWinRate
    const copyScore = fin?.copy_score ?? pw.defaultCopyScore
    const tier = winRate >= 80 ? 'green' : winRate >= 60 ? 'yellow' : 'red'
    const label = (fin?.username) || pw.label
    return {
      address: addr,
      label,
      winRate,
      copyScore,
      tier,
      lastTrade: fin?.last_trade_date ?? null,
      sourceUrl: `https://polymarket.com/profile/${addr}`,
      notes: fin ? `Fin-verified | ${pw.notes}` : pw.notes,
    }
  })

  // Add Fin-discovered wallets not already in the permanent list
  const extraFinWallets: CopyTraderWallet[] = finWalletRecs
    .filter((r) => r.payload?.address && !permanentAddresses.has(r.payload.address.toLowerCase()))
    .map((r) => {
      const p = r.payload
      const addr = (p.address ?? '').toLowerCase()
      const winRate = p.win_rate ?? 0
      const copyScore = p.copy_score ?? 0
      const tier = winRate >= 80 ? 'green' : winRate >= 60 ? 'yellow' : 'red'
      const topCat = p.categories
        ? Object.entries(p.categories).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
        : ''
      return {
        address: addr,
        label: p.username || 'Unknown',
        winRate,
        copyScore,
        tier,
        lastTrade: p.last_trade_date ?? null,
        sourceUrl: `https://polymarket.com/profile/${addr}`,
        notes: `Fin-discovered${topCat ? ` (${topCat} focus)` : ''}`,
      }
    })

  const copyTraderWatchlist: CopyTraderWallet[] = [...watchlistPermanent, ...extraFinWallets]

  const indicator = (trade: Trade) =>
    trade.is_resolved ? <span title="Resolved">{'✅'}</span> : <span title="Unresolved">{'❌'}</span>

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link href="/settings" className="rounded-full border border-slate-800 px-4 py-2 text-sm text-slate-300 hover:text-white">
          ⚙️ Settings
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-slate-400 text-sm">Agents</div>
          <div className="text-2xl font-semibold">{agentRows.length}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-slate-400 text-sm">Trades</div>
          <div className="text-2xl font-semibold">{trades.length}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-slate-400 text-sm">Positions</div>
          <div className="text-2xl font-semibold">{totalPositions}</div>
        </div>
      </section>

      {/* Live Trading Leaderboard */}
      <section>
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold">Live Trading Leaderboard</h2>
          <span className="rounded px-2 py-0.5 text-[10px] font-mono font-semibold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Live</span>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-emerald-800/40">
          <table className="w-full text-sm">
            <thead className="bg-emerald-950/30">
              <tr>
                <th className="px-4 py-2 text-left text-slate-300">Agent</th>
                <th className="px-4 py-2 text-left text-slate-300">Strategy</th>
                <th className="px-4 py-2 text-right text-slate-300">Portfolio</th>
                <th className="px-4 py-2 text-right text-slate-300">PnL</th>
                <th className="px-4 py-2 text-right text-slate-300">Cash</th>
                <th className="px-4 py-2 text-right text-slate-300">Positions</th>
                <th className="px-4 py-2 text-right text-slate-300">Trades</th>
              </tr>
            </thead>
            <tbody>
              {liveLeaderboard.map((s) => {
                const m = leaderboardMeta(s)
                return (
                  <tr key={s.id} className="border-t border-emerald-900/30 hover:bg-emerald-950/20 transition-colors">
                    <td className="px-4 py-2 font-medium">{m.agentName}</td>
                    <td className="px-4 py-2 text-slate-300">{s.name}</td>
                    <td className="px-4 py-2 text-right font-mono">${s.equity.toFixed(2)}</td>
                    <td className={`px-4 py-2 text-right font-mono ${s.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{s.pnl >= 0 ? '+' : ''}${s.pnl.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right font-mono">${m.cash.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">{m.positions}</td>
                    <td className="px-4 py-2 text-right">{m.tradeCount}</td>
                  </tr>
                )
              })}
              {liveLeaderboard.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={7}>
                    No live strategies yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Paper Trading Leaderboard */}
      <section>
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold">Paper Trading Leaderboard</h2>
          <span className="rounded px-2 py-0.5 text-[10px] font-mono font-semibold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">Paper</span>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-amber-800/40">
          <table className="w-full text-sm">
            <thead className="bg-amber-950/30">
              <tr>
                <th className="px-4 py-2 text-left text-slate-300">Agent</th>
                <th className="px-4 py-2 text-left text-slate-300">Strategy</th>
                <th className="px-4 py-2 text-right text-slate-300">Portfolio</th>
                <th className="px-4 py-2 text-right text-slate-300">PnL</th>
                <th className="px-4 py-2 text-right text-slate-300">Cash</th>
                <th className="px-4 py-2 text-right text-slate-300">Positions</th>
                <th className="px-4 py-2 text-right text-slate-300">Trades</th>
              </tr>
            </thead>
            <tbody>
              {paperLeaderboard.map((s) => {
                const m = leaderboardMeta(s)
                return (
                  <tr key={s.id} className="border-t border-amber-900/30 hover:bg-amber-950/20 transition-colors">
                    <td className="px-4 py-2 font-medium">{m.agentName}</td>
                    <td className="px-4 py-2 text-slate-300">{s.name}</td>
                    <td className="px-4 py-2 text-right font-mono">${s.equity.toFixed(2)}</td>
                    <td className={`px-4 py-2 text-right font-mono ${s.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{s.pnl >= 0 ? '+' : ''}${s.pnl.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right font-mono">${m.cash.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">{m.positions}</td>
                    <td className="px-4 py-2 text-right">{m.tradeCount}</td>
                  </tr>
                )
              })}
              {paperLeaderboard.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={7}>
                    No paper strategies yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Execution Agents</h2>
        <div className="mt-4 space-y-4">
          {executionAgents.map((agent) => {
            const assignedStrategies = [...(strategyByAgent[agent.id] || [])]
            const primaryStrategy = primaryStrategyByAgent[agent.id]
            if (primaryStrategy && !assignedStrategies.some((s) => s.id === primaryStrategy.id)) {
              assignedStrategies.unshift(primaryStrategy)
            }
            const hb = latestHeartbeatMap[agent.id]
            return (
              <div key={agent.id} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-emerald-400">Execution Agent</p>
                    <h3 className="text-2xl font-semibold">{agent.name}</h3>
                    <p className="text-sm text-slate-400 mt-1">{descriptionMap[agent.name] || 'Agent running.'}</p>
                  </div>
                  <div className="text-right text-xs text-slate-500 shrink-0">
                    <div>Last heartbeat</div>
                    <div className="flex items-center justify-end gap-2 mt-0.5">
                      {hb && <span className={`h-2 w-2 rounded-full ${statusColor(hb.status || '')}`} />}
                      <span className="text-sm text-slate-300">{hb ? formatTs(hb.created_at) : 'No heartbeat yet'}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {assignedStrategies.length > 0 ? (
                    assignedStrategies.map((strategy) => {
                      const sMode = strategy.trading_mode ?? 'paper'
                      const isLive = sMode === 'live'
                      return (
                        <Link
                          key={strategy.id}
                          href={`/strategy/${strategy.id}`}
                          prefetch={false}
                          className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition hover:bg-slate-800/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${
                            isLive
                              ? 'border-emerald-700/50 bg-slate-950/60'
                              : 'border-slate-800 bg-slate-950/60'
                          }`}
                          aria-label={`Open strategy ${strategy.name}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-white/90">{strategy.name}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase ${
                              isLive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                            }`}>
                              {sMode}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-slate-400 text-xs font-mono">
                            <span className={strategy.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>PnL {strategy.pnl >= 0 ? '+' : ''}{strategy.pnl.toFixed(2)}</span>
                            <span>Eq ${strategy.equity.toFixed(2)}</span>
                            <span className="text-slate-500">&rarr;</span>
                          </div>
                        </Link>
                      )
                    })
                  ) : (
                    <p className="text-sm text-slate-500">No strategies assigned.</p>
                  )}
                </div>
              </div>
            )
          })}
          {executionAgents.length === 0 && <p className="text-slate-400">No agents registered yet.</p>}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Utility Agents</h2>
        <div className="mt-4 space-y-4">
          {/* Fin Research Agent */}
          {finAgent && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-emerald-400">Research Agent</p>
                  <h3 className="text-2xl font-semibold">Fin</h3>
                  <p className="text-sm text-slate-400 mt-1">Analyzes whale wallets and PolyVision data to suggest new strategies.</p>
                </div>
                <div className="text-right text-xs text-slate-500 shrink-0">
                  <div>Last insight</div>
                  <div className="flex items-center justify-end gap-2 mt-0.5">
                    {finHeartbeat && <span className={`h-2 w-2 rounded-full ${statusColor(finHeartbeat.status || '')}`} />}
                    <span className="text-sm text-slate-300">{finLastUpdated || 'No heartbeat yet'}</span>
                  </div>
                </div>
              </div>
              {parsedFinInsight ? (
                <div className="mt-4 grid gap-6 md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Top wallets</p>
                    <div className="mt-2 space-y-2 text-sm text-slate-200">
                      {parsedFinInsight.wallets.slice(0, 4).map((line, idx) => (
                        <p key={idx} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">{line}</p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Hot bets</p>
                    <div className="mt-2 space-y-2 text-sm text-slate-200">
                      {parsedFinInsight.bets.slice(0, 4).map((line, idx) => (
                        <p key={idx} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">{line}</p>
                      ))}
                      {parsedFinInsight.bets.length === 0 && <p className="text-xs text-slate-500">No hot bets flagged.</p>}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">{"Fin hasn't published an insight yet."}</p>
              )}
            </div>
          )}

          {/* Copy Trader Agent */}
          {copyTraderStrategy && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-emerald-400">Copy Trader</p>
                  <h3 className="text-2xl font-semibold">{copyTraderStrategy.name}</h3>
                  <p className="text-sm text-slate-400 mt-1">Mirrors prioritized whale wallets across all Polymarket categories.</p>
                </div>
                <div className="text-right text-xs text-slate-500 shrink-0">
                  <div>Last signal</div>
                  <div className="text-sm text-slate-300 mt-0.5">{copyTraderLastSignal ? formatTs(copyTraderLastSignal.created_at) : 'No signals yet'}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-xs uppercase text-slate-500">Equity</div>
                  <div className="text-lg font-semibold">${copyTraderStrategy.equity.toFixed(2)}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-xs uppercase text-slate-500">PnL</div>
                  <div className={`text-lg font-semibold ${copyTraderStrategy.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{copyTraderStrategy.pnl >= 0 ? '+' : ''}${copyTraderStrategy.pnl.toFixed(2)}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-xs uppercase text-slate-500">Trades</div>
                  <div className="text-lg font-semibold">{copyTraderTrades.length}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-xs uppercase text-slate-500">Win rate</div>
                  <div className="text-lg font-semibold">{copyTraderWinRate.toFixed(1)}%</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-xs uppercase text-slate-500">Markets</div>
                  <div className="text-lg font-semibold">{copyTraderUniqueMarkets}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-xs uppercase text-slate-500">Avg size</div>
                  <div className="text-lg font-semibold">${copyTraderAvgNotional.toFixed(2)}</div>
                </div>
              </div>

              <div className="mt-4 grid gap-6 md:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-base font-semibold">Latest Whale Signals</h4>
                    <span className="text-xs text-slate-500">{copyTraderRecentSignals.length ? 'Live feed' : 'Waiting'}</span>
                  </div>
                  <div className="mt-3 space-y-3 max-h-[228px] overflow-y-auto pr-1">
                    {copyTraderRecentSignals.map((signal) => (
                      <div key={signal.id} className="rounded-lg border border-slate-800/70 bg-slate-900/70 p-3">
                        <p className="text-sm text-slate-100">{signal.message ?? 'Copy-trade signal'}</p>
                        <p className="text-xs text-slate-500 mt-1">{formatTs(signal.created_at)}</p>
                      </div>
                    ))}
                    {copyTraderRecentSignals.length === 0 && <div className="text-sm text-slate-500">No whale alerts logged yet.</div>}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4" id="copy-trader-trades">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-base font-semibold">Recent Copied Trades</h4>
                    <span className="text-xs text-slate-500">{copyTraderTrades.length} total</span>
                  </div>
                  {copyTraderTrades.length > 0 ? (
                    <div className="mt-3 max-h-[228px] overflow-y-auto pr-1">
                      <CopyTraderTradesTable trades={copyTraderTrades} />
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-slate-500">No copy-trade executions yet.</div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={`/strategy/${copyTraderStrategy.id}`} prefetch={false} className="rounded-full bg-emerald-500/20 px-4 py-2 text-sm text-emerald-100 hover:bg-emerald-500/30 transition">
                  Open strategy detail
                </Link>
                <Link href="#copy-trader-trades" className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:text-white transition">
                  Jump to trades
                </Link>
                <CopyTraderWatchlist wallets={copyTraderWatchlist} />
              </div>
            </div>
          )}

          {utilityAgents.length === 0 && !finAgent && !copyTraderStrategy && (
            <p className="text-slate-400">No utility agents registered yet.</p>
          )}
        </div>
      </section>

      <section id="events">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Recent Events</h1>
          <Link href="/events" className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
            View all events &rarr;
          </Link>
        </div>
        <div className="mt-4 rounded-lg border border-slate-800 overflow-hidden">
          <div className="max-h-[324px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 text-left">Agent</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Severity</th>
                  <th className="px-4 py-2 text-left">Message</th>
                  <th className="px-4 py-2 text-left">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((event) => (
                  <tr key={event.id} className="border-t border-slate-800">
                    <td className="px-4 py-2">{(event.agent_id && agentNameMap[event.agent_id]) || event.agent_id || 'System'}</td>
                    <td className="px-4 py-2">{event.event_type}</td>
                    <td className="px-4 py-2">{event.severity}</td>
                    <td className="px-4 py-2 max-w-[400px] truncate" title={event.message ?? undefined}>{event.message}</td>
                    <td className="px-4 py-2">{formatTs(event.created_at)}</td>
                  </tr>
                ))}
                {recentEvents.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-slate-400" colSpan={5}>
                      No events recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Recent Trades</h1>
          <Link href="/trades" className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
            View all trades &rarr;
          </Link>
        </div>
        <div className="mt-4 rounded-lg border border-slate-800 overflow-hidden">
          <div className="max-h-[324px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 text-left">Strategy</th>
                  <th className="px-4 py-2 text-left">Market</th>
                  <th className="px-4 py-2 text-left">Side</th>
                  <th className="px-4 py-2 text-left">Mode</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Notional</th>
                  <th className="px-4 py-2 text-left">Resolves</th>
                  <th className="px-4 py-2 text-left">Resolved</th>
                  <th className="px-4 py-2 text-left">Timestamp</th>
                </tr>
              </thead>
              <tbody>
              {recentTrades.map((trade) => (
                <tr key={trade.id} className={`border-t border-slate-800 ${trade.status === 'failed' ? 'bg-red-950/20' : ''}`}>
                  <td className="px-4 py-2">{strategyMap[trade.strategy_id]?.name || trade.strategy_id}</td>
                  <td className="px-4 py-2 max-w-[200px] truncate" title={trade.market}>{trade.market}</td>
                  <td className="px-4 py-2">{trade.side}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase ${
                      trade.trading_mode === 'live' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {trade.trading_mode ?? 'paper'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {trade.status === 'failed' ? (
                      <span className="group relative cursor-help rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase text-red-400">
                        FAILED
                        {trade.error && (
                          <span className="absolute bottom-full left-0 z-10 mb-1 hidden w-64 rounded bg-slate-800 px-3 py-2 text-xs font-normal normal-case text-slate-200 shadow-lg group-hover:block">
                            {trade.error}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase text-emerald-400">
                        {trade.status ?? 'filled'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">${Number(trade.notional || 0).toFixed(2)}</td>
                  <td className="px-4 py-2">{formatDate(trade.closes_at)}</td>
                  <td className="px-4 py-2">{indicator(trade)}</td>
                  <td className="px-4 py-2">{formatTs(trade.executed_at)}</td>
                </tr>
              ))}
              {recentTrades.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-400" colSpan={9}>
                    No trades recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}
