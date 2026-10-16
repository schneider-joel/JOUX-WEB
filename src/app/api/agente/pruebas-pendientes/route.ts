import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { fuenteDeClave } from '@/lib/intake'
import { CLAVE_AGENTE } from '@/lib/agente'
import { disenoDelLead, estudioDelLead, slugDiseno, urlsFirmadas, type AdjuntoMensaje } from '@/lib/prueba-gratis'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// Leads con material para la prueba gratis y aún sin prueba lista. Pública en el middleware: valida
// INTAKE_KEY_AGENTE. Un `prueba.error` la saca de la lista hasta que llegue material nuevo.
// Contrato en automatizacion.md («Agente de prueba gratis»).
export async function GET(req: NextRequest) {
  if (!fuenteDeClave(req.headers.get('authorization'), CLAVE_AGENTE)) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })
  try {
    const { data: eventos } = await sb.from('eventos').select('lead_id, tipo, created_at').in('tipo', ['material.recibido', 'prueba.lista', 'prueba.error']).not('lead_id', 'is', null)
    const porLead = new Map<number, { material?: string; lista?: boolean; error?: string }>()
    for (const e of eventos || []) {
      const x = porLead.get(e.lead_id!) || {}
      if (e.tipo === 'prueba.lista') x.lista = true
      else if (e.tipo === 'material.recibido') x.material = !x.material || e.created_at > x.material ? e.created_at : x.material
      else x.error = !x.error || e.created_at > x.error ? e.created_at : x.error
      porLead.set(e.lead_id!, x)
    }
    // ?lead_id=15 limita la lista a ese lead (el agente lo usa al lanzarlo a mano para un cliente).
    const solo = req.nextUrl.searchParams.get('lead_id')
    const ids = Array.from(porLead).filter(([id, x]) => x.material && !x.lista && (!x.error || x.error < x.material) && (!solo || String(id) === solo)).map(([id]) => id)
    if (!ids.length) return NextResponse.json({ pruebas: [] })

    const [{ data: leads }, { data: mensajes }] = await Promise.all([
      sb.from('leads').select('id, marca, idioma, nombre, empresa, email, interes, campos, mensaje').in('id', ids),
      sb.from('mensajes').select('id, lead_id, cuerpo, enviado_en, created_at, adjuntos').in('lead_id', ids).eq('direccion', 'entrante').order('created_at', { ascending: true }),
    ])
    const adjuntos = (mensajes || []).flatMap(m => ((m.adjuntos || []) as AdjuntoMensaje[]).map(a => ({ ...a, mensaje_id: m.id, lead_id: m.lead_id })))
    const urls = await urlsFirmadas(adjuntos.map(a => a.ruta))
    const conUrl = adjuntos.map((a, i) => ({ ...a, url: urls[i] }))

    const pruebas = (leads || []).map(l => {
      const diseno = disenoDelLead(l)
      return {
        lead_id: l.id, marca: l.marca, idioma: l.idioma === 'en' ? 'en' : 'es',
        estudio: estudioDelLead(l), nombre: l.nombre, email: l.email,
        diseno, diseno_slug: diseno ? slugDiseno(diseno) : null,
        material_recibido_en: porLead.get(l.id)!.material,
        formulario: l.mensaje || null, interes: l.interes || {}, campos: l.campos || {},
        mensajes: (mensajes || []).filter(m => m.lead_id === l.id).map(m => ({ id: m.id, fecha: m.enviado_en || m.created_at, texto: m.cuerpo })),
        adjuntos: conUrl.filter(a => a.lead_id === l.id && a.url).map(a => ({
          mensaje_id: a.mensaje_id, nombre: a.nombre, tipo: a.tipo, bytes: a.bytes, en_linea: !!a.en_linea, url: a.url,
        })),
      }
    }).sort((a, b) => a.material_recibido_en!.localeCompare(b.material_recibido_en!))
    return NextResponse.json({ pruebas, caducan_en: 3600 })
  } catch (e: any) {
    console.error('agente/pruebas-pendientes', e?.message)
    return NextResponse.json({ error: 'interno' }, { status: 500 })
  }
}
