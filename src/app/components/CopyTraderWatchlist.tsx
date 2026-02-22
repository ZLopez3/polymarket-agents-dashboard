'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

import type { CopyTraderWallet } from '@/types/dashboard'

interface Props {
  wallets: CopyTraderWallet[]
  mirroredAddresses?: string[]
}

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

export default function CopyTraderWatchlist({ wallets, mirroredAddresses = [] }: Props) {
  const [open, setOpen] = useState(false)
  const [mirrored, setMirrored] = useState<Set<string>>(() => new Set(mirroredAddresses.map((a) => a.toLowerCase())))
  const [creating, setCreating] = useState<string | null>(null)
  const router = useRouter()

  const handleCreateMirror = useCallback(async (wallet: CopyTraderWallet) => {
    setCreating(wallet.address)
    try {
      const res = await fetch('/api/strategies/create-mirror', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: wallet.address, wallet_label: wallet.label }),
      })
      if (res.ok || res.status === 409) {
        setMirrored((prev) => new Set([...prev, wallet.address.toLowerCase()]))
        router.refresh()
      }
    } finally {
      setCreating(null)
    }
  }, [router])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-emerald-700/50 px-4 py-2 text-sm text-emerald-200 transition hover:bg-emerald-500/10"
      >
        Tracked wallets ({wallets.length})
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-950/95 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold">Copy-trader watchlist</h3>
                <p className="text-sm text-slate-400">Pulled from PolyVision leaderboard & pilot wallets</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:text-white">
                Close
              </button>
            </div>

            <div className="mt-4 max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-400 sticky top-0 bg-slate-950/95 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left">Wallet</th>
                    <th className="px-3 py-2 text-left">Win rate</th>
                    <th className="px-3 py-2 text-left">Copy score</th>
                    <th className="px-3 py-2 text-left">Tier</th>
                    <th className="px-3 py-2 text-left">Last trade</th>
                    <th className="px-3 py-2 text-left">Notes</th>
                    <th className="px-3 py-2 text-left">Links</th>
                    <th className="px-3 py-2 text-left">Mirror</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((wallet) => {
                    const isMirrored = mirrored.has(wallet.address.toLowerCase())
                    const isCreating = creating === wallet.address
                    return (
                      <tr key={wallet.address} className="border-t border-slate-800">
                        <td className="px-3 py-2">
                          <div className="font-mono text-sm text-emerald-200">{shortAddress(wallet.address)}</div>
                          <div className="text-xs text-slate-500">{wallet.label}</div>
                        </td>
                        <td className="px-3 py-2">{wallet.winRate.toFixed(1)}%</td>
                        <td className="px-3 py-2">{wallet.copyScore.toFixed(1)}</td>
                        <td className="px-3 py-2 capitalize">{wallet.tier}</td>
                        <td className="px-3 py-2">{wallet.lastTrade ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-400 text-xs max-w-[140px] truncate" title={wallet.notes}>{wallet.notes || '—'}</td>
                        <td className="px-3 py-2">
                          <a
                            href={wallet.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-300 hover:text-emerald-200"
                          >
                            View profile ↗
                          </a>
                        </td>
                        <td className="px-3 py-2">
                          {isMirrored ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 px-2.5 py-1 text-xs text-emerald-300 border border-emerald-700/40">
                              Mirrored
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isCreating}
                              onClick={() => handleCreateMirror(wallet)}
                              className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isCreating ? 'Creating...' : 'Create Mirror'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
