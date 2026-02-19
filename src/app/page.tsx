import { supabase } from '@/lib/supabaseClient'

async function fetchSummary() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { strategies: [], agents: [], trades: [] }
  }

  const [strategies, agents, trades] = await Promise.all([
    supabase.from('strategies').select('*').limit(10),
    supabase.from('agents').select('*').limit(10),
    supabase.from('trades').select('*').order('executed_at', { ascending: false }).limit(10),
  ])

  return {
    strategies: strategies.data ?? [],
    agents: agents.data ?? [],
    trades: trades.data ?? [],
  }
}

export default async function Home() {
  const { strategies, agents, trades } = await fetchSummary()

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
              <h3 className="text-lg font-medium">{agent.name}</h3>
              <p className="text-sm text-slate-400">Strategy: {agent.strategy_id}</p>
              <p className="text-sm text-slate-400">Status: {agent.status}</p>
            </div>
          ))}
          {agents.length === 0 && (
            <div className="text-slate-400">No agents registered yet.</div>
          )}
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
