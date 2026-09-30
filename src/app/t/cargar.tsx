import { supabaseServer as supabase } from '@/lib/supabase-server'
import type { GrupoTimesheet } from '@/lib/timesheets'
import PublicTimesheetView from './view'

export const NoEncontrado = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif', color: '#888', background: '#f5f5f5' }}>
    Not found
  </div>
)

// Vista pública de solo lectura del timesheet de un grupo de clientes.
export async function TimesheetPublico({ grupo }: { grupo: GrupoTimesheet }) {
  const { data: proyectos } = await supabase.from('proyectos').select('*').in('cliente', grupo.clientes)
  const ids = (proyectos || []).map(p => p.id)
  const [diasRes, facturasRes] = ids.length
    ? await Promise.all([
        supabase.from('dias_trabajados').select('*').in('proyecto_id', ids),
        supabase.from('facturas').select('id, proyecto_id').eq('origen', 'timesheet').in('proyecto_id', ids),
      ])
    : [{ data: [] }, { data: [] }]

  return (
    <PublicTimesheetView
      titulo={grupo.label}
      clientes={grupo.clientes}
      proyectos={proyectos || []}
      dias={diasRes.data || []}
      facturas={facturasRes.data || []}
    />
  )
}
