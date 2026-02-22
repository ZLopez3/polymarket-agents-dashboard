'use client'

import { useMemo, useState } from 'react'

import type { Trade } from '@/types/dashboard'

interface Props {
  trades: Trade[]
}

const formatCurrency = (value?: number | null) => `$${Number(value ?? 0).toFixed(2)}`
const formatTs = (ts?: string | null) => (ts ? new Date(ts).toLocaleString('en-US', { timeZone: 'America/New_York' }) : '--')

const getResolutionColor = (trade: Trade, nowTs: number) => {
  if (trade.is_resolved) {
    return trade.side === 'YES' ? 'bg-positive' : 'bg-negative'
  }
  if (trade.closes_at && new Date(trade.closes_at).getTime() < nowTs) {
    return 'bg-warning'
  }
  return 'bg-border-accent'
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

  const selectClasses =
    'rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/30'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <select className={selectClasses} value={sideFilter} onChange={(event) => setSideFilter(event.target.value)}>
          <option value="all">All sides</option>
          <option value="YES">YES</option>
          <option value="NO">NO</option>
        </select>
        <select className={selectClasses} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="resolved">Resolved</option>
          <option value="open">Open</option>
        </select>
        <select className={selectClasses} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="newest">Newest</option>
          <option value="size_desc">Largest size</option>
          <option value="size_asc">Smallest size</option>
          <option value="pnl_desc">Best PnL</option>
          <option value="pnl_asc">Worst PnL</option>
        </select>
        <select className={selectClasses} value={String(limit)} onChange={(event) => setLimit(Number(event.target.value))}>
          <option value="10">Last 10</option>
          <option value="25">Last 25</option>
          <option value="50">Last 50</option>
        </select>
        <input
          className={`${selectClasses} min-w-[120px]`}
          placeholder="Search market..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Market</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Side</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Size</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">PnL</th>
              <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Executed</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((trade) => (
              <tr key={trade.id} className="table-row-hover border-b border-border/50 last:border-0 transition">
                <td className="max-w-[140px] truncate px-3 py-2 text-foreground">{trade.market}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${trade.side === 'YES' ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'}`}>
                    {trade.side}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-foreground">{formatCurrency(trade.notional)}</td>
                <td className={`px-3 py-2 text-right font-mono ${Number(trade.pnl || 0) >= 0 ? 'text-positive' : 'text-negative'}`}>{formatCurrency(trade.pnl)}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${getResolutionColor(trade, now)}`} title={getResolutionTitle(trade, now)} />
                </td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{formatTs(trade.executed_at)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={6}>
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
