import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServer } from '@/lib/supabase-server'

// Proxy de datos protegido por la contraseña de la app. El navegador ya no
// habla con Supabase directo: manda acá {table, op, ...} y esto lo ejecuta
// server-side con la service_role key. El middleware ya exige el cookie
// joux_auth para /api/db, pero lo revalidamos igual acá por las dudas.
const TABLAS_PERMITIDAS = new Set([
  'cuentas', 'crypto', 'facturas', 'presupuesto_fijos', 'presupuesto_variables',
  'configuracion', 'proyectos', 'dias_trabajados', 'patrimonio_snapshots',
  'clientes_fiscales',
])

export async function POST(req: NextRequest) {
  const cookie = cookies().get('joux_auth')?.value
  if (!cookie || !process.env.APP_PASSWORD || cookie !== process.env.APP_PASSWORD) {
    return NextResponse.json({ data: null, error: { message: 'No autorizado' } }, { status: 401 })
  }

  try {
    const { table, op, columns, payload, filters, order, returning, single, maybeSingle } = await req.json()

    if (!TABLAS_PERMITIDAS.has(table)) {
      return NextResponse.json({ data: null, error: { message: `Tabla no permitida: ${table}` } }, { status: 400 })
    }

    let q: any = supabaseServer.from(table)
    if (op === 'select') q = q.select(columns || '*')
    else if (op === 'insert') q = q.insert(payload)
    else if (op === 'update') q = q.update(payload)
    else if (op === 'upsert') q = q.upsert(payload)
    else if (op === 'delete') q = q.delete()
    else return NextResponse.json({ data: null, error: { message: `Operación inválida: ${op}` } }, { status: 400 })

    for (const f of filters || []) q = q.eq(f.col, f.val)
    if (returning && op !== 'select') q = q.select(columns || '*')
    if (order) q = q.order(order.col, { ascending: order.ascending !== false })
    if (single) q = q.single()
    else if (maybeSingle) q = q.maybeSingle()

    const { data, error } = await q
    return NextResponse.json({ data, error: error ? { message: error.message } : null })
  } catch (e: any) {
    return NextResponse.json({ data: null, error: { message: e.message || 'Error' } }, { status: 500 })
  }
}
