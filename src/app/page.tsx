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

const formatTs = (ts?: string | null) => (ts ? new Date(ts).toLocaleString('en-US', { timeZone: 'America/New_York' }) : '--')
const formatDate = (ts?: string | null) => (ts ? new Date(ts).toLocaleDateString('en-US', { timeZone: 'America/New_York' }) : '--')

const resolutionColor = (trade: Trade, nowTs: number) => {
  if (trade.is_resolved) {
    return trade.side === 'YES' ? 'bg-positive' : 'bg-negative'
  }
  if (trade.closes_at && new Date(trade.closes_at).getTime() < nowTs) {
    return 'bg-warning'
  }
  return 'bg-border-accent'
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
    .split('\u2022')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const bets = betsSegment
    .split('\u2022')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return { heading, wallets, bets }
}

const statusColor = (status: string) => {
  const s = (status || '').toLowerCase()
  if (s.includes('ok') || s.includes('alive') || s.includes('up')) return 'bg-positive'
  if (s.includes('warn')) return 'bg-warning'
  if (s.includes('err') || s.includes('down')) return 'bg-negative'
  return 'bg-border-accent'
}

/* ------------------------------------------------------------------ */

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
    'CopyTrader-Agent': '/avatars/copy-trader.jpg',
  }

  const descriptionMap: Record<string, string> = {
    'BondLadder-Agent': 'Harvests high-certainty markets for steady yield.',
    'AIContrarian-Agent': 'Fades crowd consensus using AI divergence signals.',
    Audi: 'Audits strategy drawdowns and auto-tunes parameters.',
  }

  const strategyStats: StrategyStats[] = strategies.map((strategy) => {
    const strategyTrades = trades.filter((trade) => trade.strategy_id === strategy.id)
    const pnl = strategyTrades.reduce((acc, trade) => acc + (Number(trade.pnl) || 0), 0)
    const notional = strategyTrades.reduce((acc, trade) => acc + (Number(trade.notional) || 0), 0)
    const tradeCount = strategyTrades.length
    const base = Number(strategy.paper_capital ?? 1000)
    const equity = base + pnl
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
    const sTrades = trades.filter((trade) => trade.strategy_id === agent.strategy_id)
    const notional = sTrades.reduce((acc, trade) => acc + (Number(trade.notional) || 0), 0)
    const cash = Math.max((strat?.base ?? 1000) - notional + (strat?.pnl ?? 0), 0)
    const positions = new Set(sTrades.map((trade) => trade.market)).size
    return {
      ...agent,
      portfolio: strat?.equity ?? 0,
      pnl: strat?.pnl ?? 0,
      cash,
      positions,
      trades: sTrades.length,
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

  const copyTraderStrategy = strategyStats.find((s) => {
    const n = s.name.toLowerCase().replace(/[-_]/g, ' ')
    return n.includes('copy trader') || n.includes('copytrader') || n.includes('whale mirror')
  }) ?? null

  const copyTraderAgent = agents.find((a) => {
    if (copyTraderStrategy?.agent_id && a.id === copyTraderStrategy.agent_id) return true
    const n = a.name.toLowerCase()
    return n === 'cot' || (n.includes('copy') && n.includes('trader'))
  }) ?? null

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
    { address: '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee', label: 'Pilot wallet A', winRate: 60, copyScore: 7, tier: 'yellow', lastTrade: null, sourceUrl: 'https://polymarketscan.com/wallet/0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee', notes: 'Initial pilot wallet (manual seed)' },
    { address: '0x63ce342161250d705dc0b16df89036c8e5f9ba9a', label: 'Pilot wallet B', winRate: 60, copyScore: 7, tier: 'yellow', lastTrade: null, sourceUrl: 'https://polymarketscan.com/wallet/0x63ce342161250d705dc0b16df89036c8e5f9ba9a', notes: 'Initial pilot wallet (manual seed)' },
    { address: '0xdfe3fedc5c7679be42c3d393e99d4b55247b73c4', label: 'cqs', winRate: 67.77, copyScore: 10, tier: 'green', lastTrade: '2026-02-19', sourceUrl: 'https://polyvisionx.com/wallet/0xdfe3fedc5c7679be42c3d393e99d4b55247b73c4', notes: 'Leaderboard #1' },
    { address: '0xd1ecfa3e7d221851663f739626dcd15fca565d8e', label: 'Scott8153', winRate: 84.51, copyScore: 10, tier: 'green', lastTrade: '2026-02-03', sourceUrl: 'https://polyvisionx.com/wallet/0xd1ecfa3e7d221851663f739626dcd15fca565d8e', notes: 'High win rate politics focus' },
    { address: '0x5739ddf8672627ce076eff5f444610a250075f1a', label: 'hopedieslast', winRate: 69.51, copyScore: 10, tier: 'green', lastTrade: '2026-02-20', sourceUrl: 'https://polyvisionx.com/wallet/0x5739ddf8672627ce076eff5f444610a250075f1a', notes: 'Balanced exposure' },
    { address: '0x7f3c8979d0afa00007bae4747d5347122af05613', label: 'LucasMeow', winRate: 95.16, copyScore: 10, tier: 'green', lastTrade: '2026-02-09', sourceUrl: 'https://polyvisionx.com/wallet/0x7f3c8979d0afa00007bae4747d5347122af05613', notes: 'Crypto-heavy specialist' },
    { address: '0x4dfd481c16d9995b809780fd8a9808e8689f6e4a', label: 'Magamyman', winRate: 66.67, copyScore: 10, tier: 'green', lastTrade: '2026-02-18', sourceUrl: 'https://polyvisionx.com/wallet/0x4dfd481c16d9995b809780fd8a9808e8689f6e4a', notes: 'Diversified exposure' },
    { address: '0xe52c0a1327a12edc7bd54ea6f37ce00a4ca96924', label: 'aff3', winRate: 78.03, copyScore: 10, tier: 'green', lastTrade: '2026-02-16', sourceUrl: 'https://polyvisionx.com/wallet/0xe52c0a1327a12edc7bd54ea6f37ce00a4ca96924', notes: 'Steady risk profile' },
    { address: '0x0b219cf3d297991b58361dbebdbaa91e56b8deb6', label: 'TerreMoto', winRate: 83.7, copyScore: 10, tier: 'green', lastTrade: '2026-02-19', sourceUrl: 'https://polyvisionx.com/wallet/0x0b219cf3d297991b58361dbebdbaa91e56b8deb6', notes: 'High confidence signals' },
    { address: '0x85d575c99b977e9e39543747c859c83b727aaece', label: 'warlasfutpro', winRate: 79.57, copyScore: 10, tier: 'green', lastTrade: '2026-02-19', sourceUrl: 'https://polyvisionx.com/wallet/0x85d575c99b977e9e39543747c859c83b727aaece', notes: 'Politics heavy mix' },
    { address: '0xf5fe759cece500f58a431ef8dacea321f6e3e23d', label: 'Stavenson', winRate: 89.16, copyScore: 10, tier: 'green', lastTrade: '2026-02-19', sourceUrl: 'https://polyvisionx.com/wallet/0xf5fe759cece500f58a431ef8dacea321f6e3e23d', notes: 'Ultra-consistent' },
    { address: '0x9c667a1d1c1337c6dca9d93241d386e4ed346b66', label: 'InfiniteCrypt0', winRate: 71.15, copyScore: 10, tier: 'green', lastTrade: '2026-02-19', sourceUrl: 'https://polyvisionx.com/wallet/0x9c667a1d1c1337c6dca9d93241d386e4ed346b66', notes: 'Fast trading cadence' },
  ]

  const totalPnl = strategyStats.reduce((acc, s) => acc + s.pnl, 0)
  const totalEquity = strategyStats.reduce((acc, s) => acc + s.equity, 0)

  const indicator = (trade: Trade) => (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${resolutionColor(trade, now)}`}
      title={resolutionTitle(trade, now)}
    />
  )

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-accent/20 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Polymarket Agents</h1>
          </div>
          <Link href="/settings" className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition hover:border-border-accent hover:text-foreground">
            Settings
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-10">

        {/* ── KPI Strip ────────────────────────────────── */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Agents', value: String(agentRows.length), sub: `${executionAgents.length} execution` },
            { label: 'Total Equity', value: `$${totalEquity.toFixed(2)}`, sub: totalPnl >= 0 ? `+$${totalPnl.toFixed(2)} PnL` : `-$${Math.abs(totalPnl).toFixed(2)} PnL`, positive: totalPnl >= 0 },
            { label: 'Trades', value: String(trades.length), sub: `${totalPositions} markets` },
            { label: 'Strategies', value: String(strategies.length), sub: `${executionAgents.length} agents active` },
          ].map((kpi) => (
            <div key={kpi.label} className="group rounded-xl border border-border bg-card p-5 transition hover:border-border-accent hover:bg-card-hover">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{kpi.value}</p>
              <p className={`mt-1 text-xs ${kpi.positive === false ? 'text-negative' : kpi.positive ? 'text-positive' : 'text-muted-foreground'}`}>{kpi.sub}</p>
            </div>
          ))}
        </section>

        {/* ── Agent Leaderboard ────────────────────────── */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Agent Leaderboard</h2>
            <span className="text-xs text-muted-foreground">{leaderboardRows.length} agents</span>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Agent</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Portfolio</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">PnL</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Cash</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Positions</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Trades</th>
                </tr>
              </thead>
              <tbody>
                {leaderboardRows.map((agent, i) => (
                  <tr key={agent.id} className="table-row-hover border-b border-border/50 last:border-0 transition">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">{i + 1}</div>
                        <span className="font-medium text-foreground">{agent.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-sm text-foreground">${agent.portfolio.toFixed(2)}</td>
                    <td className={`px-5 py-3.5 text-right font-mono text-sm ${agent.pnl >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {agent.pnl >= 0 ? '+' : ''}{agent.pnl.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-sm text-muted-foreground">${agent.cash.toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-right text-muted-foreground">{agent.positions}</td>
                    <td className="px-5 py-3.5 text-right text-muted-foreground">{agent.trades}</td>
                  </tr>
                ))}
                {leaderboardRows.length === 0 && (
                  <tr><td className="px-5 py-8 text-center text-muted-foreground" colSpan={6}>No agents found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Execution Agents Grid ────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold tracking-tight">Execution Agents</h2>
          <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {executionAgents.map((agent, idx) => {
              const assignedStrategies = [...(strategyByAgent[agent.id] || [])]
              const primaryStrategy = primaryStrategyByAgent[agent.id]
              if (primaryStrategy && !assignedStrategies.some((strategy) => strategy.id === primaryStrategy.id)) {
                assignedStrategies.unshift(primaryStrategy)
              }
              const hb = latestHeartbeatMap[agent.id]
              return (
                <div key={agent.id} className="group flex flex-col rounded-xl border border-border bg-card transition hover:border-border-accent hover:bg-card-hover">
                  {/* Agent Header */}
                  <div className="flex items-center gap-4 p-5 pb-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border">
                      <Image
                        src={avatarMap[agent.name] || '/avatars/bond-ladder.jpg'}
                        alt={agent.name}
                        width={56}
                        height={56}
                        className="h-full w-full object-cover"
                        priority={idx === 0}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-foreground truncate">{agent.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{descriptionMap[agent.name] || 'Agent running.'}</p>
                    </div>
                  </div>

                  {/* Strategies */}
                  <div className="flex-1 px-5 pb-2 space-y-1.5">
                    {assignedStrategies.length > 0 ? (
                      assignedStrategies.map((strategy) => (
                        <Link
                          key={strategy.id}
                          href={`/strategy/${strategy.id}`}
                          prefetch={false}
                          className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 px-3.5 py-2.5 text-xs transition hover:border-accent/30 hover:bg-accent-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          aria-label={`Open strategy ${strategy.name}`}
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-foreground truncate">{strategy.name}</div>
                            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">View details</div>
                          </div>
                          <div className="shrink-0 text-right font-mono">
                            <div className={`text-xs ${strategy.pnl >= 0 ? 'text-positive' : 'text-negative'}`}>
                              {strategy.pnl >= 0 ? '+' : ''}{strategy.pnl.toFixed(2)}
                            </div>
                            <div className="text-[10px] text-muted-foreground">${strategy.equity.toFixed(0)}</div>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">No strategies assigned</div>
                    )}
                  </div>

                  {/* Heartbeat */}
                  <div className="flex items-center gap-2 border-t border-border/50 px-5 py-3 text-xs text-muted-foreground">
                    {hb ? (
                      <>
                        <span className={`h-2 w-2 rounded-full ${statusColor(hb.status || '')}`} />
                        <span>{formatTs(hb.created_at)}</span>
                      </>
                    ) : (
                      <span>No heartbeat yet</span>
                    )}
                  </div>
                </div>
              )
            })}
            {executionAgents.length === 0 && <div className="text-muted-foreground">No agents registered yet.</div>}
          </div>
        </section>

        {/* ── Fin Research Agent ───────────────────────── */}
        {finAgent && (
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex flex-col gap-4 p-6 md:flex-row md:items-start md:justify-between">
              <div className="flex items-center gap-4">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-border">
                  <Image src="/avatars/fin.jpg" alt="Fin" width={48} height={48} className="h-full w-full object-cover" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-accent">Research Agent</p>
                  <h2 className="text-lg font-semibold text-foreground">Fin</h2>
                  <p className="text-xs text-muted-foreground">Analyzes whale wallets and PolyVision data to suggest new strategies.</p>
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div className="uppercase tracking-wider">Last insight</div>
                <div className="mt-1 font-mono text-sm text-foreground">{finLastUpdated || '--'}</div>
              </div>
            </div>
            {parsedFinInsight ? (
              <div className="grid gap-px bg-border md:grid-cols-2">
                <div className="bg-card p-6">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Top wallets</p>
                  <div className="mt-3 space-y-2">
                    {parsedFinInsight.wallets.slice(0, 4).map((line, i) => (
                      <p key={i} className="rounded-lg bg-background/60 p-3 text-sm text-foreground leading-relaxed">{line}</p>
                    ))}
                  </div>
                </div>
                <div className="bg-card p-6">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Hot bets</p>
                  <div className="mt-3 space-y-2">
                    {parsedFinInsight.bets.slice(0, 4).map((line, i) => (
                      <p key={i} className="rounded-lg bg-background/60 p-3 text-sm text-foreground leading-relaxed">{line}</p>
                    ))}
                    {parsedFinInsight.bets.length === 0 && <p className="text-xs text-muted-foreground">No hot bets flagged.</p>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="border-t border-border px-6 py-8 text-center text-sm text-muted-foreground">{"Fin hasn't published an insight yet."}</div>
            )}
          </section>
        )}

        {/* ── Copy Trader Section ──────────────────────── */}
        {copyTraderStrategy && (
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Header */}
            <div className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-border">
                  <Image src="/avatars/copy-trader.jpg" alt="Copy Trader" width={48} height={48} className="h-full w-full object-cover" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-warning">Copy Trader</p>
                  <h2 className="text-lg font-semibold text-foreground">{copyTraderStrategy.name}</h2>
                  <p className="text-xs text-muted-foreground">Mirrors prioritized whale wallets inside crypto markets.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/strategy/${copyTraderStrategy.id}`} prefetch={false} className="rounded-lg bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/20">
                  Strategy detail
                </Link>
                <CopyTraderWatchlist wallets={copyTraderWatchlist} />
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: 'Equity', value: `$${copyTraderStrategy.equity.toFixed(2)}` },
                { label: 'PnL', value: `$${copyTraderStrategy.pnl.toFixed(2)}`, color: copyTraderStrategy.pnl >= 0 ? 'text-positive' : 'text-negative' },
                { label: 'Trades', value: String(copyTraderTrades.length) },
                { label: 'Win rate', value: `${copyTraderWinRate.toFixed(1)}%` },
                { label: 'Markets', value: String(copyTraderUniqueMarkets) },
                { label: 'Avg size', value: `$${copyTraderAvgNotional.toFixed(2)}` },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-card p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{kpi.label}</div>
                  <div className={`mt-1 font-mono text-lg font-semibold ${kpi.color || 'text-foreground'}`}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {/* Signals + Trades */}
            <div className="grid gap-px bg-border md:grid-cols-2">
              <div className="bg-card p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Latest Whale Signals</h3>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">{copyTraderRecentSignals.length ? 'Live' : 'Waiting'}</span>
                </div>
                <div className="mt-4 space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {copyTraderRecentSignals.map((signal) => (
                    <div key={signal.id} className="rounded-lg bg-background/60 p-3">
                      <p className="text-sm text-foreground leading-relaxed">{signal.message ?? 'Copy-trade signal'}</p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">{formatTs(signal.created_at)}</p>
                    </div>
                  ))}
                  {copyTraderRecentSignals.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">No whale alerts logged yet.</div>}
                </div>
              </div>
              <div className="bg-card p-6" id="copy-trader-trades">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Recent Copied Trades</h3>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">{copyTraderTrades.length} total</span>
                </div>
                {copyTraderTrades.length > 0 ? (
                  <div className="mt-4"><CopyTraderTradesTable trades={copyTraderTrades} /></div>
                ) : (
                  <div className="mt-4 py-6 text-center text-sm text-muted-foreground">No copy-trade executions yet.</div>
                )}
              </div>
            </div>

            <div className="border-t border-border px-6 py-3 text-xs text-muted-foreground">
              Last signal: <span className="font-mono text-foreground">{copyTraderLastSignal ? formatTs(copyTraderLastSignal.created_at) : '--'}</span>
            </div>
          </section>
        )}

        {/* ── Recent Events ────────────────────────────── */}
        <section id="events">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Recent Events</h2>
            <span className="text-xs text-muted-foreground">{events.length} events</span>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Agent</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Severity</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Message</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="table-row-hover border-b border-border/50 last:border-0 transition">
                    <td className="px-5 py-3 font-medium text-foreground">{(event.agent_id && agentNameMap[event.agent_id]) || event.agent_id || 'System'}</td>
                    <td className="px-5 py-3"><span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">{event.event_type}</span></td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                        event.severity === 'error' ? 'bg-negative/10 text-negative' :
                        event.severity === 'warning' ? 'bg-warning/10 text-warning' :
                        'bg-muted text-muted-foreground'
                      }`}>{event.severity}</span>
                    </td>
                    <td className="max-w-xs truncate px-5 py-3 text-muted-foreground">{event.message}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{formatTs(event.created_at)}</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr><td className="px-5 py-8 text-center text-muted-foreground" colSpan={5}>No events recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Recent Trades ────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Recent Trades</h2>
            <span className="text-xs text-muted-foreground">{trades.length} total</span>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Strategy</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Market</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Side</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Notional</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Resolves</th>
                  <th className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Executed</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((trade) => (
                  <tr key={trade.id} className="table-row-hover border-b border-border/50 last:border-0 transition">
                    <td className="px-5 py-3 font-medium text-foreground">{strategyMap[trade.strategy_id]?.name || trade.strategy_id}</td>
                    <td className="max-w-[200px] truncate px-5 py-3 text-muted-foreground">{trade.market}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                        trade.side === 'YES' ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'
                      }`}>{trade.side}</span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-foreground">${Number(trade.notional || 0).toFixed(2)}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{formatDate(trade.closes_at)}</td>
                    <td className="px-5 py-3 text-center">{indicator(trade)}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{formatTs(trade.executed_at)}</td>
                  </tr>
                ))}
                {recentTrades.length === 0 && (
                  <tr><td className="px-5 py-8 text-center text-muted-foreground" colSpan={7}>No trades recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
