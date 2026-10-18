import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { esFaseProyecto } from '@/lib/leads'
import { encargarWeb } from '@/lib/primera-version'
import { MARCAS_TREATMENT, fasesDe } from '@/lib/seguimiento'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// Fase de seguimiento a mano desde /proyectos. Solo toca `fase` (no `status`, que dispara facturas).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { fase, nota } = await req.json().catch(() => ({}))
  if (!esFaseProyecto(fase)) return NextResponse.json({ error: 'Fase inválida' }, { status: 400 })
  const { data: antes } = await sb.from('proyectos').select('fase, lead_id, marca').eq('id', params.id).maybeSingle()
  if (!antes) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  // Se siguen por etapas las webs (marcas de precio cerrado) y los treatments de The Pitch Lab.
  const { data: marca } = await sb.from('marcas').select('modo').eq('key', antes.marca ?? '').maybeSingle()
  if (marca?.modo !== 'cerrado' && !MARCAS_TREATMENT.includes(antes.marca || '')) return NextResponse.json({ error: 'Este proyecto no tiene etapas' }, { status: 400 })
  if (!fasesDe(antes.marca).includes(fase)) return NextResponse.json({ error: 'Esta etapa no existe para esta marca' }, { status: 400 })
  if (antes.fase === fase) return NextResponse.json({ ok: true })
  const { error } = await sb.from('proyectos').update({ fase }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await sb.from('eventos').insert({ proyecto_id: Number(params.id), lead_id: antes.lead_id, tipo: 'proyecto.fase', fuente: 'joux-hub', datos: { de: antes.fase, a: fase } })
  // «Comenzado» crea el encargo del agente que toque (diseño, custom con brief o treatment). Si no se
  // puede (sin agente, sin brief, falla), la fase ya está guardada y /proyectos enseña qué falta.
  let encargo = null
  if (fase === 'comenzado') encargo = await encargarWeb(Number(params.id), typeof nota === 'string' && nota.trim() ? nota.trim() : null)
    .catch(e => { console.error('fase encargo', e?.message); return { omitido: 'No se pudo crear el encargo' } })
  return NextResponse.json({ ok: true, encargo })
}
