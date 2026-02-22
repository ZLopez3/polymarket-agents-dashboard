import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { AgentEvent, Agent } from '@/types/dashboard'

export const revalidate = 60
export const dynamic = 'force-dynamic'

function formatTs(ts: string | null | undefined) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  if (!supabaseAdmin) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <h1 className="text-2xl font-semibold">Events not available</h1>
        <p className="text-slate-400 mt-2">Missing Supabase credentials.</p>
      </main>
    )
  }

  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)
  const perPage = 50

  const [countRes, eventsRes, agentsRes] = await Promise.all([
    supabaseAdmin.from('events').select('id', { count: 'exact', head: true }),
    supabaseAdmin
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1),
    supabaseAdmin.from('agents').select('id, name'),
  ])

  const totalCount = countRes.count ?? 0
  const events = (eventsRes.data ?? []) as AgentEvent[]
  const agents = (agentsRes.data ?? []) as Agent[]
  const agentNameMap = agents.reduce<Record<string, string>>((acc, a) => {
    acc[a.id] = a.name
    return acc
  }, {})
  const totalPages = Math.ceil(totalCount / perPage)

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8 space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors">
        &larr; Back to Dashboard
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">All Events</h1>
          <p className="text-sm text-slate-400 mt-1">{totalCount} events total &middot; Page {page} of {totalPages}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-4 py-2 text-left">Agent</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-left">Severity</th>
              <th className="px-4 py-2 text-left">Message</th>
              <th className="px-4 py-2 text-left">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-t border-slate-800">
                <td className="px-4 py-2 whitespace-nowrap">{(event.agent_id && agentNameMap[event.agent_id]) || event.agent_id || 'System'}</td>
                <td className="px-4 py-2 whitespace-nowrap">{event.event_type}</td>
                <td className="px-4 py-2 whitespace-nowrap">{event.severity}</td>
                <td className="px-4 py-2 max-w-[500px]">
                  <div className="whitespace-pre-wrap break-words">{event.message}</div>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{formatTs(event.created_at)}</td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={5}>
                  No events found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav className="flex items-center justify-center gap-4" aria-label="Pagination">
        {page > 1 ? (
          <Link
            href={`/events?page=${page - 1}`}
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:bg-slate-800 transition-colors"
          >
            &larr; Previous
          </Link>
        ) : (
          <span className="rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-600 cursor-not-allowed">
            &larr; Previous
          </span>
        )}
        <span className="text-sm text-slate-400">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={`/events?page=${page + 1}`}
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:bg-slate-800 transition-colors"
          >
            Next &rarr;
          </Link>
        ) : (
          <span className="rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-600 cursor-not-allowed">
            Next &rarr;
          </span>
        )}
      </nav>
    </main>
  )
}
