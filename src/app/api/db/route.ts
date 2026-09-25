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
  'clientes_fiscales', 'compras',
])

export async function POST(req: NextRequest) {
  const cookie = cookies().get('joux_auth')?.value
  if (!cookie || !process.env.APP_PASSWORD || cookie !== process.env.APP_PASSWORD) {
    return NextResponse.json({ data: null, error: { message: 'No autorizado' } }, { status: 401 })
  }

  try {
    const body = await req.json()
    // Lote: varias consultas en una sola invocación (el dashboard carga ~10
    // tablas de golpe; mandarlas una por una disparaba 10 funciones
    // serverless en paralelo y colgaba la carga).
    if (Array.isArray(body.batch)) {
      const results = await Promise.all(body.batch.map(ejecutar))
      return NextResponse.json({ results })
    }
    return NextResponse.json(await ejecutar(body))
  } catch (e: any) {
    return NextResponse.json({ data: null, error: { message: e.message || 'Error' } }, { status: 500 })
  }
}

async function ejecutar(spec: any): Promise<{ data: any; error: { message: string } | null }> {
  const { table, op, columns, payload, filters, order, returning, single, maybeSingle } = spec
  if (!TABLAS_PERMITIDAS.has(table)) return { data: null, error: { message: `Tabla no permitida: ${table}` } }

  let q: any = supabaseServer.from(table)
  if (op === 'select') q = q.select(columns || '*')
  else if (op === 'insert') q = q.insert(payload)
  else if (op === 'update') q = q.update(payload)
  else if (op === 'upsert') q = q.upsert(payload)
  else if (op === 'delete') q = q.delete()
  else return { data: null, error: { message: `Operación inválida: ${op}` } }

  for (const f of filters || []) q = q.eq(f.col, f.val)
  if (returning && op !== 'select') q = q.select(columns || '*')
  if (order) q = q.order(order.col, { ascending: order.ascending !== false })
  if (single) q = q.single()
  else if (maybeSingle) q = q.maybeSingle()

  const { data, error } = await q
  return { data, error: error ? { message: error.message } : null }
}
