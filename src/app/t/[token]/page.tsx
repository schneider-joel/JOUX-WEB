import { supabaseServer as supabase } from '@/lib/supabase-server'
import { TOKEN_CLIENTE, grupoDeCliente } from '@/lib/timesheets'
import { NoEncontrado, TimesheetPublico } from '../cargar'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Link público del timesheet de un cliente suelto: el token se guarda en
// configuracion como "timesheet_token:<cliente>".
export default async function TimesheetClientePage({ params }: { params: { token: string } }) {
  const { data: cfg } = await supabase.from('configuracion').select('clave').eq('valor', params.token).like('clave', `${TOKEN_CLIENTE}%`).maybeSingle()
  if (!cfg?.clave) return <NoEncontrado />
  return <TimesheetPublico grupo={grupoDeCliente(cfg.clave.slice(TOKEN_CLIENTE.length))} />
}
