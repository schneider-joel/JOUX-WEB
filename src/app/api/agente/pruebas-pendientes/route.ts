import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { fuenteDeClave } from '@/lib/intake'
import { CLAVE_AGENTE } from '@/lib/agente'
import { disenoDelLead, estudioDelLead, rondaDe, slugDiseno, tipoPorNombre, urlsFirmadas, type AdjuntoMensaje } from '@/lib/prueba-gratis'
import type { Adjunto } from '@/lib/leads'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// Encargos pendientes del agente de prueba gratis. Pública en el middleware: valida INTAKE_KEY_AGENTE.
// - `tipo: "nueva"` (ronda 1): hay `material.recibido` y aún no hay `prueba.lista`.
// - `tipo: "ajustes"` (ronda 2): Joel pidió la ronda de ajustes (`prueba.ajustes`) y aún no hay la versión 2.
// Un `prueba.error` posterior al encargo lo saca de la lista hasta que llegue un encargo nuevo.
// Contrato en automatizacion.md («Agente de prueba gratis»).
type Encargo = { material?: string; ajustes?: { fecha: string; peticion: string; mensaje_id: number | null }; lista1?: string; lista2?: boolean; error?: string }

export async function GET(req: NextRequest) {
  if (!fuenteDeClave(req.headers.get('authorization'), CLAVE_AGENTE)) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })
  try {
    const { data: eventos } = await sb.from('eventos').select('lead_id, tipo, datos, created_at').in('tipo', ['material.recibido', 'prueba.lista', 'prueba.ajustes', 'prueba.error']).not('lead_id', 'is', null).order('created_at', { ascending: true })
    const porLead = new Map<number, Encargo>()
    // En orden de fecha: cada uno pisa al anterior del mismo tipo, así queda el último.
    for (const e of eventos || []) {
      const x = porLead.get(e.lead_id!) || {}
      const d = (e.datos || {}) as Record<string, unknown>
      if (e.tipo === 'material.recibido') x.material = e.created_at
      else if (e.tipo === 'prueba.ajustes') x.ajustes = { fecha: e.created_at, peticion: String(d.peticion ?? ''), mensaje_id: typeof d.mensaje_id === 'number' ? d.mensaje_id : null }
      else if (e.tipo === 'prueba.lista') { if (rondaDe(d) === 2) x.lista2 = true; else x.lista1 = typeof d.url === 'string' ? d.url : '' }
      else x.error = e.created_at
      porLead.set(e.lead_id!, x)
    }
    const tipoDe = (x: Encargo) => {
      if (x.ajustes && x.lista1 != null && !x.lista2) return !x.error || x.error < x.ajustes.fecha ? 'ajustes' : null
      if (x.material && x.lista1 == null) return !x.error || x.error < x.material ? 'nueva' : null
      return null
    }
    // ?lead_id=15 limita la lista a ese lead (el agente lo usa al lanzarlo a mano para un cliente).
    const solo = req.nextUrl.searchParams.get('lead_id')
    const ids = Array.from(porLead).filter(([id, x]) => tipoDe(x) && (!solo || String(id) === solo)).map(([id]) => id)
    if (!ids.length) return NextResponse.json({ pruebas: [], caducan_en: 3600 })

    const [{ data: leads }, { data: mensajes }] = await Promise.all([
      sb.from('leads').select('id, marca, idioma, nombre, empresa, email, interes, campos, mensaje, adjuntos').in('id', ids),
      sb.from('mensajes').select('id, lead_id, cuerpo, enviado_en, created_at, adjuntos').in('lead_id', ids).eq('direccion', 'entrante').order('created_at', { ascending: true }),
    ])
    const adjuntos = (mensajes || []).flatMap(m => ((m.adjuntos || []) as AdjuntoMensaje[]).map(a => ({ ...a, mensaje_id: m.id, lead_id: m.lead_id })))
    const urls = await urlsFirmadas(adjuntos.map(a => a.ruta))
    const conUrl = adjuntos.map((a, i) => ({ ...a, url: urls[i] }))

    const pruebas = (leads || []).map(l => {
      const diseno = disenoDelLead(l)
      const x = porLead.get(l.id)!
      const tipo = tipoDe(x)!
      return {
        tipo, ronda: tipo === 'ajustes' ? 2 : 1,
        lead_id: l.id, marca: l.marca, idioma: l.idioma === 'en' ? 'en' : 'es',
        estudio: estudioDelLead(l), nombre: l.nombre, email: l.email,
        diseno, diseno_slug: diseno ? slugDiseno(diseno) : null,
        material_recibido_en: x.material ?? null,
        // Solo en los ajustes: lo que hay que cambiar (texto que Joel confirmó), el email del cliente y la prueba publicada.
        ...(tipo === 'ajustes' ? { peticion: x.ajustes!.peticion, peticion_mensaje_id: x.ajustes!.mensaje_id, ajustes_pedidos_en: x.ajustes!.fecha, url_actual: x.lista1 || null } : {}),
        formulario: l.mensaje || null, interes: l.interes || {}, campos: l.campos || {},
        mensajes: (mensajes || []).filter(m => m.lead_id === l.id).map(m => ({ id: m.id, fecha: m.enviado_en || m.created_at, texto: m.cuerpo })),
        // Primero lo del formulario (enlaces al R2 de la marca, con su caducidad), luego lo de los emails.
        adjuntos: [
          ...((l.adjuntos || []) as Adjunto[]).filter(a => !a.caduca || new Date(a.caduca) > new Date()).flatMap(a => {
            const nombre = a.nombre || decodeURIComponent(new URL(a.url).pathname.split('/').pop() || 'adjunto')
            const tipo = tipoPorNombre(nombre)
            return tipo ? [{ origen: 'formulario', mensaje_id: null, nombre, tipo, bytes: a.bytes ?? null, en_linea: false, url: a.url, caduca: a.caduca ?? null }] : []
          }),
          ...conUrl.filter(a => a.lead_id === l.id && a.url).map(a => ({
            origen: 'email', mensaje_id: a.mensaje_id, nombre: a.nombre, tipo: a.tipo, bytes: a.bytes, en_linea: !!a.en_linea, url: a.url!, caduca: null,
          })),
        ],
      }
    }).sort((a, b) => (a.ajustes_pedidos_en || a.material_recibido_en || '').localeCompare(b.ajustes_pedidos_en || b.material_recibido_en || ''))
    return NextResponse.json({ pruebas, caducan_en: 3600 })
  } catch (e: any) {
    console.error('agente/pruebas-pendientes', e?.message)
    return NextResponse.json({ error: 'interno' }, { status: 500 })
  }
}
