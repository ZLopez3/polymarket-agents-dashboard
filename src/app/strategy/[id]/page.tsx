import { supabase } from '@/lib/supabaseClient'
import StrategyDetail from './StrategyDetail'

export const dynamic = 'force-dynamic'

export default async function StrategyPage({ params }: { params: { id: string } }) {
  const strategyId = params.id

  const { data: strategies } = await supabase.from('strategies').select('*').eq('id', strategyId).limit(1)
  const strategy = strategies?.[0]

  const { data: trades } = await supabase
    .from('trades')
    .select('*')
    .eq('strategy_id', strategyId)
    .order('executed_at', { ascending: true })

  if (!strategy) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <h1 className="text-2xl font-semibold">Strategy not found</h1>
      </main>
    )
  }

  return <StrategyDetail strategy={strategy} trades={trades || []} />
}
