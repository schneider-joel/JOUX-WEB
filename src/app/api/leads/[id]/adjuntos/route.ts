import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { leerMensaje } from '@/lib/gmail'
import { avisarMaterial, guardarAdjuntos } from '@/lib/prueba-gratis'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const maxDuration = 60

// Vuelve a leer de Gmail las respuestas del lead que se guardaron sin adjuntos (p. ej. antes de que el
// tick los guardara) y las procesa como el tick: fotos al bucket `leads` y, si toca, `material.recibido`.
// Protegida por la cookie del hub. No duplica: solo mira mensajes con adjuntos = [].
export async function POST(_: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const { data: lead } = Number.isInteger(id) ? await sb.from('leads').select('id, marca, nombre, empresa, email, interes, campos, proyecto_id').eq('id', id).maybeSingle() : { data: null }
  if (!lead) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const { data: mensajes } = await sb.from('mensajes').select('id, id_proveedor').eq('lead_id', id).eq('direccion', 'entrante').eq('canal', 'gmail').eq('adjuntos', '[]').not('id_proveedor', 'is', null)
  let guardados = 0, material = 0
  try {
    for (const m of mensajes || []) {
      const leido = await leerMensaje(m.id_proveedor!)
      if (!leido.adjuntos.length) continue
      const g = await guardarAdjuntos(lead.id, m.id, leido.id, leido.adjuntos)
      guardados += g.length
      if (await avisarMaterial(lead, m.id, g)) material++
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Gmail no respondió', guardados, material }, { status: 502 })
  }
  return NextResponse.json({ revisados: mensajes?.length || 0, guardados, material })
}
