'use client'

import { useState } from 'react'

import type { CopyTraderWallet } from '@/types/dashboard'

interface Props {
  wallets: CopyTraderWallet[]
}

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

export default function CopyTraderWatchlist({ wallets }: Props) {
  const [open, setOpen] = useState(false)

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
          <div className="relative w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-950/95 p-6 shadow-2xl">
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
                <thead className="text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Wallet</th>
                    <th className="px-3 py-2 text-left">Win rate</th>
                    <th className="px-3 py-2 text-left">Copy score</th>
                    <th className="px-3 py-2 text-left">Tier</th>
                    <th className="px-3 py-2 text-left">Last trade</th>
                    <th className="px-3 py-2 text-left">Notes</th>
                    <th className="px-3 py-2 text-left">Links</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((wallet) => (
                    <tr key={wallet.address} className="border-t border-slate-800">
                      <td className="px-3 py-2">
                        <div className="font-mono text-sm text-emerald-200">{shortAddress(wallet.address)}</div>
                        <div className="text-xs text-slate-500">{wallet.label}</div>
                      </td>
                      <td className="px-3 py-2">{wallet.winRate.toFixed(1)}%</td>
                      <td className="px-3 py-2">{wallet.copyScore.toFixed(1)}</td>
                      <td className="px-3 py-2 capitalize">{wallet.tier}</td>
                      <td className="px-3 py-2">{wallet.lastTrade ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-400 text-xs">{wallet.notes || '—'}</td>
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
