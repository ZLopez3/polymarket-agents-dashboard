import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { Trade, Strategy } from '@/types/dashboard'

export const revalidate = 60
export const dynamic = 'force-dynamic'

function formatTs(ts: string | null | undefined) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

function formatDate(ts: string | null | undefined) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
}

function indicator(trade: Trade) {
  const now = Date.now()
  if (trade.is_resolved) return <span className="inline-block h-3 w-3 rounded-full bg-emerald-400" title="Resolved" />
  if (trade.closes_at && new Date(trade.closes_at).getTime() < now)
    return <span className="inline-block h-3 w-3 rounded-full bg-amber-400" title="Expired" />
  return <span className="inline-block h-3 w-3 rounded-full bg-slate-500" title="Open" />
}

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; mode?: string; status?: string }>
}) {
  if (!supabaseAdmin) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <h1 className="text-2xl font-semibold">Trades not available</h1>
        <p className="text-slate-400 mt-2">Missing Supabase credentials.</p>
      </main>
    )
  }

  const { page: pageParam, mode, status } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)
  const perPage = 50

  let query = supabaseAdmin
    .from('trades')
    .select('*', { count: 'exact' })
    .order('executed_at', { ascending: false })

  if (mode && (mode === 'live' || mode === 'paper')) {
    query = query.eq('trading_mode', mode)
  }
  if (status && (status === 'filled' || status === 'failed')) {
    query = query.eq('status', status)
  }

  query = query.range((page - 1) * perPage, page * perPage - 1)

  const [tradesRes, strategiesRes] = await Promise.all([
    query,
    supabaseAdmin.from('strategies').select('id, name'),
  ])

  const totalCount = tradesRes.count ?? 0
  const trades = (tradesRes.data ?? []) as Trade[]
  const strategies = (strategiesRes.data ?? []) as Strategy[]
  const strategyMap = strategies.reduce<Record<string, Strategy>>((acc, s) => {
    acc[s.id] = s
    return acc
  }, {})
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage))

  const buildUrl = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    if (params.page && params.page !== '1') p.set('page', params.page)
    if (params.mode) p.set('mode', params.mode)
    if (params.status) p.set('status', params.status)
    const qs = p.toString()
    return `/trades${qs ? `?${qs}` : ''}`
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8 space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors">
        &larr; Back to Dashboard
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">All Trades</h1>
          <p className="text-sm text-slate-400 mt-1">{totalCount} trades total &middot; Page {page} of {totalPages}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span className="text-slate-400">Filter:</span>
        <Link
          href={buildUrl({ mode: undefined, status, page: '1' })}
          className={`rounded-lg border px-3 py-1.5 transition-colors ${!mode ? 'border-emerald-600 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 text-slate-400 hover:text-white'}`}
        >
          All Modes
        </Link>
        <Link
          href={buildUrl({ mode: 'live', status, page: '1' })}
          className={`rounded-lg border px-3 py-1.5 transition-colors ${mode === 'live' ? 'border-emerald-600 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 text-slate-400 hover:text-white'}`}
        >
          Live
        </Link>
        <Link
          href={buildUrl({ mode: 'paper', status, page: '1' })}
          className={`rounded-lg border px-3 py-1.5 transition-colors ${mode === 'paper' ? 'border-amber-600 bg-amber-500/10 text-amber-400' : 'border-slate-700 text-slate-400 hover:text-white'}`}
        >
          Paper
        </Link>
        <span className="mx-2 h-4 w-px bg-slate-700" />
        <Link
          href={buildUrl({ mode, status: undefined, page: '1' })}
          className={`rounded-lg border px-3 py-1.5 transition-colors ${!status ? 'border-emerald-600 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 text-slate-400 hover:text-white'}`}
        >
          All Status
        </Link>
        <Link
          href={buildUrl({ mode, status: 'filled', page: '1' })}
          className={`rounded-lg border px-3 py-1.5 transition-colors ${status === 'filled' ? 'border-emerald-600 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 text-slate-400 hover:text-white'}`}
        >
          Filled
        </Link>
        <Link
          href={buildUrl({ mode, status: 'failed', page: '1' })}
          className={`rounded-lg border px-3 py-1.5 transition-colors ${status === 'failed' ? 'border-red-600 bg-red-500/10 text-red-400' : 'border-slate-700 text-slate-400 hover:text-white'}`}
        >
          Failed
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-4 py-2 text-left">Strategy</th>
              <th className="px-4 py-2 text-left">Market</th>
              <th className="px-4 py-2 text-left">Side</th>
              <th className="px-4 py-2 text-left">Mode</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Notional</th>
              <th className="px-4 py-2 text-left">PnL</th>
              <th className="px-4 py-2 text-left">Resolves</th>
              <th className="px-4 py-2 text-left">Resolved</th>
              <th className="px-4 py-2 text-left">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id} className={`border-t border-slate-800 ${trade.status === 'failed' ? 'bg-red-950/20' : ''}`}>
                <td className="px-4 py-2 whitespace-nowrap">{strategyMap[trade.strategy_id]?.name || trade.strategy_id}</td>
                <td className="px-4 py-2 max-w-[250px] truncate" title={trade.market}>{trade.market}</td>
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
                <td className={`px-4 py-2 ${(Number(trade.pnl || 0)) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  ${Number(trade.pnl || 0).toFixed(2)}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{formatDate(trade.closes_at)}</td>
                <td className="px-4 py-2">{indicator(trade)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{formatTs(trade.executed_at)}</td>
              </tr>
            ))}
            {trades.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={10}>
                  No trades match filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav className="flex items-center justify-center gap-4" aria-label="Pagination">
        {page > 1 ? (
          <Link
            href={buildUrl({ mode, status, page: String(page - 1) })}
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:bg-slate-800 transition-colors"
          >
            &larr; Previous
          </Link>
        ) : (
          <span className="rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-600 cursor-not-allowed">
            &larr; Previous
          </span>
        )}
        <span className="text-sm text-slate-400">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={buildUrl({ mode, status, page: String(page + 1) })}
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:bg-slate-800 transition-colors"
          >
            Next &rarr;
          </Link>
        ) : (
          <span className="rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-600 cursor-not-allowed">
            Next &rarr;
          </span>
        )}
      </nav>
    </main>
  )
}
