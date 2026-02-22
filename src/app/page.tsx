import Image from 'next/image'
import Link from 'next/link'

import CopyTraderTradesTable from '@/app/components/CopyTraderTradesTable'
import CopyTraderWatchlist from '@/app/components/CopyTraderWatchlist'

import { supabase } from '@/lib/supabaseClient'
import type { Agent, AgentEvent, AgentHeartbeat, AgentRow, CopyTraderWallet, Strategy, StrategyStats, Trade } from '@/types/dashboard'

export const dynamic = 'force-dynamic'

interface SummaryData {
  strategies: Strategy[]
  agents: Agent[]
  trades: Trade[]
  events: AgentEvent[]
  heartbeats: AgentHeartbeat[]
  copySignals: AgentEvent[]
}

async function fetchSummary(): Promise<SummaryData> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { strategies: [], agents: [], trades: [], events: [], heartbeats: [], copySignals: [] }
  }

  const [strategiesRes, agentsRes, tradesRes, eventsRes, heartbeatsRes, copySignalsRes] = await Promise.all([
    supabase.from('strategies').select('*').limit(10),
    supabase.from('agents').select('*').limit(10),
    supabase.from('trades').select('*').order('executed_at', { ascending: false }).limit(500),
    supabase.from('events').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('agent_heartbeats').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('events').select('*').like('event_type', 'copy_trader%').order('created_at', { ascending: false }).limit(20),
  ])

  return {
    strategies: (strategiesRes.data ?? []) as Strategy[],
    agents: (agentsRes.data ?? []) as Agent[],
    trades: (tradesRes.data ?? []) as Trade[],
    events: (eventsRes.data ?? []) as AgentEvent[],
    heartbeats: (heartbeatsRes.data ?? []) as AgentHeartbeat[],
    copySignals: (copySignalsRes.data ?? []) as AgentEvent[],
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
  const { strategies, agents, trades, events, heartbeats, copySignals } = await fetchSummary()
  const now = new Date().getTime()

  const executionAgents = agents.filter((agent) => (agent.agent_type ?? 'execution') === 'execution')

  const latestHeartbeatMap = heartbeats.reduce<Record<string, AgentHeartbeat>>((acc, hb) => {
    if (!hb?.agent_id || acc[hb.agent_id]) return acc
    acc[hb.agent_id] = hb
    return acc
  }, {})

  const avatarMap: Record<string, string> = {
    'BondLadder-Agent': '/avatars/bond-ladder.jpg',
    'AIContrarian-Agent': '/avatars/ai-contrarian.jpg',
    Audi: '/avatars/audi.jpg',
    Fin: '/avatars/fin.jpg',
    'Fin-Agent': '/avatars/fin.jpg',
    'CopyTrader-Agent': '/avatars/copy-trader.jpg',
    Cot: '/avatars/copy-trader.jpg',
  }

  const descriptionMap: Record<string, string> = {
    'BondLadder-Agent': 'Harvests high-certainty markets for steady yield.',
    'AIContrarian-Agent': 'Fades crowd consensus using AI divergence signals.',
    Audi: 'Audits strategy drawdowns and auto-tunes parameters.',
  }

  const strategyStats: StrategyStats[] = strategies.map((strategy) => {
    const isLive = strategy.trading_mode === 'live'
    const strategyTrades = trades.filter((trade) => trade.strategy_id === strategy.id)
    const notional = strategyTrades.reduce((acc, trade) => acc + (Number(trade.notional) || 0), 0)
    const tradeCount = strategyTrades.length

    // For live strategies, use the reset portfolio values from the DB
    // For paper strategies, compute from historical trades as before
    const paperPnl = strategyTrades.reduce((acc, trade) => acc + (Number(trade.pnl) || 0), 0)
    const base = Number(strategy.paper_capital ?? strategy.capital_allocation ?? 1000)

    const pnl = isLive ? Number(strategy.paper_pnl ?? 0) : paperPnl
    const equity = isLive
      ? Number(strategy.paper_cash ?? base) + Number(strategy.paper_pnl ?? 0)
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
  const totalPositions = new Set(trades.map((trade) => trade.market)).size
  const recentTrades = trades.slice(0, 20)

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

  const copyTraderTrades = trades.filter((t) => copyTraderStrategyIds.has(t.strategy_id))

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
  ]
  const copyTraderRecentSignals = copyTraderSignals.slice(0, 5)
  const copyTraderLastSignal = copyTraderSignals[0] ?? null


  const copyTraderWatchlist: CopyTraderWallet[] = [
    {
      address: '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee',
      label: 'Pilot wallet A',
      winRate: 60,
      copyScore: 7,
      tier: 'yellow',
      lastTrade: null,
      sourceUrl: 'https://polymarketscan.com/wallet/0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee',
      notes: 'Initial pilot wallet (manual seed)',
    },
    {
      address: '0x63ce342161250d705dc0b16df89036c8e5f9ba9a',
      label: 'Pilot wallet B',
      winRate: 60,
      copyScore: 7,
      tier: 'yellow',
      lastTrade: null,
      sourceUrl: 'https://polymarketscan.com/wallet/0x63ce342161250d705dc0b16df89036c8e5f9ba9a',
      notes: 'Initial pilot wallet (manual seed)',
    },
    {
      address: '0xdfe3fedc5c7679be42c3d393e99d4b55247b73c4',
      label: 'cqs',
      winRate: 67.77,
      copyScore: 10,
      tier: 'green',
      lastTrade: '2026-02-19',
      sourceUrl: 'https://polyvisionx.com/wallet/0xdfe3fedc5c7679be42c3d393e99d4b55247b73c4',
      notes: 'Leaderboard #1',
    },
    {
      address: '0xd1ecfa3e7d221851663f739626dcd15fca565d8e',
      label: 'Scott8153',
      winRate: 84.51,
      copyScore: 10,
      tier: 'green',
      lastTrade: '2026-02-03',
      sourceUrl: 'https://polyvisionx.com/wallet/0xd1ecfa3e7d221851663f739626dcd15fca565d8e',
      notes: 'High win rate politics focus',
    },
    {
      address: '0x5739ddf8672627ce076eff5f444610a250075f1a',
      label: 'hopedieslast',
      winRate: 69.51,
      copyScore: 10,
      tier: 'green',
      lastTrade: '2026-02-20',
      sourceUrl: 'https://polyvisionx.com/wallet/0x5739ddf8672627ce076eff5f444610a250075f1a',
      notes: 'Balanced exposure',
    },
    {
      address: '0x7f3c8979d0afa00007bae4747d5347122af05613',
      label: 'LucasMeow',
      winRate: 95.16,
      copyScore: 10,
      tier: 'green',
      lastTrade: '2026-02-09',
      sourceUrl: 'https://polyvisionx.com/wallet/0x7f3c8979d0afa00007bae4747d5347122af05613',
      notes: 'Crypto-heavy specialist',
    },
    {
      address: '0x4dfd481c16d9995b809780fd8a9808e8689f6e4a',
      label: 'Magamyman',
      winRate: 66.67,
      copyScore: 10,
      tier: 'green',
      lastTrade: '2026-02-18',
      sourceUrl: 'https://polyvisionx.com/wallet/0x4dfd481c16d9995b809780fd8a9808e8689f6e4a',
      notes: 'Diversified exposure',
    },
    {
      address: '0xe52c0a1327a12edc7bd54ea6f37ce00a4ca96924',
      label: 'aff3',
      winRate: 78.03,
      copyScore: 10,
      tier: 'green',
      lastTrade: '2026-02-16',
      sourceUrl: 'https://polyvisionx.com/wallet/0xe52c0a1327a12edc7bd54ea6f37ce00a4ca96924',
      notes: 'Steady risk profile',
    },
    {
      address: '0x0b219cf3d297991b58361dbebdbaa91e56b8deb6',
      label: 'TerreMoto',
      winRate: 83.7,
      copyScore: 10,
      tier: 'green',
      lastTrade: '2026-02-19',
      sourceUrl: 'https://polyvisionx.com/wallet/0x0b219cf3d297991b58361dbebdbaa91e56b8deb6',
      notes: 'High confidence signals',
    },
    {
      address: '0x85d575c99b977e9e39543747c859c83b727aaece',
      label: 'warlasfutpro',
      winRate: 79.57,
      copyScore: 10,
      tier: 'green',
      lastTrade: '2026-02-19',
      sourceUrl: 'https://polyvisionx.com/wallet/0x85d575c99b977e9e39543747c859c83b727aaece',
      notes: 'Politics heavy mix',
    },
    {
      address: '0xf5fe759cece500f58a431ef8dacea321f6e3e23d',
      label: 'Stavenson',
      winRate: 89.16,
      copyScore: 10,
      tier: 'green',
      lastTrade: '2026-02-19',
      sourceUrl: 'https://polyvisionx.com/wallet/0xf5fe759cece500f58a431ef8dacea321f6e3e23d',
      notes: 'Ultra-consistent',
    },
    {
      address: '0x9c667a1d1c1337c6dca9d93241d386e4ed346b66',
      label: 'InfiniteCrypt0',
      winRate: 71.15,
      copyScore: 10,
      tier: 'green',
      lastTrade: '2026-02-19',
      sourceUrl: 'https://polyvisionx.com/wallet/0x9c667a1d1c1337c6dca9d93241d386e4ed346b66',
      notes: 'Fast trading cadence',
    },
  ]

  const indicator = (trade: Trade) => (
    <span
      className={`inline-block h-3 w-3 rounded-full ${resolutionColor(trade, now)}`}
      title={resolutionTitle(trade, now)}
    />
  )

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

      <section>
        <h1 className="text-2xl font-semibold">Agent Leaderboard</h1>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-2 text-left">Agent</th>
                <th className="px-4 py-2 text-left">Mode</th>
                <th className="px-4 py-2 text-left">Portfolio</th>
                <th className="px-4 py-2 text-left">PnL</th>
                <th className="px-4 py-2 text-left">Cash</th>
                <th className="px-4 py-2 text-left">Positions</th>
                <th className="px-4 py-2 text-left">Trades</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardRows.map((agent) => (
                <tr key={agent.id} className="border-t border-slate-800">
                  <td className="px-4 py-2">{agent.name}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase ${
                      agent.mode === 'live' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {agent.mode}
                    </span>
                  </td>
                  <td className="px-4 py-2">${agent.portfolio.toFixed(2)}</td>
                  <td className={`px-4 py-2 ${agent.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${agent.pnl.toFixed(2)}</td>
                  <td className="px-4 py-2">${agent.cash.toFixed(2)}</td>
                  <td className="px-4 py-2">{agent.positions}</td>
                  <td className="px-4 py-2">{agent.trades}</td>
                </tr>
              ))}
              {leaderboardRows.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-400" colSpan={7}>
                    No agents found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h1 className="text-2xl font-semibold">Execution Agents</h1>
        <div className="mt-4 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {executionAgents.map((agent, idx) => {
            const assignedStrategies = [...(strategyByAgent[agent.id] || [])]
            const primaryStrategy = primaryStrategyByAgent[agent.id]
            if (primaryStrategy && !assignedStrategies.some((strategy) => strategy.id === primaryStrategy.id)) {
              assignedStrategies.unshift(primaryStrategy)
            }
            return (
              <div key={agent.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 flex flex-col items-center text-center h-[550px]">
                <div className="h-40 w-40 mb-4">
                  <Image
                    src={avatarMap[agent.name] || '/avatars/bond-ladder.jpg'}
                    alt={agent.name}
                    width={160}
                    height={160}
                    className="h-full w-full object-contain"
                    priority
                  />
                </div>
                <h3 className="text-xl font-semibold">{agent.name}</h3>
                <p className="text-sm text-slate-300 mt-3">{descriptionMap[agent.name] || 'Agent running.'}</p>
                <div className="mt-4 w-full space-y-2">
                  {assignedStrategies.length > 0 ? (
                    assignedStrategies.map((strategy) => {
                      const sMode = strategy.trading_mode ?? 'paper'
                      const isLive = sMode === 'live'
                      return (
                      <Link
                        key={strategy.id}
                        href={`/strategy/${strategy.id}`}
                        prefetch={false}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${
                          isLive
                            ? 'border-emerald-700/50 bg-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.15)] hover:border-emerald-600/60'
                            : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                        }`}
                        aria-label={`Open strategy ${strategy.name}`}
                      >
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white/90">{strategy.name}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase ${
                              isLive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                            }`}>
                              {sMode}
                            </span>
                          </div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Tap to open details</div>
                        </div>
                        <div className="text-slate-400 text-right leading-tight">
                          PnL {strategy.pnl.toFixed(2)}
                          <br />
                          Eq {strategy.equity.toFixed(2)}
                        </div>
                      </Link>
                      )
                    })
                  ) : (
                    <div className="text-xs text-slate-500">No strategies assigned</div>
                  )}
                </div>
                <div className="mt-auto flex items-center gap-2 text-xs text-slate-400">
                  {latestHeartbeatMap[agent.id] ? (
                    <>
                      <span className={`h-2 w-2 rounded-full ${statusColor(latestHeartbeatMap[agent.id].status || '')}`} />
                      <span className="text-slate-500">{formatTs(latestHeartbeatMap[agent.id].created_at)}</span>
                    </>
                  ) : (
                    <span className="text-slate-500">No heartbeat yet</span>
                  )}
                </div>
              </div>
            )
          })}
          {executionAgents.length === 0 && <div className="text-slate-400">No agents registered yet.</div>}
        </div>
      </section>

      {finAgent && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-[0_0_25px_rgba(15,118,110,0.15)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-emerald-400">Research Agent</p>
              <h2 className="text-2xl font-semibold">Fin</h2>
              <p className="text-sm text-slate-400">Analyzes whale wallets and PolyVision data to suggest new strategies.</p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>Last insight</div>
              <div className="text-sm text-slate-300">{finLastUpdated || '—'}</div>
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
            <p className="mt-4 text-sm text-slate-500">Fin hasn’t published an insight yet.</p>
          )}
        </section>
      )}

      {copyTraderStrategy && (
        <section className="rounded-2xl border border-emerald-900/40 bg-slate-900/80 p-6 shadow-[0_0_25px_rgba(16,185,129,0.05)]">
          <div className="flex flex-col gap-6 xl:flex-row">
            <div className="xl:w-1/3 space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-slate-950 p-2 overflow-hidden">
                  <Image src="/avatars/copy-trader.svg" alt="Copy Trader avatar" width={64} height={64} className="h-full w-full rounded-full object-cover" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-emerald-400">Copy Trader</p>
                  <h2 className="text-2xl font-semibold">{copyTraderStrategy.name}</h2>
                  <p className="text-slate-400 text-sm">Mirrors prioritized whale wallets inside crypto markets.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-xs uppercase text-slate-500">Equity</div>
                  <div className="text-lg font-semibold">${copyTraderStrategy.equity.toFixed(2)}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-xs uppercase text-slate-500">PnL</div>
                  <div className="text-lg font-semibold text-emerald-300">${copyTraderStrategy.pnl.toFixed(2)}</div>
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
                  <div className="text-xs uppercase text-slate-500">Markets mirrored</div>
                  <div className="text-lg font-semibold">{copyTraderUniqueMarkets}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-xs uppercase text-slate-500">Avg size</div>
                  <div className="text-lg font-semibold">${copyTraderAvgNotional.toFixed(2)}</div>
                </div>
              </div>
              <p className="text-xs text-slate-500">Last signal: {copyTraderLastSignal ? formatTs(copyTraderLastSignal.created_at) : '—'}</p>
              <div className="flex flex-wrap gap-3">
                <Link href={`/strategy/${copyTraderStrategy.id}`} prefetch={false} className="rounded-full bg-emerald-500/20 px-4 py-2 text-sm text-emerald-100 hover:bg-emerald-500/30 transition">
                  Open strategy detail
                </Link>
                <Link href="#copy-trader-trades" className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:text-white">
                  Jump to trades
                </Link>
                <CopyTraderWatchlist wallets={copyTraderWatchlist} />
              </div>
            </div>
            <div className="flex-1 grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">Latest Whale Signals</h3>
                  <span className="text-xs text-slate-500">{copyTraderRecentSignals.length ? 'Live feed' : 'Waiting'}</span>
                </div>
                <div className="mt-3 space-y-3 max-h-[280px] overflow-y-auto pr-1">
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
                  <h3 className="text-base font-semibold">Recent Copied Trades</h3>
                  <span className="text-xs text-slate-500">{copyTraderTrades.length} total</span>
                </div>
                {copyTraderTrades.length > 0 ? (
                  <div className="mt-3">
                    <CopyTraderTradesTable trades={copyTraderTrades} />
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-slate-500">No copy-trade executions yet.</div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <section id="events">
        <h1 className="text-2xl font-semibold">Recent Events</h1>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-2 text-left">Agent</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Severity</th>
                <th className="px-4 py-2 text-left">Message</th>
                <th className="px-4 py-2 text-left">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-t border-slate-800">
                  <td className="px-4 py-2">{(event.agent_id && agentNameMap[event.agent_id]) || event.agent_id || 'System'}</td>
                  <td className="px-4 py-2">{event.event_type}</td>
                  <td className="px-4 py-2">{event.severity}</td>
                  <td className="px-4 py-2">{event.message}</td>
                  <td className="px-4 py-2">{formatTs(event.created_at)}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-400" colSpan={5}>
                    No events recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h1 className="text-2xl font-semibold">Recent Trades</h1>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-2 text-left">Strategy</th>
                <th className="px-4 py-2 text-left">Market</th>
                <th className="px-4 py-2 text-left">Side</th>
                <th className="px-4 py-2 text-left">Notional</th>
                <th className="px-4 py-2 text-left">Resolves</th>
                <th className="px-4 py-2 text-left">Resolved</th>
                <th className="px-4 py-2 text-left">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {recentTrades.map((trade) => (
                <tr key={trade.id} className="border-t border-slate-800">
                  <td className="px-4 py-2">{strategyMap[trade.strategy_id]?.name || trade.strategy_id}</td>
                  <td className="px-4 py-2">{trade.market}</td>
                  <td className="px-4 py-2">{trade.side}</td>
                  <td className="px-4 py-2">${Number(trade.notional || 0).toFixed(2)}</td>
                  <td className="px-4 py-2">{formatDate(trade.closes_at)}</td>
                  <td className="px-4 py-2">{indicator(trade)}</td>
                  <td className="px-4 py-2">{formatTs(trade.executed_at)}</td>
                </tr>
              ))}
              {recentTrades.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-400" colSpan={7}>
                    No trades recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
