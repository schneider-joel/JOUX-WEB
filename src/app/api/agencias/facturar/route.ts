import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { crearFacturaPago } from '@/lib/factura-pago'

// «Facturar pago N» de una agencia: crea la factura con crear_factura_pago() en la base de datos (vía
// crearFacturaPago(), que la pasa a EUR si el proyecto va en USD), que pone el número correlativo, el IVA/retención según el país y la marca en una sola operación.
export async function POST(req: NextRequest) {
  const cookie = cookies().get('joux_auth')?.value
  if (!cookie || !process.env.APP_PASSWORD || cookie !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { proyecto_id, pago } = await req.json().catch(() => ({}))
  if (!Number.isInteger(proyecto_id) || (pago !== 1 && pago !== 2)) {
    return NextResponse.json({ error: 'Faltan el proyecto o el pago' }, { status: 400 })
  }
  const { data, error } = await crearFacturaPago(proyecto_id, pago)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ factura: data })
}
