import { createClient } from '@supabase/supabase-js'
import PublicTimesheetView from './view'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (url, options = {}) =>
          fetch(url, { ...options, cache: 'no-store' }),
      },
    }
  )
}

export default async function AmbushedBoldMovePage({ params }: { params: { token: string } }) {
  const supabase = client()

  const { data: cfg } = await supabase.from('configuracion').select('valor').eq('clave', 'timesheet_public_token').single()

  if (!cfg?.valor || cfg.valor !== params.token) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif', color: '#888', background: '#f5f5f5' }}>
        Not found
      </div>
    )
  }

  const [proyectosRes, diasRes, facturasRes] = await Promise.all([
    supabase.from('proyectos').select('*').eq('tipo', 'ambushed_boldmove'),
    supabase.from('dias_trabajados').select('*'),
    supabase.from('facturas').select('id, proyecto_id').eq('origen', 'timesheet'),
  ])

  return (
    <PublicTimesheetView
      proyectos={proyectosRes.data || []}
      dias={diasRes.data || []}
      facturas={facturasRes.data || []}
    />
  )
}
