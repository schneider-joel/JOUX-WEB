// Prueba gratis de las webs (Arkevo y futuras agencias): el cliente elige un diseño, manda logo y fotos
// respondiendo al email, y el agente /prueba-gratis le monta la portada en 48 h. Solo servidor.
// Contrato de las rutas del agente en automatizacion.md («Agente de prueba gratis»).
import { supabaseServer as sb } from '@/lib/supabase-server'
import { descargarAdjunto, type AdjuntoGmail } from '@/lib/gmail'
import { notificar } from '@/lib/push'

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

// ── Estado de la prueba (ficha del lead) ─────────────────────────────────────

export type EstadoPrueba = {
  material: string | null                 // fecha del último material.recibido
  lista: { fecha: string; url: string | null; diseno: string | null } | null
  error: { fecha: string; motivo: string } | null  // solo si es posterior al último material
  enviada: string | null                  // fecha en que salió el email prueba.lista
}

export function estadoPrueba(
  eventos: { tipo: string; datos: Record<string, unknown>; created_at: string }[],
  mensajes: { plantilla?: string | null; estado: string; enviado_en: string | null }[],
): EstadoPrueba | null {
  const ultimo = (tipo: string) => eventos.filter(e => e.tipo === tipo).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const material = ultimo('material.recibido'), lista = ultimo('prueba.lista'), error = ultimo('prueba.error')
  if (!material && !lista && !error) return null
  const enviado = mensajes.find(m => m.plantilla === 'prueba.lista' && m.estado === 'enviado')
  return {
    material: material?.created_at ?? null,
    lista: lista ? { fecha: lista.created_at, url: typeof lista.datos.url === 'string' ? lista.datos.url : null, diseno: typeof lista.datos.diseno === 'string' ? lista.datos.diseno : null } : null,
    error: error && !lista && (!material || error.created_at > material.created_at) ? { fecha: error.created_at, motivo: String(error.datos.motivo ?? '') } : null,
    enviada: enviado ? enviado.enviado_en : null,
  }
}
