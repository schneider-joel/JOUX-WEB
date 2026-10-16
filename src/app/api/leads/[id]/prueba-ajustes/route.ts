import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { rondaDe } from '@/lib/prueba-gratis'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// «Pedir ajustes al agente» en la ficha (cookie del hub): Joel confirma lo que hay que cambiar y queda
// el evento `prueba.ajustes` (ronda 2). El agente lo recoge en /api/agente/pruebas-pendientes.
// Una sola ronda de ajustes por prueba (proceso-cliente.md §2); el índice único lo asegura.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const b = await req.json().catch(() => null)
  const peticion = typeof b?.peticion === 'string' ? b.peticion.trim().slice(0, 4000) : ''
  if (!peticion) return NextResponse.json({ error: 'Escribe qué hay que cambiar' }, { status: 400 })
  const mensajeId = Number.isInteger(b?.mensaje_id) ? b.mensaje_id : null

  const { data: lead } = Number.isInteger(id) ? await sb.from('leads').select('id').eq('id', id).maybeSingle() : { data: null }
  if (!lead) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const { data: listas } = await sb.from('eventos').select('datos').eq('lead_id', id).eq('tipo', 'prueba.lista')
  if (!(listas || []).some(e => rondaDe(e.datos) === 1)) return NextResponse.json({ error: 'Aún no hay prueba publicada' }, { status: 409 })

  const { error } = await sb.from('eventos').insert({ lead_id: id, tipo: 'prueba.ajustes', fuente: 'joux-hub', datos: { ronda: 2, peticion, ...(mensajeId ? { mensaje_id: mensajeId } : {}) } })
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Esta prueba ya tuvo su ronda de ajustes' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
