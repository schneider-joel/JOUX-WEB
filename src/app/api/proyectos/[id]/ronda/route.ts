import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// «Ya he aplicado los cambios» de una ronda (ficha del proyecto): comentada → cerrada. Lo demás de las
// rondas (abrir la siguiente, entregar) sigue llegando por el aviso de arkevo-revision en /api/intake/evento.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { ronda } = await req.json().catch(() => ({}))
  if (typeof ronda !== 'string' || !ronda.trim() || ronda.length > 20) return NextResponse.json({ error: 'Ronda inválida' }, { status: 400 })
  const id = Number(params.id)
  const { data: p } = await sb.from('proyectos').select('id, lead_id').eq('id', id).maybeSingle()
  if (!p) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const { data: rev } = await sb.from('revisiones').select('id, estado, abierta_en').eq('proyecto_id', id).eq('ronda', ronda.trim()).maybeSingle()
  if (!rev) return NextResponse.json({ error: 'Esa ronda no existe' }, { status: 404 })
  if (rev.estado === 'cerrada') return NextResponse.json({ ok: true, duplicado: true })
  // Condicional: si entretanto llegó otro aviso y la ronda ya no está comentada, no se pisa.
  const { data: fila, error } = await sb.from('revisiones').update({ estado: 'cerrada' }).eq('id', rev.id).eq('estado', 'comentada').select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!fila) return NextResponse.json({ error: 'La ronda no tiene comentarios por aplicar' }, { status: 409 })
  await sb.from('eventos').insert({ proyecto_id: id, lead_id: p.lead_id, tipo: 'revision.aplicada', fuente: 'joux-hub', datos: { ronda: ronda.trim() } })
  // Los emails de esta ronda o de las anteriores ya no tocan (si se enviaran, repetirían la ronda).
  // `mensajes` no guarda la ronda: cuenta como suyo lo creado antes de que se abriera la siguiente.
  const { data: siguiente } = await sb.from('revisiones').select('abierta_en').eq('proyecto_id', id).gt('abierta_en', rev.abierta_en).order('abierta_en').limit(1).maybeSingle()
  let viejos = sb.from('mensajes').update({ estado: 'descartado' }).eq('proyecto_id', id).eq('estado', 'borrador').in('plantilla', ['revision.lista', 'revision.recordatorio'])
  if (siguiente) viejos = viejos.lt('created_at', siguiente.abierta_en)
  const { data: descartados } = await viejos.select('id')
  return NextResponse.json({ ok: true, descartados: (descartados || []).length })
}
