'use client'

import { useMemo, useState } from 'react'

import type { Trade } from '@/types/dashboard'

interface Props {
  trades: Trade[]
}

const formatCurrency = (value?: number | null) => `$${Number(value ?? 0).toFixed(2)}`
const formatTs = (ts?: string | null) => (ts ? new Date(ts).toLocaleString('en-US', { timeZone: 'America/New_York' }) : '—')

const getResolutionColor = (trade: Trade, nowTs: number) => {
  if (trade.is_resolved) {
    return trade.side === 'YES' ? 'bg-emerald-500' : 'bg-rose-500'
  }
  if (trade.closes_at && new Date(trade.closes_at).getTime() < nowTs) {
    return 'bg-amber-500'
  }
  return 'bg-slate-500'
}

const getResolutionTitle = (trade: Trade, nowTs: number) => {
  if (trade.is_resolved) return trade.side
  if (trade.closes_at && new Date(trade.closes_at).getTime() < nowTs) return 'Past close, awaiting resolution'
  return 'Unresolved'
}

export default function CopyTraderTradesTable({ trades }: Props) {
  const [sideFilter, setSideFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(25)
  const [now] = useState(() => Date.now())

  const filtered = useMemo(() => {
    let data = [...trades]
    if (sideFilter !== 'all') data = data.filter((trade) => trade.side === sideFilter)
    if (statusFilter !== 'all') {
      data = data.filter((trade) => (statusFilter === 'resolved' ? trade.is_resolved : !trade.is_resolved))
    }
    if (query) {
      data = data.filter((trade) => (trade.market || '').toLowerCase().includes(query.toLowerCase()))
    }

    data.sort((a, b) => {
      switch (sort) {
        case 'size_desc':
          return (Number(b.notional) || 0) - (Number(a.notional) || 0)
        case 'size_asc':
          return (Number(a.notional) || 0) - (Number(b.notional) || 0)
        case 'pnl_desc':
          return (Number(b.pnl) || 0) - (Number(a.pnl) || 0)
        case 'pnl_asc':
          return (Number(a.pnl) || 0) - (Number(b.pnl) || 0)
        default:
          return new Date(b.executed_at || '').getTime() - new Date(a.executed_at || '').getTime()
      }
    })

    return data.slice(0, limit)
  }, [trades, sideFilter, statusFilter, query, sort, limit])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 text-xs">
        <select className="bg-slate-900 border border-slate-800 rounded px-2 py-1" value={sideFilter} onChange={(event) => setSideFilter(event.target.value)}>
          <option value="all">All sides</option>
          <option value="YES">YES</option>
          <option value="NO">NO</option>
        </select>
        <select className="bg-slate-900 border border-slate-800 rounded px-2 py-1" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="resolved">Resolved</option>
          <option value="open">Open</option>
        </select>
        <select className="bg-slate-900 border border-slate-800 rounded px-2 py-1" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="newest">Newest</option>
          <option value="size_desc">Largest size ↓</option>
          <option value="size_asc">Largest size ↑</option>
          <option value="pnl_desc">PnL ↓</option>
          <option value="pnl_asc">PnL ↑</option>
        </select>
        <select className="bg-slate-900 border border-slate-800 rounded px-2 py-1" value={String(limit)} onChange={(event) => setLimit(Number(event.target.value))}>
          <option value="10">Last 10</option>
          <option value="25">Last 25</option>
          <option value="50">Last 50</option>
        </select>
        <input className="bg-slate-900 border border-slate-800 rounded px-2 py-1" placeholder="Search market" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-xs sm:text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">Market</th>
              <th className="px-3 py-2 text-left">Side</th>
              <th className="px-3 py-2 text-left">Mode</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Size</th>
              <th className="px-3 py-2 text-left">PnL</th>
              <th className="px-3 py-2 text-left">Resolution</th>
              <th className="px-3 py-2 text-left">Executed</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((trade) => (
              <tr key={trade.id} className={`border-t border-slate-800 ${trade.status === 'failed' ? 'bg-red-950/20' : ''}`}>
                <td className="px-3 py-2 max-w-[180px] truncate" title={trade.market}>{trade.market}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${trade.side === 'YES' ? 'bg-emerald-500/10 text-emerald-200' : 'bg-rose-500/10 text-rose-200'}`}>
                    {trade.side}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase ${
                    trade.trading_mode === 'live' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {trade.trading_mode ?? 'paper'}
                  </span>
                </td>
                <td className="px-3 py-2">
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
                <td className="px-3 py-2">{formatCurrency(trade.notional)}</td>
                <td className={`px-3 py-2 ${Number(trade.pnl || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatCurrency(trade.pnl)}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block h-3 w-3 rounded-full ${getResolutionColor(trade, now)}`} title={getResolutionTitle(trade, now)} />
                </td>
                <td className="px-3 py-2">{formatTs(trade.executed_at)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={8}>
                  No trades match filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
