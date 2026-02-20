import { supabase } from '@/lib/supabaseClient'

export const dynamic = 'force-dynamic'

async function fetchSummary() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { strategies: [], agents: [], trades: [] }
  }

  const [strategies, agents, trades, events, heartbeats] = await Promise.all([
    supabase.from('strategies').select('*').limit(10),
    supabase.from('agents').select('*').limit(10),
    supabase.from('trades').select('*').order('executed_at', { ascending: false }).limit(500),
    supabase.from('events').select('*').order('created_at', { ascending: false }).limit(10),
    supabase.from('agent_heartbeats').select('*').order('created_at', { ascending: false }).limit(50),
  ])

  return {
    strategies: strategies.data ?? [],
    agents: agents.data ?? [],
    trades: trades.data ?? [],
    events: events.data ?? [],
    heartbeats: heartbeats.data ?? [],
  }
}

const avatarMap: Record<string, string> = {
  'BondLadder-Agent': '/avatars/bond-ladder.svg',
  'AIContrarian-Agent': '/avatars/ai-contrarian.png',
  'Audi': '/avatars/audi.svg',
};

const formatTs = (ts: any) => ts ? new Date(ts).toLocaleString() : '—';
const formatDate = (ts: any) => ts ? new Date(ts).toLocaleDateString() : '—';

const statusColor = (status: string) => {
  const s = (status || '').toLowerCase();
  if (s.includes('ok') || s.includes('alive') || s.includes('up')) return 'bg-emerald-500';
  if (s.includes('warn')) return 'bg-amber-500';
  if (s.includes('err') || s.includes('down')) return 'bg-rose-500';
  return 'bg-slate-500';
};

export default async function Home() {
  const { strategies = [], agents = [], trades = [], events = [], heartbeats = [] } = await fetchSummary()

  const latestHeartbeatMap = heartbeats.reduce((acc: Record<string, any>, hb: any) => {
    if (!hb?.agent_id) return acc;
    if (!acc[hb.agent_id]) acc[hb.agent_id] = hb;
    return acc;
  }, {} as Record<string, any>);

  const strategyMap = Object.fromEntries(strategies.map((s: any) => [s.id, s]));
  const agentNameMap = Object.fromEntries(agents.map((a: any) => [a.id, a.name]));
  const descriptionMap: Record<string, string> = {
    'BondLadder-Agent': 'Harvests high-certainty markets for steady yield.',
    'AIContrarian-Agent': 'Fades crowd consensus using AI divergence signals.',
    'Audi': 'Audits strategy drawdowns and auto-tunes parameters.'
  };

  const strategyStats = strategies.map((s: any) => {
    const sTrades = trades.filter((t: any) => t.strategy_id === s.id);
    const pnl = sTrades.reduce((acc: number, t: any) => acc + (Number(t.pnl) || 0), 0);
    const notional = sTrades.reduce((acc: number, t: any) => acc + (Number(t.notional) || 0), 0);
    const tradeCount = sTrades.length;
    const base = Number(s.paper_capital ?? 1000);
    const equity = base + pnl;
    return { ...s, pnl, notional, tradeCount, equity, base };
  });

  const recentTrades = trades.slice(0, 20);

  const agentRows = agents.map((agent: any) => {
    const strat = strategyStats.find((s: any) => s.id === agent.strategy_id) || {};
    const sTrades = trades.filter((t: any) => t.strategy_id === agent.strategy_id);
    const notional = sTrades.reduce((acc: number, t: any) => acc + (Number(t.notional) || 0), 0);
    const cash = Math.max((strat.base ?? 1000) - notional + (strat.pnl ?? 0), 0);
    const positions = new Set(sTrades.map((t: any) => t.market)).size;
    return {
      ...agent,
      portfolio: strat.equity ?? 0,
      pnl: strat.pnl ?? 0,
      cash,
      positions,
      trades: sTrades.length,
    };
  });

  const totalPositions = new Set(trades.map((t: any) => t.market)).size;
  const leaderboardRows = agentRows.filter((a: any) => a.name !== 'Audi');


  return (

    <main className="min-h-screen bg-slate-950 text-white p-8 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <a href="/settings" className="rounded-full border border-slate-800 px-4 py-2 text-sm text-slate-300 hover:text-white">⚙️ Settings</a>
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

      <nav className="flex flex-wrap gap-3 text-sm text-slate-400 items-center">
        <a href="/settings" className="ml-auto text-slate-300 hover:text-white" title="Settings">⚙️ Settings</a>
        {['Dashboard','Leaderboard','Live Trades','Open Positions','Agents vs Humans','Agent Markets','Agent Profiles'].map((item) => (
          <span key={item} className="rounded-full border border-slate-800 px-3 py-1 hover:text-white">{item}</span>
        ))}
      </nav>

      
      <section>
        <h1 className="text-2xl font-semibold">Agent Leaderboard</h1>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-2 text-left">Agent</th>
                <th className="px-4 py-2 text-left">Portfolio</th>
                <th className="px-4 py-2 text-left">PnL</th>
                <th className="px-4 py-2 text-left">Cash</th>
                <th className="px-4 py-2 text-left">Positions</th>
                <th className="px-4 py-2 text-left">Trades</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardRows.map((agent: any) => (
                <tr key={agent.id} className="border-t border-slate-800">
                  <td className="px-4 py-2">{agent.name}</td>
                  <td className="px-4 py-2">{'$'}{Number(agent.portfolio).toFixed(2)}</td>
                  <td className="px-4 py-2">{'$'}{Number(agent.pnl).toFixed(2)}</td>
                  <td className="px-4 py-2">{'$'}{Number(agent.cash).toFixed(2)}</td>
                  <td className="px-4 py-2">{agent.positions}</td>
                  <td className="px-4 py-2">{agent.trades}</td>
                </tr>
              ))}
              {leaderboardRows.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-400" colSpan={7}>No agents found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h1 className="text-3xl font-semibold">Strategy Overview</h1>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {strategyStats.map((strategy: any) => (
            <a href={`/strategy/${strategy.id}`} className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-slate-600">
              <h2 className="text-xl font-medium">{strategy.name}</h2>
              <p className="text-sm text-slate-400">Status: {strategy.status}</p>
              <p className="text-sm text-slate-400">Owner: {strategy.owner}</p>
              <p className="text-xs text-slate-500">Last tuned: {strategy.last_tuned_at ? new Date(strategy.last_tuned_at).toLocaleString() : '—'}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-300">
                <div>
                  <div className="text-slate-500">Trades</div>
                  <div className="font-semibold">{strategy.tradeCount}</div>
                </div>
                <div>
                  <div className="text-slate-500">PnL</div>
                  <div className="font-semibold">{'$'}{strategy.pnl.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Equity</div>
                  <div className="font-semibold">{'$'}{strategy.equity.toFixed(2)}</div>
                </div>
              </div>
            </a>
          ))}
          {strategies.length === 0 && (
            <div className="text-slate-400">No strategies found. Populate Supabase to see live data.</div>
          )}
        </div>
      </section>

      <section>
        <h1 className="text-2xl font-semibold">Agents</h1>
        <div className="mt-4 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <div key={agent.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 flex flex-col items-center text-center h-[550px]">
              <div className="h-40 w-40 rounded-full bg-slate-800 p-2 mb-4">
                <img src={avatarMap[agent.name] || '/avatars/bond-ladder.svg'} alt={agent.name} className="h-full w-full rounded-full object-cover" />
              </div>
              <h3 className="text-xl font-semibold">{agent.name}</h3>
              {agent.name !== 'Audi' && (
                <p className="text-sm text-slate-400 mt-1">Strategy: {agent.strategy_id ?? '—'}</p>
              )}
              <p className="text-sm text-slate-300 mt-3">{descriptionMap[agent.name] || 'Agent running.'}</p>
              <div className="mt-auto flex items-center gap-2 text-xs text-slate-400">
                {latestHeartbeatMap[agent.id] ? (
                  <>
                    <span className={`h-2 w-2 rounded-full ${statusColor(latestHeartbeatMap[agent.id].status)}`} />
                    <span className="text-slate-500">{formatTs(latestHeartbeatMap[agent.id].created_at)}</span>
                  </>
                ) : (
                  <span className="text-slate-500">No heartbeat yet</span>
                )}
              </div>
            </div>
          ))}
          {agents.length === 0 && (
            <div className="text-slate-400">No agents registered yet.</div>
          )}
        </div>
      </section>


      


      <section>
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
                  <td className="px-4 py-2">{agentNameMap[event.agent_id] || (event.agent_id ? event.agent_id : 'System')}</td>
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
              {recentTrades.map((trade: any) => (
                <tr key={trade.id} className="border-t border-slate-800">
                  <td className="px-4 py-2">{strategyMap[trade.strategy_id]?.name || trade.strategy_id}</td>
                  <td className="px-4 py-2">{trade.market}</td>
                  <td className="px-4 py-2">{trade.side}</td>
                  <td className="px-4 py-2">{trade.notional}</td>
                  <td className="px-4 py-2">{formatDate(trade.closes_at)}</td>
                  <td className="px-4 py-2"><span className={`inline-block h-3 w-3 rounded-full ${trade.is_resolved ? (trade.side === 'YES' ? 'bg-emerald-500' : 'bg-rose-500') : (trade.closes_at && new Date(trade.closes_at).getTime() < Date.now() ? 'bg-amber-500' : 'bg-slate-500')}`} title={trade.is_resolved ? trade.side : (trade.closes_at && new Date(trade.closes_at).getTime() < Date.now() ? 'Past close, awaiting resolution' : 'Unresolved')} /></td>
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
