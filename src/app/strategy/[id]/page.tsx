'use client'

import { useEffect, useState } from 'react'
import StrategyDetail from './StrategyDetail'

export default function StrategyPage({ params }: { params: { id: string } }) {
  const strategyId = params.id
  const [strategy, setStrategy] = useState<any>(null)
  const [trades, setTrades] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anon) {
      setError('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)')
      return
    }

    const headers = { apikey: anon, Authorization: `Bearer ${anon}` }
    const id = encodeURIComponent(strategyId)

    async function load() {
      try {
        const sRes = await fetch(`${url}/rest/v1/strategies?id=eq.${id}`, { headers })
        const sData = await sRes.json()
        const tRes = await fetch(`${url}/rest/v1/trades?strategy_id=eq.${id}&order=executed_at.asc`, { headers })
        const tData = await tRes.json()

        if (!Array.isArray(sData) || !sData.length) {
          setError('Strategy not found')
          return
        }

        setStrategy(sData[0])
        setTrades(Array.isArray(tData) ? tData : [])
      } catch (err: any) {
        setError(err?.message || 'Failed to load strategy')
      }
    }

    load()
  }, [strategyId])

  if (error) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <h1 className="text-2xl font-semibold">Strategy not found</h1>
        <p className="text-slate-400 mt-2">{error}</p>
      </main>
    )
  }

  if (!strategy) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <h1 className="text-2xl font-semibold">Loading...</h1>
      </main>
    )
  }

  return <StrategyDetail strategy={strategy} trades={trades} />
}
