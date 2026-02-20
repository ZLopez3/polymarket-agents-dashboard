'use client'

import { useMemo, useState } from 'react'

import type { StrategyStats, Trade } from '@/types/dashboard'

interface Props {
  trades: Trade[]
  strategyMap: Record<string, StrategyStats>
}

const formatTs = (ts?: string | null) => (ts ? new Date(ts).toLocaleString() : '—')
const formatDate = (ts?: string | null) => (ts ? new Date(ts).toLocaleDateString() : '—')

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

export default function RecentTradesTable({ trades, strategyMap }: Props) {
  const [strategyFilter, setStrategyFilter] = useState('all')
  const [sideFilter, setSideFilter] = useState('all')
  const [resolvedFilter, setResolvedFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('newest')
  const [now] = useState(() => new Date().getTime())

  const filtered = useMemo(() => {
    let data = [...trades]
    if (strategyFilter !== 'all') data = data.filter((trade) => trade.strategy_id === strategyFilter)
    if (sideFilter !== 'all') data = data.filter((trade) => trade.side === sideFilter)
    if (resolvedFilter !== 'all') data = data.filter((trade) => (resolvedFilter === 'resolved' ? trade.is_resolved : !trade.is_resolved))
    if (query) data = data.filter((trade) => (trade.market || '').toLowerCase().includes(query.toLowerCase()))

    switch (sort) {
      case 'oldest':
        data.sort((a, b) => new Date(a.executed_at || '').getTime() - new Date(b.executed_at || '').getTime())
        break
      case 'notional_desc':
        data.sort((a, b) => (Number(b.notional) || 0) - (Number(a.notional) || 0))
        break
      case 'notional_asc':
        data.sort((a, b) => (Number(a.notional) || 0) - (Number(b.notional) || 0))
        break
      default:
        data.sort((a, b) => new Date(b.executed_at || '').getTime() - new Date(a.executed_at || '').getTime())
    }
    return data
  }, [trades, strategyFilter, sideFilter, resolvedFilter, query, sort])

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-3 text-xs">
        <select className="bg-slate-900 border border-slate-800 rounded px-2 py-1" value={strategyFilter} onChange={(event) => setStrategyFilter(event.target.value)}>
          <option value="all">All strategies</option>
          {Object.values(strategyMap).map((strategy) => (
            <option key={strategy.id} value={strategy.id}>
              {strategy.name}
            </option>
          ))}
        </select>
        <select className="bg-slate-900 border border-slate-800 rounded px-2 py-1" value={sideFilter} onChange={(event) => setSideFilter(event.target.value)}>
          <option value="all">All sides</option>
          <option value="YES">YES</option>
          <option value="NO">NO</option>
        </select>
        <select className="bg-slate-900 border border-slate-800 rounded px-2 py-1" value={resolvedFilter} onChange={(event) => setResolvedFilter(event.target.value)}>
          <option value="all">All</option>
          <option value="resolved">Resolved</option>
          <option value="unresolved">Unresolved</option>
        </select>
        <select className="bg-slate-900 border border-slate-800 rounded px-2 py-1" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="notional_desc">Notional ↓</option>
          <option value="notional_asc">Notional ↑</option>
        </select>
        <input className="bg-slate-900 border border-slate-800 rounded px-2 py-1" placeholder="Search market" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
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
            {filtered.map((trade) => (
              <tr key={trade.id} className="border-t border-slate-800">
                <td className="px-4 py-2">{strategyMap[trade.strategy_id]?.name || trade.strategy_id}</td>
                <td className="px-4 py-2">{trade.market}</td>
                <td className="px-4 py-2">{trade.side}</td>
                <td className="px-4 py-2">${Number(trade.notional || 0).toFixed(2)}</td>
                <td className="px-4 py-2">{formatDate(trade.closes_at)}</td>
                <td className="px-4 py-2">
                  <span className={`inline-block h-3 w-3 rounded-full ${getResolutionColor(trade, now)}`} title={getResolutionTitle(trade, now)} />
                </td>
                <td className="px-4 py-2">{formatTs(trade.executed_at)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={7}>
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
