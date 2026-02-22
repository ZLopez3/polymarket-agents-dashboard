import { notFound } from 'next/navigation'

import StrategyDetail from './StrategyDetail'
import type { Strategy, Trade } from '@/types/dashboard'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

interface StrategyPageProps {
  params: Promise<{ id: string }>
}

export const revalidate = 60
export const dynamic = 'force-dynamic'

export default async function StrategyPage({ params }: StrategyPageProps) {
  if (!supabaseAdmin) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <h1 className="text-2xl font-semibold">Strategy not available</h1>
        <p className="text-slate-400 mt-2">Missing Supabase credentials (SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL).</p>
      </main>
    )
  }

  const { id: strategyId } = await params
  if (!strategyId) {
    notFound()
  }

  const [{ data: strategy, error: strategyError }, { data: trades, error: tradesError }] = await Promise.all([
    supabaseAdmin.from('strategies').select('*').eq('id', strategyId).maybeSingle(),
    supabaseAdmin.from('trades').select('*').eq('strategy_id', strategyId).order('executed_at', { ascending: false }),
  ])

  if (strategyError || !strategy) {
    if (!strategy || strategyError?.code === 'PGRST116') {
      notFound()
    }
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <h1 className="text-2xl font-semibold">Strategy not available</h1>
        <p className="text-slate-400 mt-2">{strategyError?.message || 'Failed to load strategy data.'}</p>
      </main>
    )
  }

  if (tradesError) {
    console.error('Failed to load trades', tradesError)
  }

  return <StrategyDetail strategy={strategy as Strategy} trades={(trades ?? []) as Trade[]} />
}
