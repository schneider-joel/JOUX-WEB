import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { fuenteDeClave } from '@/lib/intake'
import { CLAVE_AGENTE, cuerpoAgente, idProyecto } from '@/lib/agente'
import { proyectoAgente } from '@/lib/primera-version'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

const json = (body: unknown, status: number) => NextResponse.json(body, { status })

// El agente empieza a montar la web: evento `web.empezada` («Montándose» en /proyectos). Mientras sea
// reciente, la web no sale en webs-pendientes (dos pasadas de la tarea no montan lo mismo). Sin push.
export async function POST(req: NextRequest) {
  if (!fuenteDeClave(req.headers.get('authorization'), CLAVE_AGENTE)) return json({ error: 'no_autorizado' }, 401)
  const b = await cuerpoAgente(req)
  if (b === 'grande') return json({ error: 'demasiado_grande' }, 413)
  if (!b) return json({ error: 'json_invalido', campo: '' }, 400)
  const id = idProyecto(b.proyecto_id)
  if (!id) return json({ error: 'proyecto_invalido', campo: 'proyecto_id' }, 400)
  try {
    const r = await proyectoAgente(id)
    if ('error' in r) return json({ error: r.error }, r.status)
    if (r.estado?.estado !== 'encargada' && r.estado?.estado !== 'montandose') return json({ error: 'sin_encargo' }, 409)
    await sb.from('eventos').insert({ proyecto_id: r.p.id, lead_id: r.p.lead_id, tipo: 'web.empezada', fuente: 'agente-web', datos: {} })
    return json({ ok: true }, 200)
  } catch (e: any) {
    console.error('agente/web-empezada', e?.message)
    return json({ error: 'interno' }, 500)
  }
}
