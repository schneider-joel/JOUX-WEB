import { createClient } from '@supabase/supabase-js'
import PublicTimesheetView from './public-view'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function PublicTimesheetPage({ params }: { params: { token: string } }) {
  const { data: cfg } = await supabase.from('configuracion').select('valor').eq('clave', 'timesheet_public_token').single()

  if (!cfg?.valor || cfg.valor !== params.token) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif', color: '#888', background: '#f5f5f5' }}>
        Not found
      </div>
    )
  }

  const { data: proyectos, error: proyectosError } = await supabase.from('proyectos').select('*').eq('tipo', 'ambushed_boldmove').order('created_at')
  const { data: dias } = await supabase.from('dias_trabajados').select('*').order('fecha')
  const { data: facturas } = await supabase.from('facturas').select('id, proyecto_id').eq('origen', 'timesheet')
  const { count: rawCount, error: rawErr } = await supabase.from('proyectos').select('*', { count: 'exact', head: true })

  const rawUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/proyectos?select=id,nombre&_=${Date.now()}`
  let rawFetchCount: number | string = 'err'
  try {
    const r = await fetch(rawUrl, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        'Cache-Control': 'no-cache',
      },
      cache: 'no-store',
    })
    const j = await r.json()
    rawFetchCount = Array.isArray(j) ? j.length : JSON.stringify(j).slice(0, 100)
  } catch (e: any) {
    rawFetchCount = 'threw: ' + e.message
  }

  return (
    <>
      <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#aaa', padding: 8, background: '#fff' }}>
        DEBUG {new Date().toISOString()} · url={process.env.NEXT_PUBLIC_SUPABASE_URL} · key={(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').slice(0, 25)} · proyectos={proyectos?.length ?? 'null'} · rawCount={rawCount ?? 'null'} · error={proyectosError ? JSON.stringify(proyectosError) : 'none'} · rawErr={rawErr ? JSON.stringify(rawErr) : 'none'} · rawFetch={rawFetchCount}
      </div>
      <PublicTimesheetView proyectos={proyectos || []} dias={dias || []} facturas={facturas || []} />
    </>
  )
}
