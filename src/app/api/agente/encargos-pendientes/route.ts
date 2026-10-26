import { NextRequest, NextResponse } from 'next/server'
import { fuenteDeClave } from '@/lib/intake'
import { CLAVE_AGENTE } from '@/lib/agente'
import { encargosPendientes } from '@/lib/encargos-pendientes'
import { TIPOS_ENCARGO } from '@/lib/primera-version'
import type { TipoEncargo } from '@/lib/seguimiento'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const maxDuration = 60

// Encargos de un tipo: ?tipo=custom (agente /web-custom de Arkevo), ?tipo=treatment (agente de Pitchview) o
// ?tipo=carta (agente /montar-carta de Cartela, con `local: {id, slug, nombre, plan, url_carta}`);
// también ?tipo=diseno (lo mismo que webs-pendientes). Pública en el middleware: valida INTAKE_KEY_AGENTE.
// Responde con web-empezada / web-lista / web-error. Contrato en automatizacion.md («Encargos custom y treatment»).
export async function GET(req: NextRequest) {
  if (!fuenteDeClave(req.headers.get('authorization'), CLAVE_AGENTE)) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })
  const tipo = req.nextUrl.searchParams.get('tipo') as TipoEncargo
  if (!TIPOS_ENCARGO.includes(tipo)) return NextResponse.json({ error: 'tipo_invalido', campo: 'tipo', validos: TIPOS_ENCARGO }, { status: 400 })
  try {
    const encargos = await encargosPendientes(tipo, req.nextUrl.searchParams.get('proyecto_id'))
    return NextResponse.json({ encargos, caducan_en: 3600 })
  } catch (e: any) {
    console.error('agente/encargos-pendientes', e?.message)
    return NextResponse.json({ error: 'interno' }, { status: 500 })
  }
}
