// Carpeta de Google Drive de cada web (solo servidor), en el Drive de joel@joelschneider.io con el mismo
// token que Gmail. Con `drive.file` la app solo ve lo que crea ella: el resto del Drive queda fuera.
//   Clientes/<Marca>/<Cliente> · <Proyecto>/ + subcarpetas de la marca, compartida con el contacto como
//   editor y sin el email de Google (el enlace va en nuestra bienvenida, {{drive_url}}).
import { supabaseServer as sb } from '@/lib/supabase-server'
import { accessToken, permisosGoogle } from '@/lib/gmail'
import { notificar } from '@/lib/push'
import { SUBCARPETAS, rutaCarpeta } from '@/lib/drive-carpetas'
import { repetirPasada } from '@/lib/primera-version'

const API = 'https://www.googleapis.com/drive/v3'
const CARPETA = 'application/vnd.google-apps.folder'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Errores de Google en palabras de Joel (lo que se ve en la ficha junto a «Reintentar»).
function motivo(status: number, msg: string) {
  if (/insufficient.*scope/i.test(msg)) return 'Al token de Google le falta el permiso de Drive (drive.file)'
  if (/has not been used|is disabled/i.test(msg)) return 'La Google Drive API no está activada en el proyecto joux-hub'
  if (/no Google account|not have a Google account|notify people/i.test(msg)) return 'Ese email no tiene cuenta de Google: no se puede compartir sin aviso (que mande un WeTransfer)'
  if (/invalid.*(email|sharing request)/i.test(msg)) return 'Google no acepta ese email para compartir'
  return `Drive respondió ${status}: ${msg}`
}

async function drive<T = any>(ruta: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(motivo(r.status, j?.error?.message || ''))
  return j
}

const comillas = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

// Busca la carpeta por nombre dentro de `padre` (solo ve las que creó la app) y si no está la crea.
async function carpeta(nombre: string, padre: string): Promise<{ id: string; webViewLink: string }> {
  const q = `name = '${comillas(nombre)}' and mimeType = '${CARPETA}' and '${padre}' in parents and trashed = false`
  const j = await drive(`/files?${new URLSearchParams({ q, fields: 'files(id,webViewLink)', spaces: 'drive', pageSize: '1' })}`)
  if (j.files?.[0]) return j.files[0]
  return drive('/files?fields=id,webViewLink', { method: 'POST', body: JSON.stringify({ name: nombre, mimeType: CARPETA, parents: [padre] }) })
}

export type ResultadoDrive = { ok: true; url: string } | { omitido: string } | { error: string }

// Crea (o completa) la carpeta del proyecto y la comparte con su contacto. Se puede repetir: lo que
// ya existe se reutiliza, así «Reintentar» no duplica carpetas. Si falla, el motivo queda en drive_error.
export async function crearCarpetaProyecto(id: number): Promise<ResultadoDrive> {
  const { data: p } = await sb.from('proyectos').select('id, nombre, cliente, marca, lead_id, contacto_email, drive_folder_id, drive_url').eq('id', id).maybeSingle()
  if (!p) return { error: 'No existe el proyecto' }
  if (p.drive_url) return { ok: true, url: p.drive_url }
  const subcarpetas = SUBCARPETAS[p.marca || '']
  if (!subcarpetas) return { omitido: 'Esta marca no crea carpeta de Drive' }

  try {
    const para = p.contacto_email?.trim() || ''
    if (!EMAIL.test(para)) throw new Error('Falta un email de contacto válido en el proyecto')
    const { data: marca } = await sb.from('marcas').select('nombre').eq('key', p.marca).maybeSingle()
    let folderId = p.drive_folder_id as string | null
    if (!folderId) {
      // Clientes/<Marca>/<Cliente> · <Proyecto>, carpeta a carpeta desde la raíz del Drive.
      folderId = 'root'
      for (const nombre of rutaCarpeta(marca?.nombre || p.marca!, p.cliente, p.nombre).split('/')) folderId = (await carpeta(nombre, folderId)).id
      // Se guarda ya: si luego falla compartir, el reintento usa esta misma carpeta.
      await sb.from('proyectos').update({ drive_folder_id: folderId }).eq('id', p.id)
    }
    for (const s of subcarpetas) await carpeta(s, folderId)
    await drive(`/files/${folderId}/permissions?sendNotificationEmail=false`, {
      method: 'POST', body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: para }),
    })
    const { webViewLink } = await drive(`/files/${folderId}?fields=webViewLink`)
    await sb.from('proyectos').update({ drive_url: webViewLink, drive_error: null }).eq('id', p.id)
    await sb.from('eventos').insert({ proyecto_id: p.id, lead_id: p.lead_id, tipo: 'drive.creada', fuente: 'joux-hub', datos: { url: webViewLink, compartida_con: para } })
    return { ok: true, url: webViewLink }
  } catch (e: any) {
    const error = String(e?.message || 'Error con Drive').slice(0, 300)
    await sb.from('proyectos').update({ drive_error: error }).eq('id', p.id)
    return { error }
  }
}

// ── Archivos que sube el cliente (tick) ─────────────────────────────────────────
// Con drive.file la app no ve lo que sube otra persona; hace falta drive.metadata.readonly (solo
// nombres y fechas, nunca el contenido). Sin ese permiso, esto no hace nada.
const METADATOS = 'https://www.googleapis.com/auth/drive.metadata.readonly'
const PROFUNDIDAD = 3

type Archivo = { id: string; name: string; mimeType: string; ownedByMe?: boolean; size?: string; modifiedTime?: string; ruta: string }

// Todo lo que hay dentro de la carpeta (hasta PROFUNDIDAD niveles), con su ruta: 'Fotos/obra-1.jpg'.
async function contenido(raiz: string): Promise<Archivo[]> {
  const archivos: Archivo[] = []
  let nivel = [{ id: raiz, ruta: '' }]
  for (let d = 0; d < PROFUNDIDAD && nivel.length; d++) {
    const siguiente: typeof nivel = []
    for (const padre of nivel) {
      let pagina: string | undefined
      do {
        const q = new URLSearchParams({ q: `'${padre.id}' in parents and trashed = false`, fields: 'nextPageToken,files(id,name,mimeType,ownedByMe,size,modifiedTime)', pageSize: '1000' })
        if (pagina) q.set('pageToken', pagina)
        const j = await drive(`/files?${q}`)
        for (const f of (j.files || []) as Archivo[]) {
          const ruta = padre.ruta ? `${padre.ruta}/${f.name}` : f.name
          f.mimeType === CARPETA ? siguiente.push({ id: f.id, ruta }) : archivos.push({ ...f, ruta })
        }
        pagina = j.nextPageToken
      } while (pagina)
    }
    nivel = siguiente
  }
  return archivos
}

export async function revisarSubidas() {
  if (!(await permisosGoogle()).includes(METADATOS)) return { omitido: 'sin drive.metadata.readonly' }
  const { data: proyectos } = await sb.from('proyectos').select('id, cliente, lead_id, drive_folder_id')
    .not('drive_url', 'is', null).or('fase.is.null,fase.neq.cerrado').limit(30)
  let avisos = 0
  for (const p of proyectos || []) {
    // Solo lo que no es de joel@: lo que sube el cliente queda a su nombre.
    const ajenos = (await contenido(p.drive_folder_id!)).filter(f => !f.ownedByMe)
    if (!ajenos.length) continue
    // El índice único (proyecto_id, file_id) hace que cada archivo avise una sola vez.
    const { data: nuevos, error } = await sb.from('drive_archivos')
      .upsert(ajenos.map(f => ({ proyecto_id: p.id, file_id: f.id, nombre: f.name.slice(0, 300) })), { onConflict: 'proyecto_id,file_id', ignoreDuplicates: true })
      .select('nombre')
    if (error) throw new Error(error.message)
    if (!nuevos?.length) continue
    const n = nuevos.length
    await sb.from('eventos').insert({ proyecto_id: p.id, lead_id: p.lead_id, tipo: 'material.subido', fuente: 'drive', datos: { n, nombres: nuevos.slice(0, 20).map(f => f.nombre) } })
    // Un diseño ya empezado por el agente se vuelve a montar con lo nuevo (solo en «Comenzado»).
    const r = await repetirPasada(p.id, `${n} archivo${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'} en Drive`, 'drive').catch(e => ({ omitido: String(e?.message) }))
    await notificar({
      titulo: `${p.cliente} ha subido ${n} archivo${n === 1 ? '' : 's'}`,
      cuerpo: ('ok' in r ? `El agente lo vuelve a montar (pasada ${r.pasada}). ` : '') + nuevos.slice(0, 5).map(f => f.nombre).join(', '),
      url: '/proyectos', etiqueta: `drive-${p.id}`,
    }).catch(e => console.error('drive push', e?.message))
    avisos++
  }
  return { avisos }
}

// ── Copia del material para el agente de primera versión ────────────────────────
// El agente nunca toca Google: el hub copia lo que hay en la carpeta al bucket privado `material`
// (<proyecto>/<file_id>-<nombre>) y le da URLs firmadas. Ver el contenido necesita drive.readonly.
const LECTURA = 'https://www.googleapis.com/auth/drive.readonly'
export const BUCKET_MATERIAL = 'material'
const MAX_BYTES_MATERIAL = 50 * 1024 * 1024
// Lo que se copia en una pasada (el tick tiene poco tiempo); el resto, en la siguiente.
const PRESUPUESTO = 40 * 1024 * 1024
// Los documentos de Google no se pueden bajar tal cual: se exportan.
const EXPORTAR: Record<string, { tipo: string; ext: string }> = {
  'application/vnd.google-apps.document': { tipo: 'text/plain', ext: 'txt' },
  'application/vnd.google-apps.spreadsheet': { tipo: 'text/csv', ext: 'csv' },
  'application/vnd.google-apps.presentation': { tipo: 'application/pdf', ext: 'pdf' },
  'application/vnd.google-apps.drawing': { tipo: 'image/png', ext: 'png' },
}

export const puedeLeerDrive = async () => (await permisosGoogle()).includes(LECTURA)

const nombreSeguro = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'archivo'

async function bajar(f: { file_id: string; tipo: string | null }) {
  const exp = EXPORTAR[f.tipo || '']
  const ruta = exp ? `/files/${f.file_id}/export?mimeType=${encodeURIComponent(exp.tipo)}` : `/files/${f.file_id}?alt=media`
  const r = await fetch(`${API}${ruta}`, { headers: { Authorization: `Bearer ${await accessToken()}` }, cache: 'no-store' })
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(motivo(r.status, j?.error?.message || '')) }
  return { datos: Buffer.from(await r.arrayBuffer()), tipo: exp?.tipo || r.headers.get('content-type') || 'application/octet-stream', ext: exp?.ext }
}

// Apunta en drive_copias lo que hay en la carpeta (nuevo o cambiado → por copiar; borrado en Drive → fuera)
// y copia lo pendiente hasta `presupuesto` bytes. Sin drive.readonly no hace nada.
export async function copiarMaterial(ids: number[], presupuesto = PRESUPUESTO) {
  if (!ids.length) return { copiados: 0 }
  if (!(await puedeLeerDrive())) return { omitido: 'sin drive.readonly' }
  const { data: proyectos } = await sb.from('proyectos').select('id, drive_folder_id').in('id', ids).not('drive_folder_id', 'is', null)
  let copiados = 0, gastado = 0
  for (const p of proyectos || []) {
    const archivos = await contenido(p.drive_folder_id!)
    const { data: filas } = await sb.from('drive_copias').select('id, file_id, modificado, storage_path').eq('proyecto_id', p.id)
    const previas = new Map((filas || []).map(f => [f.file_id as string, f]))
    // Borrados en Drive: fuera la fila y la copia.
    const vivos = new Set(archivos.map(f => f.id))
    const borrados = (filas || []).filter(f => !vivos.has(f.file_id))
    if (borrados.length) {
      const rutas = borrados.map(f => f.storage_path).filter((r): r is string => !!r)
      if (rutas.length) await sb.storage.from(BUCKET_MATERIAL).remove(rutas)
      await sb.from('drive_copias').delete().in('id', borrados.map(f => f.id))
    }
    const cambiados = archivos.filter(f => {
      const prev = previas.get(f.id)
      return !prev || (f.modifiedTime && prev.modificado && new Date(prev.modificado).getTime() !== new Date(f.modifiedTime).getTime())
    })
    if (cambiados.length) {
      const { error } = await sb.from('drive_copias').upsert(cambiados.map(f => ({
        proyecto_id: p.id, file_id: f.id, ruta: f.ruta.slice(0, 500), nombre: f.name.slice(0, 300), tipo: f.mimeType,
        bytes: f.size ? Number(f.size) : null, modificado: f.modifiedTime || null, de_cliente: !f.ownedByMe,
        storage_path: null, error: null, copiado_en: null,
      })), { onConflict: 'proyecto_id,file_id' })
      if (error) throw new Error(error.message)
    }
    const { data: porCopiar } = await sb.from('drive_copias').select('id, file_id, nombre, tipo, bytes, storage_path')
      .eq('proyecto_id', p.id).is('copiado_en', null).is('error', null).order('ruta')
    for (const f of porCopiar || []) {
      if ((f.bytes || 0) > MAX_BYTES_MATERIAL) {
        await sb.from('drive_copias').update({ error: 'Más de 50 MB: pásalo a mano' }).eq('id', f.id)
        continue
      }
      if (f.tipo?.startsWith('application/vnd.google-apps.') && !EXPORTAR[f.tipo]) {
        await sb.from('drive_copias').update({ error: 'Tipo de Google que no se puede exportar' }).eq('id', f.id)
        continue
      }
      // Siempre al menos uno por pasada, aunque sea grande; luego, hasta agotar el presupuesto.
      if (copiados && gastado + (f.bytes || 0) > presupuesto) return { copiados, faltan: true }
      try {
        const { datos, tipo, ext } = await bajar(f)
        if (datos.length > MAX_BYTES_MATERIAL) throw new Error('Más de 50 MB: pásalo a mano')
        const ruta = `${p.id}/${f.file_id}-${nombreSeguro(ext ? `${f.nombre}.${ext}` : f.nombre)}`
        if (f.storage_path && f.storage_path !== ruta) await sb.storage.from(BUCKET_MATERIAL).remove([f.storage_path])
        const { error } = await sb.storage.from(BUCKET_MATERIAL).upload(ruta, datos, { contentType: tipo, upsert: true })
        if (error) throw new Error(error.message)
        await sb.from('drive_copias').update({ storage_path: ruta, tipo: ext ? tipo : f.tipo, bytes: datos.length, copiado_en: new Date().toISOString() }).eq('id', f.id)
        copiados++; gastado += datos.length
      } catch (e: any) {
        await sb.from('drive_copias').update({ error: String(e?.message || 'No se pudo copiar').slice(0, 300) }).eq('id', f.id)
      }
    }
  }
  return { copiados }
}
