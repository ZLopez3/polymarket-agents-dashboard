import { supabase } from '@/lib/supabaseClient'

export const dynamic = 'force-dynamic'

async function fetchSummary() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { strategies: [], agents: [], trades: [] }
  }

  const [strategies, agents, trades, events, heartbeats] = await Promise.all([
    supabase.from('strategies').select('*').limit(10),
    supabase.from('agents').select('*').limit(10),
    supabase.from('trades').select('*').order('executed_at', { ascending: false }).limit(10),
    supabase.from('events').select('*').order('created_at', { ascending: false }).limit(10),
    supabase.from('agent_heartbeats').select('*').order('created_at', { ascending: false }).limit(10),
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
};

const statusColor = (status: string) => {
  const s = (status || '').toLowerCase();
  if (s.includes('ok') || s.includes('alive') || s.includes('up')) return 'bg-emerald-500';
  if (s.includes('warn')) return 'bg-amber-500';
  if (s.includes('err') || s.includes('down')) return 'bg-rose-500';
  return 'bg-slate-500';
};

export default async function Home() {
  const { strategies = [], agents = [], trades = [], events = [], heartbeats = [] } = await fetchSummary()

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8 space-y-8">
      <section>
        <h1 className="text-3xl font-semibold">Strategy Overview</h1>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {strategies.map((strategy) => (
            <div key={strategy.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="text-xl font-medium">{strategy.name}</h2>
              <p className="text-sm text-slate-400">Status: {strategy.status}</p>
              <p className="text-sm text-slate-400">Owner: {strategy.owner}</p>
            </div>
          ))}
          {strategies.length === 0 && (
            <div className="text-slate-400">No strategies found. Populate Supabase to see live data.</div>
          )}
        </div>
      </section>

      <section>
        <h1 className="text-2xl font-semibold">Agents</h1>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {agents.map((agent) => (
            <div key={agent.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center gap-3">
                <img src={avatarMap[agent.name] || '/avatars/bond-ladder.svg'} alt={agent.name} className="h-10 w-10 rounded-full bg-slate-800 p-1" />
                <div>
                  <h3 className="text-lg font-medium">{agent.name}</h3>
                  <p className="text-sm text-slate-400">Strategy: {agent.strategy_id}</p>
                  <p className="text-sm text-slate-400">Status: {agent.status}</p>
                </div>
              </div>
            </div>
          ))}
          {agents.length === 0 && (
            <div className="text-slate-400">No agents registered yet.</div>
          )}
        </div>
      </section>


      <section>
        <h1 className="text-2xl font-semibold"><span className="mr-2">💓</span>Agent Heartbeats</h1>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {heartbeats.map((hb) => (
            <div key={hb.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${statusColor(hb.status)}`} />
                <h3 className="text-lg font-medium">Agent: {hb.agent_id}</h3>
              </div>
              <p className="text-sm text-slate-400">Status: {hb.status}</p>
              <p className="text-sm text-slate-400">Detail: {hb.detail}</p>
              <p className="text-xs text-slate-500">{hb.created_at}</p>
            </div>
          ))}
          {heartbeats.length === 0 && (
            <div className="text-slate-400">No heartbeats recorded yet.</div>
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
                  <td className="px-4 py-2">{event.agent_id}</td>
                  <td className="px-4 py-2">{event.event_type}</td>
                  <td className="px-4 py-2">{event.severity}</td>
                  <td className="px-4 py-2">{event.message}</td>
                  <td className="px-4 py-2">{event.created_at}</td>
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
                <th className="px-4 py-2 text-left">PnL</th>
                <th className="px-4 py-2 text-left">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr key={trade.id} className="border-t border-slate-800">
                  <td className="px-4 py-2">{trade.strategy_id}</td>
                  <td className="px-4 py-2">{trade.market}</td>
                  <td className="px-4 py-2">{trade.side}</td>
                  <td className="px-4 py-2">{trade.notional}</td>
                  <td className="px-4 py-2">{trade.pnl}</td>
                  <td className="px-4 py-2">{trade.executed_at}</td>
                </tr>
              ))}
              {trades.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-400" colSpan={6}>
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
