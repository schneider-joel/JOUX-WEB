// Bienvenida al aceptar (solo servidor): un solo email por Gmail con el alias de la marca que lleva la
// carpeta de Drive ({{drive_url}}) y, en las webs de precio cerrado, la factura del pago 1 en PDF.
// La factura sale de crear_factura_pago() (número correlativo, IVA/retención por país, bloqueos de
// datos fiscales y ROI). Un proyecto de prueba factura con fiscal = false y número PRUEBA-… (ver schema.sql).
// Nunca se llama sola: solo desde «Emitir y enviar», después de la vista previa.
import { supabaseServer as sb } from '@/lib/supabase-server'
import { plantillaProyecto } from '@/lib/emails-proyecto'
import { pendientes } from '@/lib/emails'
import { enviarGmail } from '@/lib/gmail'
import { aHtml } from '@/lib/resend'
import { remitenteLead } from '@/lib/remitentes'
import { desglose } from '@/lib/importes'
import { pdfFactura } from '@/lib/pdf'
import { nombreArchivoFactura } from '@/app/invoice/[id]/nombre-archivo'

const CLAVE = 'proyecto.bienvenida'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// El enlace de respaldo va siempre a producción: desde local, un localhost no le sirve al cliente.
const PUBLICA = 'https://joux-web.vercel.app'
export const PREFIJO_PRUEBA = 'PRUEBA · sin validez fiscal · '

const dinero = (n: number, idioma: string) => new Intl.NumberFormat(idioma === 'en' ? 'en-GB' : 'es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(n)

export type FacturaBienvenida = {
  id: number | null              // null = aún no existe (se crea al pulsar «Emitir y enviar»)
  numero: string                 // el real si existe; si no, el que tendrá
  base: number; iva: number; ret: number; total: number
  espana: boolean                // dentro_ue: IVA 21 % y retención 15 %
  prueba: boolean
}
export type VistaBienvenida = {
  remitente: string; para: string; asunto: string; cuerpo: string
  factura: FacturaBienvenida | null   // null = sin factura al aceptar (web sin precio cerrado)
  bloqueo: string | null              // por qué no se puede emitir (datos fiscales, ROI, email…)
  enviada: string | null              // fecha si la bienvenida ya salió por aquí
  drive: boolean
}

// Número que pondrá siguiente_numero_factura(): el F-AAAA-N más alto + 1 (sin llamarla, que lo guarda).
async function numeroPrevisto() {
  const prefijo = `F-${new Date().getFullYear()}-`
  const { data } = await sb.from('facturas').select('numero').like('numero', `${prefijo}%`)
  const max = (data || []).reduce((m, f) => Math.max(m, Number(f.numero?.match(/^F-\d{4}-(\d+)$/)?.[1]) || 0), 0)
  return `${prefijo}${max + 1}`
}

export async function vistaBienvenida(id: number): Promise<VistaBienvenida | { error: string; status: number }> {
  const { data: p } = await sb.from('proyectos').select('id, cliente, marca, idioma, precio_cerrado, prueba, contacto_email, drive_url').eq('id', id).maybeSingle()
  if (!p) return { error: 'No existe el proyecto', status: 404 }
  const idioma = p.idioma === 'en' ? 'en' : 'es'
  const remitente = remitenteLead(p.marca || '', idioma)
  if (!remitente) return { error: 'Esta marca no tiene remitente de Gmail', status: 400 }

  let factura: FacturaBienvenida | null = null, bloqueo: string | null = null
  if (p.precio_cerrado != null) {
    const { data: f } = await sb.from('facturas').select('id, numero, importe, tipo_factura').eq('proyecto_id', p.id).eq('pago', 1).maybeSingle()
    let base: number, espana: boolean, numero: string
    if (f) {
      base = Number(f.importe); espana = f.tipo_factura === 'dentro_ue'; numero = f.numero || ''
    } else {
      // Los mismos bloqueos que crear_factura_pago(), para verlos antes de pulsar.
      const { data: cf } = await sb.from('clientes_fiscales').select('pais').eq('cliente', p.cliente).maybeSingle()
      if (!cf?.pais) bloqueo = `Faltan los datos fiscales de ${p.cliente}`
      else if (cf.pais === 'UE') bloqueo = 'Cliente de la UE: sin alta en el ROI, consúltalo con el gestor antes de facturar'
      base = Math.round(Number(p.precio_cerrado) / 2 * 100) / 100
      espana = cf?.pais === 'ES'
      numero = p.prueba ? `PRUEBA-${p.id}-1` : await numeroPrevisto()
    }
    const d = desglose(base, espana)
    factura = { id: f?.id ?? null, numero, base, iva: d?.iva ?? 0, ret: d?.ret ?? 0, total: d?.total ?? base, espana, prueba: !!p.prueba }
  }

  const t = await plantillaProyecto(id, CLAVE, { vars: factura ? { factura_numero: factura.numero, factura_total: dinero(factura.total, idioma) } : {} })
  if ('error' in t) return { error: String(t.error), status: Number(t.status) || 500 }
  const para = p.contacto_email?.trim() || ''
  if (!bloqueo && !EMAIL.test(para)) bloqueo = 'El proyecto no tiene un email de contacto válido'
  const faltan = pendientes(t.asunto + t.cuerpo)
  if (!bloqueo && faltan.length) bloqueo = `La plantilla tiene sin rellenar ${faltan.join(', ')}`

  const { data: ya } = await sb.from('mensajes').select('enviado_en').eq('proyecto_id', p.id).eq('plantilla', CLAVE).eq('estado', 'enviado').eq('canal', 'gmail').limit(1).maybeSingle()
  return {
    remitente, para, asunto: (p.prueba ? PREFIJO_PRUEBA : '') + t.asunto, cuerpo: t.cuerpo,
    factura, bloqueo, enviada: ya ? ya.enviado_en || 'enviando' : null, drive: !!p.drive_url,
  }
}

// «Emitir y enviar»: crea la factura del pago 1 (si toca y no existe), la imprime en PDF y manda la bienvenida.
// Si el email falla, la factura queda creada y el reintento la reutiliza (nunca crea otra).
export async function enviarBienvenida(id: number, origen: string): Promise<{ ok: true; factura: string | null; pdf: boolean } | { error: string; status: number }> {
  const v = await vistaBienvenida(id)
  if ('error' in v) return v
  if (v.enviada) return { error: 'La bienvenida ya se envió', status: 409 }
  if (v.bloqueo) return { error: v.bloqueo, status: 400 }
  const { data: p } = await sb.from('proyectos').select('id, cliente, idioma, lead_id, fase, prueba').eq('id', id).single()
  if (!p) return { error: 'No existe el proyecto', status: 404 }
  const idioma = p.idioma === 'en' ? 'en' : 'es'

  // Se reserva el envío antes de nada (estado «enviado», sin id de Gmail): un segundo toque choca con
  // `enviada` y el tick no lo confunde con un envío hecho a mano desde Gmail.
  const { data: fila, error: errM } = await sb.from('mensajes').insert({
    proyecto_id: id, lead_id: p.lead_id, direccion: 'saliente', estado: 'enviado', plantilla: CLAVE, generado_por: 'plantilla',
    canal: 'gmail', remitente: v.remitente, para: v.para, asunto: v.asunto, cuerpo: v.cuerpo,
  }).select('id').single()
  if (errM || !fila) return { error: errM?.message || 'No se pudo preparar el envío', status: 500 }
  const fallo = async (error: string, status = 502) => {
    await sb.from('mensajes').update({ estado: 'error', error }).eq('id', fila.id)
    return { error, status }
  }

  let factura: { id: number; numero: string; importe: number; tipo_factura: string } | null = null
  if (v.factura) {
    if (v.factura.id) {
      const { data } = await sb.from('facturas').select('id, numero, importe, tipo_factura').eq('id', v.factura.id).single()
      factura = data
    } else {
      const { data, error } = await sb.rpc('crear_factura_pago', { p_proyecto: id, p_pago: 1 })
      if (error || !data) { await sb.from('mensajes').delete().eq('id', fila.id); return { error: error?.message || 'No se pudo crear la factura', status: 400 } }
      factura = data
      await sb.from('eventos').insert({ proyecto_id: id, lead_id: p.lead_id, tipo: 'factura.emitida', fuente: 'joux-hub', datos: { factura_id: data.id, numero: data.numero, pago: 1, base: Number(data.importe), prueba: !!p.prueba } })
    }
  }

  // PDF de la vista pública; si no se puede, el email lleva el enlace a la factura.
  let pdf: Buffer | null = null
  if (factura) pdf = await pdfFactura(origen, factura.id).catch(e => { console.error('bienvenida pdf', e?.message); return null })
  const d = factura ? desglose(Number(factura.importe), factura.tipo_factura === 'dentro_ue') : null
  const t = await plantillaProyecto(id, CLAVE, {
    vars: factura ? {
      factura_numero: factura.numero, factura_total: dinero(d?.total ?? Number(factura.importe), idioma),
      factura_url: pdf ? null : `${PUBLICA}/invoice/${factura.id}`,
    } : {},
  })
  if ('error' in t) return fallo(String(t.error), Number(t.status) || 500)
  const asunto = (p.prueba ? PREFIJO_PRUEBA : '') + t.asunto

  try {
    const r = await enviarGmail({
      de: v.remitente, para: v.para, asunto, texto: t.cuerpo, html: aHtml(t.cuerpo),
      adjuntos: pdf && factura ? [{ nombre: `${nombreArchivoFactura(factura.numero, p.cliente)}.pdf`, tipo: 'application/pdf', datos: pdf }] : [],
    })
    const ahora = new Date().toISOString()
    await sb.from('mensajes').update({ id_proveedor: r.id, enviado_en: ahora, asunto, cuerpo: t.cuerpo, error: null }).eq('id', fila.id)
    // Hilo nuevo (otro asunto): el lead pasa a seguir este, así el tick lee las respuestas a la bienvenida.
    if (p.lead_id) await sb.from('leads').update({ gmail_hilo: r.hilo, ultimo_contacto: ahora, updated_at: ahora }).eq('id', p.lead_id)
    await sb.from('eventos').insert({ proyecto_id: id, lead_id: p.lead_id, tipo: 'mensaje.enviado', fuente: 'joux-hub', datos: { mensaje_id: fila.id, plantilla: CLAVE, de: v.remitente, para: v.para, asunto, factura: factura?.numero ?? null, pdf: !!pdf } })
    // La bienvenida pide el material: el proyecto pasa a esa etapa.
    if (!p.fase || p.fase === 'confirmado') {
      await sb.from('proyectos').update({ fase: 'material' }).eq('id', id)
      await sb.from('eventos').insert({ proyecto_id: id, lead_id: p.lead_id, tipo: 'proyecto.fase', fuente: 'joux-hub', datos: { de: p.fase, a: 'material' } })
    }
    return { ok: true, factura: factura?.numero ?? null, pdf: !!pdf }
  } catch (e) {
    return fallo(`No se envió: ${(e as Error)?.message || 'Gmail no respondió'}`)
  }
}
