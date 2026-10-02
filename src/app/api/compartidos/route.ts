import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { configCompartidos, quienEs } from '@/lib/compartidos-server'

export const dynamic = 'force-dynamic'

// Cuenta compartida. Joel (cookie del hub) puede todo; la pareja (token de su
// link) ve la cuenta, añade gastos y borra solo los que creó ella.
export async function GET(req: NextRequest) {
  const quien = await quienEs(req.nextUrl.searchParams.get('token'))
  if (!quien) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cfg = await configCompartidos()
  const { data, error } = await sb.from('gastos_compartidos').select('*').eq('anulado', false).gte('fecha', cfg.desde).order('fecha', { ascending: false }).order('id', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ quien, pareja: cfg.pareja, gastos: data, ...(quien === 'joel' ? { token: cfg.token } : {}) })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const quien = await quienEs(body.token)
  if (!quien) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const importe = Math.round(Number(body.importe) * 100) / 100
  if (!body.concepto || !body.fecha || !(importe > 0)) return NextResponse.json({ error: 'Faltan fecha, concepto o importe' }, { status: 400 })
  const fila = {
    tipo: body.tipo === 'liquidacion' ? 'liquidacion' : 'gasto',
    fecha: String(body.fecha).slice(0, 10),
    concepto: String(body.concepto).slice(0, 200),
    importe,
    pagador: body.pagador === 'pareja' ? 'pareja' : 'joel',
    reparto: body.reparto === 'otro' ? 'otro' : 'mitad',
    categoria: body.categoria ? String(body.categoria).slice(0, 60) : null,
    creado_por: quien,
  }
  if (body.id && quien === 'joel') {
    const { error } = await sb.from('gastos_compartidos').update(fila).eq('id', body.id)
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }
  const { error } = await sb.from('gastos_compartidos').insert([fila])
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const quien = await quienEs(p.get('token'))
  if (!quien) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: g } = await sb.from('gastos_compartidos').select('id,creado_por,movimiento_id').eq('id', Number(p.get('id'))).maybeSingle()
  if (!g) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  if (quien === 'pareja' && g.creado_por !== 'pareja') return NextResponse.json({ error: 'Solo puedes borrar los gastos que añadiste tú' }, { status: 403 })
  // Los que vienen del banco se anulan (si no, la sincronización los volvería a crear).
  const { error } = g.movimiento_id
    ? await sb.from('gastos_compartidos').update({ anulado: true }).eq('id', g.id)
    : await sb.from('gastos_compartidos').delete().eq('id', g.id)
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}
