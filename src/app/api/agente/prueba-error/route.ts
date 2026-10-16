import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { fuenteDeClave } from '@/lib/intake'
import { CLAVE_AGENTE, cuerpoAgente, idLead } from '@/lib/agente'
import { notificar } from '@/lib/push'
import { estudioDelLead } from '@/lib/prueba-gratis'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

const json = (body: unknown, status: number) => NextResponse.json(body, { status })

// El agente no pudo montar la prueba (fotos inservibles, falta el logo…): evento `prueba.error` y push.
// El lead sale de /api/agente/pruebas-pendientes hasta que el cliente mande material nuevo.
export async function POST(req: NextRequest) {
  if (!fuenteDeClave(req.headers.get('authorization'), CLAVE_AGENTE)) return json({ error: 'no_autorizado' }, 401)
  const b = await cuerpoAgente(req)
  if (b === 'grande') return json({ error: 'demasiado_grande' }, 413)
  if (!b) return json({ error: 'json_invalido', campo: '' }, 400)
  const leadId = idLead(b.lead_id)
  if (!leadId) return json({ error: 'lead_invalido', campo: 'lead_id' }, 400)
  const motivo = typeof b.motivo === 'string' ? b.motivo.trim().slice(0, 1000) : ''
  if (!motivo) return json({ error: 'motivo_invalido', campo: 'motivo' }, 400)

  try {
    const { data: lead } = await sb.from('leads').select('id, nombre, empresa, email').eq('id', leadId).maybeSingle()
    if (!lead) return json({ error: 'lead_desconocido' }, 404)
    await sb.from('eventos').insert({ lead_id: lead.id, tipo: 'prueba.error', fuente: 'agente-prueba', datos: { motivo } })
    await notificar({
      titulo: `No se pudo montar la prueba de ${estudioDelLead(lead)}`,
      cuerpo: motivo.slice(0, 140),
      url: `/leads/${lead.id}`,
      etiqueta: `lead-${lead.id}`,
    }).catch(e => console.error('agente/prueba-error push', e?.message))
    return json({ ok: true }, 200)
  } catch (e: any) {
    console.error('agente/prueba-error', e?.message)
    return json({ error: 'interno' }, 500)
  }
}
