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
const formatDate = (ts?: string | null) => (ts ? new Date(ts).toLocaleString() : '--')

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
    return trade.side === 'YES' ? 'bg-positive' : 'bg-negative'
  }
  if (trade.closes_at && new Date(trade.closes_at).getTime() < nowTs) {
    return 'bg-warning'
  }
  return 'bg-border-accent'
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
  const startTs = equityPoints.length ? new Date(equityPoints[0].t).toLocaleString() : '--'
  const endTs = equityPoints.length ? new Date(equityPoints[equityPoints.length - 1].t).toLocaleString() : '--'

  const selectClasses =
    'rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/30'

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* Back link */}
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          Back to dashboard
        </Link>

        {/* Header */}
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{strategy.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Owner: {strategy.owner || 'System'}</p>
        </header>

        {/* Range selector */}
        <div className="flex flex-wrap gap-2">
          {ranges.map((rangeOption) => (
            <button
              key={rangeOption.label}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                range.label === rangeOption.label
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'border border-border text-muted-foreground hover:border-border-accent hover:text-foreground'
              }`}
              onClick={() => setRange(rangeOption)}
              type="button"
            >
              {rangeOption.label}
            </button>
          ))}
        </div>

        {/* KPI Cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Total PnL', value: formatMoney(totalPnl), color: totalPnl >= 0 ? 'text-positive' : 'text-negative' },
            { label: 'Equity', value: formatMoney(equityPoints.length ? equityPoints[equityPoints.length - 1].equity : base) },
            { label: 'Base Capital', value: formatMoney(base) },
            { label: 'Trades', value: String(filtered.length) },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-border bg-card p-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{kpi.label}</p>
              <p className={`mt-2 text-2xl font-semibold font-mono tracking-tight ${kpi.color || 'text-foreground'}`}>{kpi.value}</p>
            </div>
          ))}
        </section>

        {/* Equity Curve */}
        <section className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Equity Curve</h2>
            <span className={`font-mono text-sm ${totalPnl >= 0 ? 'text-positive' : 'text-negative'}`}>{totalPnl >= 0 ? '+' : ''}{formatMoney(totalPnl)}</span>
          </div>
          <div className="mt-4">
            <svg width="100%" viewBox="0 0 800 260" aria-label="Equity curve chart">
              <line x1="40" y1="10" x2="40" y2="220" stroke="var(--border)" strokeWidth="1" />
              <line x1="40" y1="220" x2="780" y2="220" stroke="var(--border)" strokeWidth="1" />
              <text x="10" y="20" fontSize="10" fill="var(--muted-foreground)" className="font-mono">{formatMoney(maxEquity)}</text>
              <text x="10" y="220" fontSize="10" fill="var(--muted-foreground)" className="font-mono">{formatMoney(minEquity)}</text>
              <text x="40" y="250" fontSize="9" fill="var(--muted-foreground)" className="font-mono">{startTs}</text>
              <text x="560" y="250" fontSize="9" fill="var(--muted-foreground)" className="font-mono">{endTs}</text>
              <g transform="translate(40,10)">
                <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
                <path d={`${path} L 740 210 L 0 210 Z`} fill="var(--accent)" opacity="0.08" />
              </g>
            </svg>
          </div>
        </section>

        {/* PnL Histogram */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground">Trade PnL Histogram</h2>
          <div className="mt-4">
            <svg width="100%" viewBox="0 0 800 160" aria-label="Trade PnL histogram">
              <rect x="0" y="80" width="800" height="1" fill="var(--border)" />
              {bars.map((bar, index) => (
                <rect key={index} x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx="1" fill={bar.positive ? 'var(--positive)' : 'var(--negative)'} opacity="0.75" />
              ))}
            </svg>
          </div>
        </section>

        {/* Trades Table */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Trades</h2>
            <select className={selectClasses} value={sort} onChange={(event) => setSort(event.target.value as 'recent' | 'best' | 'worst')}>
              <option value="recent">Most Recent</option>
              <option value="best">Best PnL</option>
              <option value="worst">Worst PnL</option>
            </select>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Market</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Side</th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Notional</th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">PnL</th>
                  <th className="px-5 py-3 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Executed</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((trade) => (
                  <tr key={trade.id} className="table-row-hover border-b border-border/50 last:border-0 transition">
                    <td className="max-w-[200px] truncate px-5 py-3 text-foreground">{trade.market}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                        trade.side === 'YES' ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'
                      }`}>{trade.side}</span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-foreground">{formatMoney(Number(trade.notional || 0))}</td>
                    <td className={`px-5 py-3 text-right font-mono ${Number(trade.pnl || 0) >= 0 ? 'text-positive' : 'text-negative'}`}>{formatMoney(Number(trade.pnl || 0))}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${resolutionColor(trade, now)}`} title={resolutionTitle(trade, now)} />
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{formatDate(trade.executed_at)}</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td className="px-5 py-8 text-center text-muted-foreground" colSpan={6}>No trades in this range.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
