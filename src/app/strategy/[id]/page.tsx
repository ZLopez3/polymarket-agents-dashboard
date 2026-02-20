export const dynamic = 'force-dynamic'

async function fetchJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers })
  if (!res.ok) return []
  return res.json()
}

export default async function StrategyPage({ params }: { params: { id: string } }) {
  const strategyId = params.id
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <h1 className="text-2xl font-semibold">Missing Supabase env</h1>
        <p className="text-slate-400 mt-2">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.</p>
      </main>
    )
  }

  const headers = { apikey: anon, Authorization: `Bearer ${anon}` }
  const id = encodeURIComponent(strategyId)
  const strategies = await fetchJson(`${url}/rest/v1/strategies?id=eq.${id}`, headers)
  const strategy = strategies?.[0]
  const trades = await fetchJson(`${url}/rest/v1/trades?strategy_id=eq.${id}&order=executed_at.asc`, headers)

  if (!strategy) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <h1 className="text-2xl font-semibold">Strategy not found</h1>
      </main>
    )
  }

  const StrategyDetail = (await import('./StrategyDetail')).default
  return <StrategyDetail strategy={strategy} trades={trades || []} />
}
