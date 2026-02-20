'use client'

import { useMemo, useState } from 'react'

const ranges = [
  { label: '1D', days: 1 },
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: 'MAX', days: null },
]

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`
}

function formatDate(ts?: string) {
  return ts ? new Date(ts).toLocaleString() : '—'
}

function computeEquity(trades: any[], base: number) {
  let equity = base
  const points: { t: number; equity: number }[] = []
  const sorted = [...trades].sort((a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime())
  for (const t of sorted) {
    equity += Number(t.pnl) || 0
    points.push({ t: new Date(t.executed_at).getTime(), equity })
  }
  return points
}

function buildPath(points: { t: number; equity: number }[], width: number, height: number) {
  if (!points.length) return ''
  const xs = points.map((p) => p.t)
  const ys = points.map((p) => p.equity)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const xScale = (t: number) => (maxX === minX ? 0 : ((t - minX) / (maxX - minX)) * width)
  const yScale = (v: number) => (maxY === minY ? height / 2 : height - ((v - minY) / (maxY - minY)) * height)

  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.t).toFixed(2)} ${yScale(p.equity).toFixed(2)}`)
    .join(' ')
}

function buildHistogram(trades: any[], width: number, height: number) {
  if (!trades.length) return []
  const maxAbs = Math.max(...trades.map((t) => Math.abs(Number(t.pnl) || 0)), 1)
  const barWidth = width / trades.length
  const baseline = height / 2
  return trades.map((t, idx) => {
    const pnl = Number(t.pnl) || 0
    const barHeight = Math.min(baseline, (Math.abs(pnl) / maxAbs) * baseline)
    return {
      x: idx * barWidth,
      y: pnl >= 0 ? baseline - barHeight : baseline,
      height: barHeight,
      width: barWidth - 2,
      positive: pnl >= 0,
    }
  })
}

export default function StrategyDetail({ strategy, trades }: { strategy: any; trades: any[] }) {
  const [range, setRange] = useState(ranges[2]) // 1M default
  const [sort, setSort] = useState<'recent' | 'best' | 'worst'>('recent')

  const filtered = useMemo(() => {
    if (!range.days) return trades
    const cutoff = Date.now() - range.days * 24 * 60 * 60 * 1000
    return trades.filter((t) => new Date(t.executed_at).getTime() >= cutoff)
  }, [trades, range])

  const sorted = useMemo(() => {
    if (sort === 'best') return [...filtered].sort((a, b) => (b.pnl || 0) - (a.pnl || 0))
    if (sort === 'worst') return [...filtered].sort((a, b) => (a.pnl || 0) - (b.pnl || 0))
    return [...filtered].sort((a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime())
  }, [filtered, sort])

  const base = Number(strategy.paper_capital ?? 100)
  const equityPoints = computeEquity(filtered, base)
  const totalPnl = equityPoints.length ? equityPoints[equityPoints.length - 1].equity - base : 0

  const path = buildPath(equityPoints, 740, 210)
  const bars = buildHistogram(filtered, 800, 160)

  const minEquity = equityPoints.length ? Math.min(...equityPoints.map(p => p.equity)) : base;
  const maxEquity = equityPoints.length ? Math.max(...equityPoints.map(p => p.equity)) : base;
  const startTs = equityPoints.length ? new Date(equityPoints[0].t).toLocaleString() : '—';
  const endTs = equityPoints.length ? new Date(equityPoints[equityPoints.length - 1].t).toLocaleString() : '—';

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8 space-y-8">
      <div className="mb-4">
        <a href="/" className="text-slate-300 hover:text-white">← Back</a>
      </div>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{strategy.name}</h1>
          <p className="text-slate-400">Owner: {strategy.owner}</p>
        </div>
      </header>

      <section className="flex gap-3 flex-wrap">
        {ranges.map((r) => (
          <button
            key={r.label}
            className={`rounded-full px-3 py-1 text-sm border ${range.label === r.label ? 'border-blue-500 text-white' : 'border-slate-800 text-slate-400'}`}
            onClick={() => setRange(r)}
          >
            {r.label}
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
            {bars.map((b, i) => (
              <rect
                key={i}
                x={b.x}
                y={b.y}
                width={b.width}
                height={b.height}
                fill={b.positive ? '#22c55e' : '#ef4444'}
                opacity="0.8"
              />
            ))}
          </svg>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Trades</h2>
          <select
            className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
          >
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
              {sorted.map((t) => (
                <tr key={t.id} className="border-t border-slate-800">
                  <td className="px-4 py-2">{t.market}</td>
                  <td className="px-4 py-2">{t.side}</td>
                  <td className="px-4 py-2">{formatMoney(Number(t.notional || 0))}</td>
                  <td className="px-4 py-2">{formatMoney(Number(t.pnl || 0))}</td>
                  <td className="px-4 py-2"><span className={`inline-block h-3 w-3 rounded-full ${t.is_resolved ? (t.side === 'YES' ? 'bg-emerald-500' : 'bg-rose-500') : 'bg-slate-500'}`} title={t.is_resolved ? t.side : 'Unresolved'} /></td>
                  <td className="px-4 py-2">{formatDate(t.executed_at)}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-400" colSpan={6}>No trades in this range.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
