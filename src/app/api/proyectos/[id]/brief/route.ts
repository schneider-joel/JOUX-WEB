import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { encargarWeb, tipoEncargo } from '@/lib/primera-version'
import { faltaBrief, type Brief } from '@/lib/seguimiento'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

const corto = (v: unknown, max = 1000) => typeof v === 'string' ? v.trim().slice(0, max) : ''

// Brief de dirección de una web custom de Arkevo (cookie del hub). Se guarda en proyectos.brief y, si la web
// ya está en «Comenzado» sin encargo, crea el encargo para el agente de custom.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { data: p } = await sb.from('proyectos').select('id, marca, plan, fase, lead_id').eq('id', params.id).maybeSingle()
  if (!p) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const { data: lead } = p.lead_id ? await sb.from('leads').select('interes, campos').eq('id', p.lead_id).maybeSingle() : { data: null }
  if (tipoEncargo(p, lead) !== 'custom') return NextResponse.json({ error: 'Solo las webs custom de Arkevo llevan brief' }, { status: 400 })
  const brief: Brief = {
    referencias: Array.isArray(b.referencias) ? b.referencias.map((r: unknown) => corto(r, 500)).filter(Boolean) : [],
    tono: corto(b.tono), tipografia: corto(b.tipografia), colores: corto(b.colores), paginas: corto(b.paginas, 2000), notas: corto(b.notas, 2000),
    guardado_en: new Date().toISOString(),
  }
  const falta = faltaBrief(brief)
  if (falta) return NextResponse.json({ error: falta }, { status: 400 })
  const { error } = await sb.from('proyectos').update({ brief }).eq('id', p.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await sb.from('eventos').insert({ proyecto_id: p.id, lead_id: p.lead_id, tipo: 'brief.guardado', fuente: 'joux-hub', datos: { referencias: brief.referencias.length } })
  // «Comenzar» ya pulsado y esperando brief: ahora sí arranca el agente.
  const encargo = p.fase === 'comenzado' ? await encargarWeb(p.id, null).catch(e => ({ omitido: String(e?.message) })) : null
  return NextResponse.json({ ok: true, encargo })
}
