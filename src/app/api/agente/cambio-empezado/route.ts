import { NextRequest, NextResponse } from 'next/server'
import { fuenteDeClave } from '@/lib/intake'
import { CLAVE_AGENTE, cuerpoAgente, idLead } from '@/lib/agente'
import { cambioEmpezado } from '@/lib/cartela-agente'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const maxDuration = 30

const json = (body: unknown, status: number) => NextResponse.json(body, { status })

// El agente empieza un cambio: «En curso» en la bandeja (y en /cambios del cliente).
export async function POST(req: NextRequest) {
  if (!fuenteDeClave(req.headers.get('authorization'), CLAVE_AGENTE)) return json({ error: 'no_autorizado' }, 401)
  const b = await cuerpoAgente(req)
  if (b === 'grande') return json({ error: 'demasiado_grande' }, 413)
  if (!b) return json({ error: 'json_invalido', campo: '' }, 400)
  const id = idLead(b.peticion_id)
  if (!id) return json({ error: 'peticion_invalida', campo: 'peticion_id' }, 400)
  try {
    const r = await cambioEmpezado(id)
    return 'error' in r ? json({ error: r.error }, r.status) : json(r, 200)
  } catch (e: any) {
    console.error('agente/cambio-empezado', e?.message)
    return json({ error: 'interno' }, 500)
  }
}
