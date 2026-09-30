import { supabaseServer as supabase } from '@/lib/supabase-server'
import PublicTimesheetView from './view'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function TaysHansPage({ params }: { params: { token: string } }) {
  const { data: cfg } = await supabase.from('configuracion').select('valor').eq('clave', 'timesheet_th_public_token').single()

  if (!cfg?.valor || cfg.valor !== params.token) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif', color: '#888', background: '#f5f5f5' }}>
        Not found
      </div>
    )
  }

  const [proyectosRes, diasRes, facturasRes] = await Promise.all([
    supabase.from('proyectos').select('*').eq('tipo', 'tays_hans'),
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
