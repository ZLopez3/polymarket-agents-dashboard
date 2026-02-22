'use client'

import { useState } from 'react'

import type { CopyTraderWallet } from '@/types/dashboard'

interface Props {
  wallets: CopyTraderWallet[]
}

const shortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`

const tierColors: Record<string, string> = {
  green: 'bg-positive/10 text-positive',
  yellow: 'bg-warning/10 text-warning',
  red: 'bg-negative/10 text-negative',
}

export default function CopyTraderWatchlist({ wallets }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:border-border-accent hover:text-foreground"
      >
        Tracked wallets ({wallets.length})
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Copy-trader watchlist">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-3xl mx-4 rounded-xl border border-border bg-card shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Copy-Trader Watchlist</h3>
                <p className="text-xs text-muted-foreground">Pulled from PolyVision leaderboard & pilot wallets</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-border-accent hover:text-foreground"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Table */}
            <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Wallet</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Win rate</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Score</th>
                    <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Tier</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Last trade</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Notes</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((wallet) => (
                    <tr key={wallet.address} className="table-row-hover border-b border-border/50 last:border-0 transition">
                      <td className="px-4 py-2.5">
                        <div className="font-mono text-xs text-accent">{shortAddress(wallet.address)}</div>
                        <div className="text-[10px] text-muted-foreground">{wallet.label}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground">{wallet.winRate.toFixed(1)}%</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground">{wallet.copyScore.toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize ${tierColors[wallet.tier] || 'bg-muted text-muted-foreground'}`}>
                          {wallet.tier}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{wallet.lastTrade ?? '--'}</td>
                      <td className="max-w-[140px] truncate px-4 py-2.5 text-xs text-muted-foreground">{wallet.notes || '--'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <a
                          href={wallet.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-accent transition hover:text-accent-foreground"
                        >
                          View
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
