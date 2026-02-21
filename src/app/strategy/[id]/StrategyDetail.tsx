'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import type { Strategy, Trade } from '@/types/dashboard'

type RangeOption = {
  label: string
  days: number | null
}

const ranges: RangeOption[] = [
  { label: '1D', days: 1 },
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: 'MAX', days: null },
]

const formatMoney = (value: number) => `$${value.toFixed(2)}`
const formatDate = (ts?: string | null) => (ts ? new Date(ts).toLocaleString() : '—')

const computeEquity = (trades: Trade[], base: number) => {
  let equity = base
  const points: { t: number; equity: number }[] = []
  const sorted = [...trades].sort((a, b) => new Date(a.executed_at || '').getTime() - new Date(b.executed_at || '').getTime())
  for (const trade of sorted) {
    equity += Number(trade.pnl) || 0
    points.push({ t: new Date(trade.executed_at || '').getTime(), equity })
  }
  return points
}

const buildPath = (points: { t: number; equity: number }[], width: number, height: number) => {
  if (!points.length) return ''
  const xs = points.map((point) => point.t)
  const ys = points.map((point) => point.equity)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const xScale = (t: number) => (maxX === minX ? 0 : ((t - minX) / (maxX - minX)) * width)
  const yScale = (v: number) => (maxY === minY ? height / 2 : height - ((v - minY) / (maxY - minY)) * height)

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xScale(point.t).toFixed(2)} ${yScale(point.equity).toFixed(2)}`)
    .join(' ')
}

const buildHistogram = (trades: Trade[], width: number, height: number) => {
  if (!trades.length) return []
  const maxAbs = Math.max(...trades.map((trade) => Math.abs(Number(trade.pnl) || 0)), 1)
  const barWidth = width / trades.length
  const baseline = height / 2
  return trades.map((trade, index) => {
    const pnl = Number(trade.pnl) || 0
    const barHeight = Math.min(baseline, (Math.abs(pnl) / maxAbs) * baseline)
    return {
      x: index * barWidth,
      y: pnl >= 0 ? baseline - barHeight : baseline,
      height: barHeight,
      width: barWidth - 2,
      positive: pnl >= 0,
    }
  })
}

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

interface Props {
  strategy: Strategy
  trades: Trade[]
}

export default function StrategyDetail({ strategy, trades }: Props) {
  const [range, setRange] = useState<RangeOption>(ranges[2])
  const [sort, setSort] = useState<'recent' | 'best' | 'worst'>('recent')
  const [now] = useState(() => new Date().getTime())

  const filtered = useMemo(() => {
    if (!range.days) return trades
    const cutoff = now - range.days * 24 * 60 * 60 * 1000
    const subset = trades.filter((trade) => new Date(trade.executed_at || '').getTime() >= cutoff)
    if (subset.length === 0) {
      return trades
    }
    return subset
  }, [trades, range, now])

  const sorted = useMemo(() => {
    if (sort === 'best') return [...filtered].sort((a, b) => (Number(b.pnl) || 0) - (Number(a.pnl) || 0))
    if (sort === 'worst') return [...filtered].sort((a, b) => (Number(a.pnl) || 0) - (Number(b.pnl) || 0))
    return [...filtered].sort((a, b) => new Date(b.executed_at || '').getTime() - new Date(a.executed_at || '').getTime())
  }, [filtered, sort])

  const base = Number(strategy.paper_capital ?? 100)
  const equityPoints = computeEquity(filtered, base)
  const totalPnl = equityPoints.length ? equityPoints[equityPoints.length - 1].equity - base : 0

  const path = buildPath(equityPoints, 740, 210)
  const bars = buildHistogram(filtered, 800, 160)

  const minEquity = equityPoints.length ? Math.min(...equityPoints.map((point) => point.equity)) : base
  const maxEquity = equityPoints.length ? Math.max(...equityPoints.map((point) => point.equity)) : base
  const startTs = equityPoints.length ? new Date(equityPoints[0].t).toLocaleString() : '—'
  const endTs = equityPoints.length ? new Date(equityPoints[equityPoints.length - 1].t).toLocaleString() : '—'

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8 space-y-8">
      <div className="mb-4">
        <Link href="/" className="text-slate-300 hover:text-white">
          ← Back
        </Link>
      </div>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{strategy.name}</h1>
          <p className="text-slate-400">Owner: {strategy.owner}</p>
        </div>
      </header>

      <section className="flex gap-3 flex-wrap">
        {ranges.map((rangeOption) => (
          <button
            key={rangeOption.label}
            className={`rounded-full px-3 py-1 text-sm border ${range.label === rangeOption.label ? 'border-blue-500 text-white' : 'border-slate-800 text-slate-400'}`}
            onClick={() => setRange(rangeOption)}
            type="button"
          >
            {rangeOption.label}
          </button>
        ))}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Equity Curve</h2>
          <div className="text-slate-400 text-sm">PnL: {formatMoney(totalPnl)}</div>
        </div>
        <div className="mt-4">
          <svg width="100%" viewBox="0 0 800 260" className="text-emerald-400">
            <line x1="40" y1="10" x2="40" y2="220" stroke="#334155" strokeWidth="1" />
            <line x1="40" y1="220" x2="780" y2="220" stroke="#334155" strokeWidth="1" />
            <text x="10" y="20" fontSize="10" fill="#94A3B8">{formatMoney(maxEquity)}</text>
            <text x="10" y="220" fontSize="10" fill="#94A3B8">{formatMoney(minEquity)}</text>
            <text x="40" y="250" fontSize="10" fill="#94A3B8">{startTs}</text>
            <text x="560" y="250" fontSize="10" fill="#94A3B8">{endTs}</text>
            <g transform="translate(40,10)">
              <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
              <path d={`${path} L 740 210 L 0 210 Z`} fill="currentColor" opacity="0.1" />
            </g>
          </svg>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold">Trade PnL Histogram</h2>
        <div className="mt-4">
          <svg width="100%" viewBox="0 0 800 160">
            <rect x="0" y="80" width="800" height="1" fill="#334155" />
            {bars.map((bar, index) => (
              <rect key={index} x={bar.x} y={bar.y} width={bar.width} height={bar.height} fill={bar.positive ? '#22c55e' : '#ef4444'} opacity="0.8" />
            ))}
          </svg>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Trades</h2>
          <select className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm" value={sort} onChange={(event) => setSort(event.target.value as 'recent' | 'best' | 'worst')}>
            <option value="recent">Most Recent</option>
            <option value="best">Best PnL</option>
            <option value="worst">Worst PnL</option>
          </select>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-2 text-left">Market</th>
                <th className="px-4 py-2 text-left">Side</th>
                <th className="px-4 py-2 text-left">Notional</th>
                <th className="px-4 py-2 text-left">PnL</th>
                <th className="px-4 py-2 text-left">Resolved</th>
                <th className="px-4 py-2 text-left">Exec Time</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((trade) => (
                <tr key={trade.id} className="border-t border-slate-800">
                  <td className="px-4 py-2">{trade.market}</td>
                  <td className="px-4 py-2">{trade.side}</td>
                  <td className="px-4 py-2">{formatMoney(Number(trade.notional || 0))}</td>
                  <td className="px-4 py-2">{formatMoney(Number(trade.pnl || 0))}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block h-3 w-3 rounded-full ${resolutionColor(trade, now)}`} title={resolutionTitle(trade, now)} />
                  </td>
                  <td className="px-4 py-2">{formatDate(trade.executed_at)}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-400" colSpan={6}>
                    No trades in this range.
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
