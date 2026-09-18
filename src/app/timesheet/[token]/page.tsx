import { createClient } from '@supabase/supabase-js'
import PublicTimesheetView from './public-view'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    global: {
      fetch: (url, options = {}) =>
        fetch(url, {
          ...options,
          cache: 'no-store',
          headers: {
            ...(options.headers || {}),
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        }),
    },
  }
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

  const { data: proyectos } = await supabase.from('proyectos').select('*').eq('tipo', 'ambushed_boldmove').order('created_at')
  const { data: dias } = await supabase.from('dias_trabajados').select('*').order('fecha')
  const { data: facturas } = await supabase.from('facturas').select('id, proyecto_id').eq('origen', 'timesheet')

  return <PublicTimesheetView proyectos={proyectos || []} dias={dias || []} facturas={facturas || []} />
}
