'use client'

import { useState } from 'react'

export default function CollapsibleSettingsCard({
  strategyName,
  owner,
  tradingModeToggle,
  children,
}: {
  strategyName: string
  owner: string
  tradingModeToggle: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="min-w-0">
            <h3 className="text-lg font-medium truncate">{strategyName}</h3>
            <p className="text-sm text-slate-400">Owner: {owner}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div onClick={(e) => e.stopPropagation()}>
            {tradingModeToggle}
          </div>
          <svg
            className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-800 px-5 pb-5 pt-4">
          {children}
        </div>
      )}
    </div>
  )
}
