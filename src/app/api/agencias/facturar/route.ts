import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServer } from '@/lib/supabase-server'

// «Facturar pago N» de una agencia: crea la factura con crear_factura_pago() en la base de datos,
// que pone el número correlativo, el IVA/retención según el país y la marca en una sola operación.
export async function POST(req: NextRequest) {
  const cookie = cookies().get('joux_auth')?.value
  if (!cookie || !process.env.APP_PASSWORD || cookie !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { proyecto_id, pago } = await req.json().catch(() => ({}))
  if (!Number.isInteger(proyecto_id) || (pago !== 1 && pago !== 2)) {
    return NextResponse.json({ error: 'Faltan el proyecto o el pago' }, { status: 400 })
  }
  const { data, error } = await supabaseServer.rpc('crear_factura_pago', { p_proyecto: proyecto_id, p_pago: pago })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ factura: data })
}
