// Prueba gratis de las webs (Arkevo y futuras agencias): el cliente elige un diseño, manda logo y fotos
// respondiendo al email, y el agente /prueba-gratis le monta la portada en 48 h. Solo servidor.
// Contrato de las rutas del agente en automatizacion.md («Agente de prueba gratis»).
import { supabaseServer as sb } from '@/lib/supabase-server'
import { descargarAdjunto, type AdjuntoGmail } from '@/lib/gmail'
import { notificar } from '@/lib/push'
import type { Adjunto } from '@/lib/leads'

// La colección de diseños de Arkevo. El formulario manda el slug (interes.diseno = 'lino') o el nombre.
export const DISENOS = ['Lino', 'Pedra', 'Cota Cero', 'Umbral', 'NAVE', 'Cimbra'] as const
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
export const disenoValido = (v: unknown) => typeof v === 'string' ? DISENOS.find(d => slug(d) === slug(v)) ?? null : null
export const slugDiseno = slug

export function disenoDelLead(l: { interes?: Record<string, unknown> | null; campos?: Record<string, unknown> | null }) {
  return disenoValido(l.interes?.diseno) || disenoValido(l.interes?.elegido) || disenoValido(l.campos?.plan)
}

export const estudioDelLead = (l: { empresa?: string | null; nombre?: string | null; email: string }) => l.empresa || l.nombre || l.email

// ── Adjuntos de las respuestas ───────────────────────────────────────────────

export const BUCKET_LEADS = 'leads'
const MAX_BYTES = 25 * 1024 * 1024
// Por extensión: Gmail a veces manda las HEIC del iPhone como application/octet-stream.
const TIPOS: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', svg: 'image/svg+xml', pdf: 'application/pdf',
}
// Las imágenes pequeñas pegadas en el cuerpo suelen ser la firma: se guardan, pero no cuentan como material.
const MIN_BYTES_FOTO_EN_LINEA = 20 * 1024

export type AdjuntoMensaje = { nombre: string; ruta: string; tipo: string; bytes: number; en_linea?: boolean }

const extension = (nombre: string) => nombre.split('.').pop()?.toLowerCase() || ''
export const esImagen = (a: { tipo: string }) => a.tipo.startsWith('image/')
export const cuentaComoFoto = (a: AdjuntoMensaje) => esImagen(a) && (!a.en_linea || a.bytes >= MIN_BYTES_FOTO_EN_LINEA)

// Nombre seguro para Storage (sin tildes, espacios ni barras), sin repetir dentro del mismo mensaje.
function nombreSeguro(nombre: string, usados: Set<string>) {
  const ext = extension(nombre)
  const base = nombre.slice(0, nombre.length - (ext ? ext.length + 1 : 0)).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'adjunto'
  let n = `${base}.${ext}`, i = 2
  while (usados.has(n)) n = `${base}-${i++}.${ext}`
  usados.add(n)
  return n
}

// Baja de Gmail los adjuntos de imagen y PDF de un mensaje entrante, los sube a `leads/<lead>/<mensaje>/`
// y los apunta en mensajes.adjuntos. Lo que no es imagen/PDF o pasa de 25 MB se ignora (queda en Gmail).
// Si uno falla, sigue con el resto: lo que no se guardó se ve igualmente en Gmail.
export async function guardarAdjuntos(leadId: number, mensajeId: number, gmailId: string, lista: AdjuntoGmail[]) {
  const usados = new Set<string>()
  const guardados: AdjuntoMensaje[] = []
  for (const a of lista) {
    const tipo = TIPOS[extension(a.nombre)]
    if (!tipo || a.bytes > MAX_BYTES) continue
    try {
      const datos = await descargarAdjunto(gmailId, a.idAdjunto)
      if (datos.length > MAX_BYTES) continue
      const nombre = nombreSeguro(a.nombre, usados)
      const ruta = `${leadId}/${mensajeId}/${nombre}`
      const { error } = await sb.storage.from(BUCKET_LEADS).upload(ruta, datos, { contentType: tipo, upsert: true })
      if (error) throw new Error(error.message)
      guardados.push({ nombre: a.nombre.slice(0, 200), ruta, tipo, bytes: datos.length, ...(a.enLinea ? { en_linea: true } : {}) })
    } catch (e) {
      console.error('adjunto', leadId, mensajeId, a.nombre, (e as Error)?.message)
    }
  }
  if (guardados.length) await sb.from('mensajes').update({ adjuntos: guardados }).eq('id', mensajeId)
  return guardados
}

// URL firmadas (por defecto 1 h) de varias rutas del bucket `leads`, en el mismo orden.
export async function urlsFirmadas(rutas: string[], segundos = 3600) {
  if (!rutas.length) return []
  const { data } = await sb.storage.from(BUCKET_LEADS).createSignedUrls(rutas, segundos)
  return rutas.map((_, i) => data?.[i]?.signedUrl || null)
}

// Respuestas del cliente y adjuntos (formulario + emails) de varios leads, como los recibe el agente.
// Primero lo del formulario (enlaces al R2 de la marca, con su caducidad), luego lo de los emails (URL de 1 h).
export async function materialDeLeads(leads: { id: number; adjuntos?: unknown }[]) {
  const ids = leads.map(l => l.id)
  const { data: mensajes } = ids.length
    ? await sb.from('mensajes').select('id, lead_id, cuerpo, enviado_en, created_at, adjuntos').in('lead_id', ids).eq('direccion', 'entrante').order('created_at', { ascending: true })
    : { data: [] }
  const adjuntos = (mensajes || []).flatMap(m => ((m.adjuntos || []) as AdjuntoMensaje[]).map(a => ({ ...a, mensaje_id: m.id, lead_id: m.lead_id })))
  const urls = await urlsFirmadas(adjuntos.map(a => a.ruta))
  const conUrl = adjuntos.map((a, i) => ({ ...a, url: urls[i] }))
  return new Map(leads.map(l => [l.id, {
    mensajes: (mensajes || []).filter(m => m.lead_id === l.id).map(m => ({ id: m.id, fecha: m.enviado_en || m.created_at, texto: m.cuerpo })),
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
  }]))
}

// ── Aviso de material ────────────────────────────────────────────────────────

type LeadMaterial = { id: number; marca: string; nombre: string | null; empresa?: string | null; email: string; interes?: Record<string, unknown> | null; campos?: Record<string, unknown> | null; proyecto_id?: number | null }

// Tipo de un archivo por su nombre (o por la ruta de su enlace), solo para los que se aceptan.
export const tipoPorNombre = (nombre: string) => TIPOS[extension(nombre)] || null

// Fotos que trae el formulario (adjuntos del lead, enlaces al R2 de la marca): por extensión.
export const fotosFormulario = (adjuntos: { nombre?: string | null; url: string }[] | null | undefined) =>
  (adjuntos || []).filter(a => (TIPOS[extension(a.nombre || new URL(a.url).pathname)] || '').startsWith('image/')).length

// Si un lead de una web con diseño elegido manda al menos una foto (en el formulario o al responder):
// evento `material.recibido` (uno por mensaje, o uno por el formulario) y push. No salta si ya es
// proyecto o si la prueba ya está lista: eso es otra cosa.
export async function avisarMaterial(lead: LeadMaterial, fotos: number, mensajeId: number | null, fuente: string) {
  if (!fotos || lead.proyecto_id) return false
  const diseno = disenoDelLead(lead)
  if (!diseno) return false
  const { data: marca } = await sb.from('marcas').select('modo').eq('key', lead.marca).maybeSingle()
  if (marca?.modo !== 'cerrado') return false
  const { count: lista } = await sb.from('eventos').select('id', { count: 'exact', head: true }).eq('lead_id', lead.id).eq('tipo', 'prueba.lista')
  if (lista) return false
  const previo = sb.from('eventos').select('id', { count: 'exact', head: true }).eq('lead_id', lead.id).eq('tipo', 'material.recibido')
  const { count: repetido } = await (mensajeId ? previo.eq('datos->>mensaje_id', String(mensajeId)) : previo.eq('datos->>origen', 'formulario'))
  if (repetido) return false
  await sb.from('eventos').insert({ lead_id: lead.id, tipo: 'material.recibido', fuente, datos: { ...(mensajeId ? { mensaje_id: mensajeId } : { origen: 'formulario' }), diseno, fotos } })
  await notificar({
    titulo: `Material de ${estudioDelLead(lead)} · prueba gratis en marcha`,
    cuerpo: `${fotos} foto${fotos === 1 ? '' : 's'} para la portada en ${diseno}${mensajeId ? '' : ' (desde el formulario)'}.`,
    url: `/leads/${lead.id}`,
    etiqueta: `lead-${lead.id}`,
  }).catch(e => console.error('material push', e?.message))
  return true
}

// ── Rondas ───────────────────────────────────────────────────────────────────

// Ronda 1 = la prueba; ronda 2 = la única ronda de ajustes (proceso-cliente.md §2). Los eventos
// `prueba.lista` antiguos no llevan ronda: son la 1.
export const MAX_RONDA = 2
export const rondaDe = (datos: Record<string, unknown> | null | undefined) => Number(datos?.ronda) === 2 ? 2 : 1
export const plantillaRonda = (ronda: number) => ronda === 2 ? 'prueba.ajustada' : 'prueba.lista'

// ── Estado de la prueba (ficha del lead) ─────────────────────────────────────

type EventoPrueba = { tipo: string; datos: Record<string, unknown>; created_at: string }
type Lista = { fecha: string; url: string | null; diseno: string | null }

export type EstadoPrueba = {
  material: string | null                 // fecha del último material.recibido
  lista: Lista | null                     // ronda 1
  enviada: string | null                  // fecha en que salió el email prueba.lista
  ajustes: { fecha: string; peticion: string } | null  // Joel pidió la ronda de ajustes
  ajustada: Lista | null                  // ronda 2
  ajustadaEnviada: string | null          // fecha en que salió el email prueba.ajustada
  error: { fecha: string; motivo: string } | null  // solo si es lo último que pasó y no hay versión posterior
}

export function estadoPrueba(
  eventos: EventoPrueba[],
  mensajes: { plantilla?: string | null; estado: string; enviado_en: string | null }[],
): EstadoPrueba | null {
  const ultimo = (tipo: string, ronda?: number) => eventos.filter(e => e.tipo === tipo && (ronda == null || rondaDe(e.datos) === ronda)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const material = ultimo('material.recibido'), error = ultimo('prueba.error'), ajustes = ultimo('prueba.ajustes')
  const lista = ultimo('prueba.lista', 1), ajustada = ultimo('prueba.lista', 2)
  if (!material && !lista && !error) return null
  const comoLista = (e?: EventoPrueba): Lista | null => e ? { fecha: e.created_at, url: typeof e.datos.url === 'string' ? e.datos.url : null, diseno: typeof e.datos.diseno === 'string' ? e.datos.diseno : null } : null
  const enviado = (plantilla: string) => mensajes.find(m => m.plantilla === plantilla && m.estado === 'enviado')?.enviado_en ?? null
  // El error cuenta si es posterior a lo que el agente tenía que hacer (material o ajustes) y no llegó versión después.
  const encargo = ajustes || material
  const pendiente = ajustes ? !ajustada : !lista
  return {
    material: material?.created_at ?? null,
    lista: comoLista(lista),
    enviada: enviado('prueba.lista'),
    ajustes: ajustes ? { fecha: ajustes.created_at, peticion: String(ajustes.datos.peticion ?? '') } : null,
    ajustada: comoLista(ajustada),
    ajustadaEnviada: enviado('prueba.ajustada'),
    error: error && pendiente && (!encargo || error.created_at > encargo.created_at) ? { fecha: error.created_at, motivo: String(error.datos.motivo ?? '') } : null,
  }
}
