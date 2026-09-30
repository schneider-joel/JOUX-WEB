import { supabaseServer as supabase } from '@/lib/supabase-server'
import { grupoDeKey } from '@/lib/timesheets'
import { NoEncontrado, TimesheetPublico } from '../../t/cargar'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function TaysHansPage({ params }: { params: { token: string } }) {
  const { data: cfg } = await supabase.from('configuracion').select('valor').eq('clave', 'timesheet_th_public_token').single()
  if (!cfg?.valor || cfg.valor !== params.token) return <NoEncontrado />
  return <TimesheetPublico grupo={grupoDeKey('th')} />
}
