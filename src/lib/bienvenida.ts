// Emails al aceptar una web (solo servidor), por Gmail con el alias de la marca:
// - `proyecto.bienvenida`: carpeta de Drive ({{drive_url}}) y, si el cliente ya tiene ficha fiscal, la
//   factura del pago 1 en PDF; si no la tiene, el enlace al formulario de datos fiscales ({{datos_url}}).
//   Treatments de The Pitch Lab: sin factura (se cobra todo a la entrega, desde el timesheet), solo el
//   formulario de datos fiscales si el cliente es nuevo.
// - `factura.pago`: cuando el cliente ha mandado sus datos, la factura del pago 1, en el mismo hilo.
// - `entrega.final` (rediseño comercial, 2026-10-26): la entrega con la factura del pago 2 (50 % al publicar)
//   en el hilo del lead, y el QR en Cartela. Sustituye a «Facturar pago 2» + un email aparte.
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
import { MARCAS_TREATMENT } from '@/lib/seguimiento'
import { qrCartela } from '@/lib/emails-proyecto'
import { pilotoActivo } from '@/lib/autonomia'
import { encargarWeb } from '@/lib/primera-version'

export const CLAVES_INICIO = ['proyecto.bienvenida', 'factura.pago', 'entrega.final'] as const
export type ClaveInicio = typeof CLAVES_INICIO[number]
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Los enlaces van siempre a producción: desde local, un localhost no le sirve al cliente.
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
  clave: ClaveInicio
  remitente: string; para: string; asunto: string; cuerpo: string
  factura: FacturaBienvenida | null   // null = este email no lleva factura
  datos_url: string | null            // formulario de datos fiscales, si la bienvenida lo pide
  bloqueo: string | null              // por qué no se puede emitir (datos fiscales, ROI, email…)
  enviada: string | null              // fecha si este email ya salió por aquí
  drive: boolean
  cambios: boolean                    // Cartela: lleva el enlace de cambios (sin Drive)
  a_la_entrega: boolean               // treatment: se factura entero a la entrega (sin factura ahora)
}

// Número que pondrá siguiente_numero_factura(): el F-AAAA-N más alto + 1 (sin llamarla, que lo guarda).
async function numeroPrevisto() {
  const prefijo = `F-${new Date().getFullYear()}-`
  const { data } = await sb.from('facturas').select('numero').like('numero', `${prefijo}%`)
  const max = (data || []).reduce((m, f) => Math.max(m, Number(f.numero?.match(/^F-\d{4}-(\d+)$/)?.[1]) || 0), 0)
  return `${prefijo}${max + 1}`
}

export async function vistaBienvenida(id: number, clave: ClaveInicio = 'proyecto.bienvenida'): Promise<VistaBienvenida | { error: string; status: number }> {
  const { data: p } = await sb.from('proyectos').select('id, cliente, marca, idioma, precio_cerrado, prueba, contacto_email, drive_url, token_fiscal, lead_id').eq('id', id).maybeSingle()
  if (!p) return { error: 'No existe el proyecto', status: 404 }
  const idioma = p.idioma === 'en' ? 'en' : 'es'
  const remitente = remitenteLead(p.marca || '', idioma)
  if (!remitente) return { error: 'Esta marca no tiene remitente de Gmail', status: 400 }
  const esEntrega = clave === 'entrega.final'
  // La entrega va con la factura del pago 2; como la del pago 1, necesita los datos fiscales.
  const esFactura = clave === 'factura.pago' || esEntrega
  const pago = esEntrega ? 2 : 1

  let factura: FacturaBienvenida | null = null, bloqueo: string | null = null, datos_url: string | null = null
  if (p.precio_cerrado != null) {
    const [{ data: f }, { data: cf }] = await Promise.all([
      sb.from('facturas').select('id, numero, importe, tipo_factura').eq('proyecto_id', p.id).eq('pago', pago).maybeSingle(),
      sb.from('clientes_fiscales').select('pais').eq('cliente', p.cliente).maybeSingle(),
    ])
    // Sin ficha fiscal y con formulario: la bienvenida pide los datos y la factura va después.
    const porFormulario = !f && !cf?.pais && !!p.token_fiscal
    if (!esFactura && porFormulario) datos_url = `${PUBLICA}/datos/${p.token_fiscal}`
    else if (esFactura && porFormulario) bloqueo = `${p.cliente} aún no ha enviado sus datos fiscales`
    if (!(!esFactura && porFormulario)) {
      let base: number, espana: boolean, numero: string
      if (f) {
        base = Number(f.importe); espana = f.tipo_factura === 'dentro_ue'; numero = f.numero || ''
      } else {
        // Los mismos bloqueos que crear_factura_pago(), para verlos antes de pulsar.
        if (!bloqueo && !cf?.pais) bloqueo = `Faltan los datos fiscales de ${p.cliente}`
        else if (!bloqueo && cf?.pais === 'UE') bloqueo = 'Cliente de la UE: sin alta en el ROI, consúltalo con el gestor antes de facturar'
        base = Math.round(Number(p.precio_cerrado) / 2 * 100) / 100
        espana = cf?.pais === 'ES'
        numero = p.prueba ? `PRUEBA-${p.id}-${pago}` : await numeroPrevisto()
      }
      const d = desglose(base, espana)
      factura = { id: f?.id ?? null, numero, base, iva: d?.iva ?? 0, ret: d?.ret ?? 0, total: d?.total ?? base, espana, prueba: !!p.prueba }
    }
  } else if (esFactura) return { error: 'Este proyecto no es de precio cerrado', status: 400 }
  else if (p.token_fiscal) {
    // Treatment (o web sin precio cerrado) con cliente nuevo: el formulario va en la bienvenida.
    const { data: cf } = await sb.from('clientes_fiscales').select('pais').eq('cliente', p.cliente).maybeSingle()
    if (!cf?.pais) datos_url = `${PUBLICA}/datos/${p.token_fiscal}`
  }

  const t = await plantillaProyecto(id, clave, {
    vars: { datos_url, ...(factura ? { factura_numero: factura.numero, factura_total: dinero(factura.total, idioma) } : {}) },
  })
  if ('error' in t) return { error: String(t.error), status: Number(t.status) || 500 }
  const para = p.contacto_email?.trim() || ''
  if (!bloqueo && !EMAIL.test(para)) bloqueo = 'El proyecto no tiene un email de contacto válido'
  const faltan = pendientes(t.asunto + t.cuerpo)
  if (!bloqueo && faltan.length) bloqueo = `La plantilla tiene sin rellenar ${faltan.join(', ')}`

  // La factura va en el hilo de la bienvenida: «Re: <asunto de la bienvenida>». La entrega, en el hilo del lead
  // (enviarGmail le pone el asunto del hilo).
  let asunto = t.asunto
  if (clave === 'factura.pago') {
    const { data: b } = await sb.from('mensajes').select('asunto').eq('proyecto_id', p.id).eq('plantilla', 'proyecto.bienvenida').eq('estado', 'enviado').eq('canal', 'gmail').limit(1).maybeSingle()
    if (b?.asunto) asunto = `Re: ${b.asunto.replace(/^re:\s*/i, '')}`
  }
  if (p.prueba && !asunto.includes(PREFIJO_PRUEBA)) asunto = PREFIJO_PRUEBA + asunto

  const { data: ya } = await sb.from('mensajes').select('enviado_en').eq('proyecto_id', p.id).eq('plantilla', clave).eq('estado', 'enviado').eq('canal', 'gmail').limit(1).maybeSingle()
  return {
    clave, remitente, para, asunto, cuerpo: t.cuerpo, factura, datos_url,
    bloqueo, enviada: ya ? ya.enviado_en || 'enviando' : null, drive: !!p.drive_url, cambios: p.marca === 'cartela',
    a_la_entrega: p.precio_cerrado == null && MARCAS_TREATMENT.includes(p.marca || ''),
  }
}

// «Emitir y enviar»: crea la factura del pago 1 (si toca y no existe), la imprime en PDF y manda el email.
// Si el email falla, la factura queda creada y el reintento la reutiliza (nunca crea otra).
export async function enviarBienvenida(id: number, origen: string, clave: ClaveInicio = 'proyecto.bienvenida'): Promise<{ ok: true; factura: string | null; pdf: boolean } | { error: string; status: number }> {
  const v = await vistaBienvenida(id, clave)
  if ('error' in v) return v
  if (v.enviada) return { error: 'Este email ya se envió', status: 409 }
  if (v.bloqueo) return { error: v.bloqueo, status: 400 }
  const { data: p } = await sb.from('proyectos').select('id, cliente, marca, idioma, lead_id, fase, prueba').eq('id', id).single()
  if (!p) return { error: 'No existe el proyecto', status: 404 }
  const idioma = p.idioma === 'en' ? 'en' : 'es'
  const { data: lead } = p.lead_id ? await sb.from('leads').select('gmail_hilo').eq('id', p.lead_id).maybeSingle() : { data: null }

  // Se reserva el envío antes de nada (estado «enviado», sin id de Gmail): un segundo toque choca con
  // `enviada` y el tick no lo confunde con un envío hecho a mano desde Gmail.
  const { data: fila, error: errM } = await sb.from('mensajes').insert({
    proyecto_id: id, lead_id: p.lead_id, direccion: 'saliente', estado: 'enviado', plantilla: clave, generado_por: 'plantilla',
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
      const pago = clave === 'entrega.final' ? 2 : 1
      const { data, error } = await sb.rpc('crear_factura_pago', { p_proyecto: id, p_pago: pago })
      if (error || !data) { await sb.from('mensajes').delete().eq('id', fila.id); return { error: error?.message || 'No se pudo crear la factura', status: 400 } }
      factura = data
      await sb.from('eventos').insert({ proyecto_id: id, lead_id: p.lead_id, tipo: 'factura.emitida', fuente: 'joux-hub', datos: { factura_id: data.id, numero: data.numero, pago, base: Number(data.importe), prueba: !!p.prueba } })
    }
  }

  // PDF de la vista pública; si no se puede, el email lleva el enlace a la factura.
  let pdf: Buffer | null = null
  if (factura) pdf = await pdfFactura(origen, factura.id).catch(e => { console.error('bienvenida pdf', e?.message); return null })
  const d = factura ? desglose(Number(factura.importe), factura.tipo_factura === 'dentro_ue') : null
  const t = await plantillaProyecto(id, clave, {
    vars: {
      datos_url: v.datos_url,
      ...(factura ? {
        factura_numero: factura.numero, factura_total: dinero(d?.total ?? Number(factura.importe), idioma),
        factura_url: pdf ? null : `${PUBLICA}/invoice/${factura.id}`,
      } : {}),
    },
  })
  if ('error' in t) return fallo(String(t.error), Number(t.status) || 500)
  // La bienvenida abre hilo nuevo; la factura y la entrega responden en el del lead.
  const hilo = clave === 'proyecto.bienvenida' ? null : lead?.gmail_hilo ?? null
  // Cartela: el QR para imprimir va con la entrega.
  const qr = clave === 'entrega.final' ? await qrCartela(id).catch(() => null) : null

  try {
    const r = await enviarGmail({
      de: v.remitente, para: v.para, asunto: v.asunto, texto: t.cuerpo, html: aHtml(t.cuerpo), hilo, mismoAsunto: clave === 'entrega.final',
      adjuntos: [...(pdf && factura ? [{ nombre: `${nombreArchivoFactura(factura.numero, p.cliente)}.pdf`, tipo: 'application/pdf', datos: pdf }] : []), ...(qr ? [qr] : [])],
    })
    const ahora = new Date().toISOString()
    await sb.from('mensajes').update({ id_proveedor: r.id, enviado_en: ahora, cuerpo: t.cuerpo, asunto: r.asunto, error: null }).eq('id', fila.id)
    // El lead sigue el hilo de estos emails, así el tick lee las respuestas del cliente.
    if (p.lead_id) await sb.from('leads').update({ gmail_hilo: r.hilo, ultimo_contacto: ahora, updated_at: ahora }).eq('id', p.lead_id)
    // Entrega: fuera los borradores de «Entrega final» sin factura que hubiera preparado un aviso, y la web a «entregado».
    if (clave === 'entrega.final') {
      await sb.from('mensajes').update({ estado: 'descartado' }).eq('proyecto_id', id).eq('plantilla', 'entrega.final').eq('estado', 'borrador')
      if (p.fase && !['entregado', 'cerrado'].includes(p.fase)) {
        await sb.from('proyectos').update({ fase: 'entregado' }).eq('id', id)
        await sb.from('eventos').insert({ proyecto_id: id, lead_id: p.lead_id, tipo: 'proyecto.fase', fuente: 'joux-hub', datos: { de: p.fase, a: 'entregado', motivo: 'entrega enviada' } })
      }
    }
    await sb.from('eventos').insert({ proyecto_id: id, lead_id: p.lead_id, tipo: 'mensaje.enviado', fuente: 'joux-hub', datos: { mensaje_id: fila.id, plantilla: clave, de: v.remitente, para: v.para, asunto: v.asunto, factura: factura?.numero ?? null, pdf: !!pdf, datos_fiscales: !!v.datos_url } })
    // La bienvenida pide el material: el proyecto pasa a esa etapa.
    if (clave === 'proyecto.bienvenida' && (!p.fase || p.fase === 'confirmado')) {
      await sb.from('proyectos').update({ fase: 'material' }).eq('id', id)
      await sb.from('eventos').insert({ proyecto_id: id, lead_id: p.lead_id, tipo: 'proyecto.fase', fuente: 'joux-hub', datos: { de: p.fase, a: 'material' } })
      // Piloto «Comenzar las pruebas»: la factura de prueba nunca se cobra en el banco, así que un proyecto de prueba
      // empieza (fase comenzado + encargo al agente) al enviar la bienvenida, como si el pago 1 ya estuviera cobrado.
      if (p.prueba && await pilotoActivo(p.marca || '', 'comenzar_prueba')) await comenzarPrueba(id, p.lead_id).catch(e => console.error('piloto comenzar', e?.message))
    }
    return { ok: true, factura: factura?.numero ?? null, pdf: !!pdf }
  } catch (e) {
    return fallo(`No se envió: ${(e as Error)?.message || 'Gmail no respondió'}`)
  }
}

async function comenzarPrueba(id: number, leadId: number | null) {
  const { data: movido } = await sb.from('proyectos').update({ fase: 'comenzado' }).eq('id', id).eq('fase', 'material').select('id').maybeSingle()
  if (!movido) return
  await sb.from('eventos').insert({ proyecto_id: id, lead_id: leadId, tipo: 'proyecto.fase', fuente: 'piloto', datos: { de: 'material', a: 'comenzado', motivo: 'prueba: pago 1 simulado' } })
  await encargarWeb(id, null, 'piloto')
}
