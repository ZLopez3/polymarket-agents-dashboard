'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

import StrategyDetail from './StrategyDetail'
import type { Strategy, Trade } from '@/types/dashboard'

export default function StrategyPage() {
  const params = useParams()
  const strategyId = params?.id?.toString()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const missingEnv = useMemo(() => !supabaseUrl || !anonKey, [supabaseUrl, anonKey])

  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [error, setError] = useState<string | null>(missingEnv ? 'Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)' : null)
  const [loading, setLoading] = useState<boolean>(!missingEnv && Boolean(strategyId))

  useEffect(() => {
    if (missingEnv || !strategyId) return
    let cancelled = false

    const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
    const encodedId = encodeURIComponent(strategyId)

    async function load() {
      try {
        setLoading(true)
        const [strategyRes, tradesRes] = await Promise.all([
          fetch(`${supabaseUrl}/rest/v1/strategies?id=eq.${encodedId}`, { headers }),
          fetch(`${supabaseUrl}/rest/v1/trades?strategy_id=eq.${encodedId}&order=executed_at.asc`, { headers }),
        ])

        if (!strategyRes.ok) {
          const message = await strategyRes.text()
          throw new Error(`Strategies fetch failed: ${strategyRes.status} ${message}`)
        }

        if (!tradesRes.ok) {
          const message = await tradesRes.text()
          throw new Error(`Trades fetch failed: ${tradesRes.status} ${message}`)
        }

        const strategyData: Strategy[] = await strategyRes.json()
        const tradeData: Trade[] = await tradesRes.json()

        if (!strategyData.length) {
          throw new Error('Strategy not found')
        }

        if (!cancelled) {
          setStrategy(strategyData[0])
          setTrades(tradeData)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load strategy')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [strategyId, supabaseUrl, anonKey, missingEnv])

  if (error && !strategy) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <h1 className="text-2xl font-semibold">Strategy not available</h1>
        <p className="text-slate-400 mt-2">{error}</p>
      </main>
    )
  }

  if (loading || !strategy) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <h1 className="text-2xl font-semibold">Loading...</h1>
      </main>
    )
  }

  return <StrategyDetail strategy={strategy} trades={trades} />
}
