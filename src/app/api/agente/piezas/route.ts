import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { fuenteDeClave } from '@/lib/intake'
import { CLAVE_AGENTE, cuerpoAgente, idProyecto } from '@/lib/agente'
import { proyectoAgente } from '@/lib/primera-version'
import { BUCKET_CARTELA } from '@/lib/cartela-cambios'
import { PIEZAS, esPieza, rutaPieza } from '@/lib/cartela-piezas'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const json = (body: unknown, status: number) => NextResponse.json(body, { status })
// Una pieza por llamada: con un logo en imagen cada PDF puede pasar de 500 KB, así que no van en web-lista (512 KB).
// 1,5 MB de PDF son 2 MB en base64, lejos del límite de cuerpo de Vercel (4,5 MB).
const MAX_PDF = 1536 * 1024, MAX_CUERPO = 2100 * 1024

// Cartela: el agente sube cada pieza con QR de la carta (pegatina, display y cartel, en PDF) al publicarla, antes de
// web-lista. Quedan en cartela/piezas/<slug>/<pieza>.pdf y van adjuntas a la entrega (src/lib/cartela-piezas.ts).
// Sin evento ni push: si se repite, la pieza se sustituye.
export async function POST(req: NextRequest) {
  if (!fuenteDeClave(req.headers.get('authorization'), CLAVE_AGENTE)) return json({ error: 'no_autorizado' }, 401)
  const b = await cuerpoAgente(req, MAX_CUERPO)
  if (b === 'grande') return json({ error: 'demasiado_grande' }, 413)
  if (!b) return json({ error: 'json_invalido', campo: '' }, 400)
  const id = idProyecto(b.proyecto_id)
  if (!id) return json({ error: 'proyecto_invalido', campo: 'proyecto_id' }, 400)
  if (!esPieza(b.pieza)) return json({ error: 'pieza_invalida', campo: 'pieza', validas: Object.keys(PIEZAS) }, 400)
  const pdf = typeof b.pdf === 'string' ? Buffer.from(b.pdf.replace(/^data:application\/pdf;base64,/, ''), 'base64') : null
  if (!pdf || pdf.length > MAX_PDF || pdf.subarray(0, 5).toString('latin1') !== '%PDF-') return json({ error: 'pdf_invalido', campo: 'pdf' }, 400)

  try {
    const r = await proyectoAgente(id)
    if ('error' in r) return json({ error: r.error }, r.status)
    if (r.p.marca !== 'cartela') return json({ error: 'no_es_cartela' }, 400)
    const { data: local } = await sb.from('cartela_locales').select('slug').eq('proyecto_id', r.p.id).maybeSingle()
    if (!local?.slug) return json({ error: 'sin_local' }, 409)
    const ruta = rutaPieza(local.slug, b.pieza)
    const { error } = await sb.storage.from(BUCKET_CARTELA).upload(ruta, pdf, { contentType: 'application/pdf', upsert: true })
    if (error) throw new Error(error.message)
    return json({ ok: true, ruta, bytes: pdf.length }, 201)
  } catch (e: any) {
    console.error('agente/piezas', e?.message)
    return json({ error: 'interno' }, 500)
  }
}
