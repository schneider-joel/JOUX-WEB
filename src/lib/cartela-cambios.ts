import { supabaseServer as sb } from '@/lib/supabase-server'
import { notificar } from '@/lib/push'

// Cambios de Cartela, fase 1 (diseño en 01 Agencias web/cartela/joux-hub/CAMBIOS-AUTOMATICOS.md):
// el local pide un cambio desde /cambios/<token>, la petición entra en la bandeja (/cartela/cambios)
// y Joel la aplica a mano con el motor. Sin agente todavía.

export const BUCKET_CARTELA = 'cartela'
export const ESTADOS_PETICION = ['recibida', 'en_curso', 'publicada', 'escalada'] as const
export type EstadoPeticion = typeof ESTADOS_PETICION[number]

// Uso razonable: no se anuncia como tope, solo corta abusos del enlace.
const MAX_AL_DIA = 10
const MAX_TEXTO = 2000
const MAX_FOTO = 5 * 1024 * 1024
const TIPOS_FOTO: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }

export type Local = { id: number; nombre: string; slug: string; plan: string; url_carta: string | null; estado: string; prueba: boolean }
export type Peticion = { id: number; local_id: number; texto: string; adjuntos: string[]; estado: EstadoPeticion; nota: string | null; created_at: string; actualizada_at: string | null }

export async function localDeToken(token: string): Promise<Local | null> {
  // 64 caracteres hex: cualquier otra cosa ni se consulta.
  if (!/^[0-9a-f]{64}$/.test(token)) return null
  const { data } = await sb.from('cartela_locales').select('id, nombre, slug, plan, url_carta, estado, prueba').eq('token_cambios', token).maybeSingle()
  return data && data.estado !== 'baja' ? data as Local : null
}

export async function peticionesDe(localId: number, limite = 30) {
  const { data } = await sb.from('cartela_peticiones').select('id, local_id, texto, adjuntos, estado, nota, created_at, actualizada_at')
    .eq('local_id', localId).order('created_at', { ascending: false }).limit(limite)
  return (data || []) as Peticion[]
}

// Lo que ve el cliente: sin rutas de adjuntos (solo cuántas fotos mandó).
export const peticionPublica = (p: Peticion) => ({ id: p.id, texto: p.texto, fotos: p.adjuntos.length, estado: p.estado, nota: p.nota, created_at: p.created_at, actualizada_at: p.actualizada_at })
export type PeticionPublica = ReturnType<typeof peticionPublica>

type Resultado = { ok: true; peticion: PeticionPublica } | { ok: false; error: string; status: number }

// Guarda la petición del cliente (texto y, si la hay, una foto) y avisa a Joel por push.
export async function crearPeticion(token: string, texto: string, foto: File | null): Promise<Resultado> {
  const local = await localDeToken(token)
  if (!local) return { ok: false, error: 'enlace', status: 404 }
  if (local.estado === 'pausado') return { ok: false, error: 'pausado', status: 403 }
  texto = texto.trim().slice(0, MAX_TEXTO)
  if (!texto && !foto) return { ok: false, error: 'vacio', status: 400 }
  if (foto && (!TIPOS_FOTO[foto.type] || foto.size > MAX_FOTO)) return { ok: false, error: 'foto', status: 400 }

  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count } = await sb.from('cartela_peticiones').select('id', { count: 'exact', head: true }).eq('local_id', local.id).gte('created_at', desde)
  if ((count || 0) >= MAX_AL_DIA) return { ok: false, error: 'limite', status: 429 }

  const { data: p, error } = await sb.from('cartela_peticiones').insert({ local_id: local.id, texto: texto || '(foto)' }).select('id, local_id, texto, adjuntos, estado, nota, created_at, actualizada_at').single()
  if (error || !p) { console.error('cartela/peticion', error?.message); return { ok: false, error: 'servidor', status: 500 } }

  let peticion = p as Peticion
  if (foto) {
    const ruta = `${local.id}/${peticion.id}/foto.${TIPOS_FOTO[foto.type]}`
    const subida = await sb.storage.from(BUCKET_CARTELA).upload(ruta, Buffer.from(await foto.arrayBuffer()), { contentType: foto.type, upsert: true })
    if (subida.error) console.error('cartela/foto', subida.error.message)
    else {
      const { data } = await sb.from('cartela_peticiones').update({ adjuntos: [ruta] }).eq('id', peticion.id).select('id, local_id, texto, adjuntos, estado, nota, created_at, actualizada_at').single()
      if (data) peticion = data as Peticion
    }
  }

  // La petición ya está guardada: si falla el aviso, el cliente no tiene que repetirla.
  try {
    await notificar({
      titulo: `Cambio · ${local.nombre}${local.prueba ? ' (prueba)' : ''}`,
      cuerpo: `${peticion.texto.slice(0, 140)}${peticion.adjuntos.length ? ' · 📷' : ''}`,
      url: '/cartela/cambios',
      etiqueta: `cartela-peticion-${peticion.id}`,
    })
  } catch (e: any) {
    console.error('cartela/aviso', e?.message)
  }
  return { ok: true, peticion: peticionPublica(peticion) }
}

// Panel: Joel mueve la petición de estado; al publicarla deja una nota corta de lo que cambió.
export async function cambiarEstado(id: number, estado: string, nota: string | null) {
  if (!ESTADOS_PETICION.includes(estado as EstadoPeticion)) return { ok: false as const, error: 'Estado no válido', status: 400 }
  const cambios: Record<string, unknown> = { estado, actualizada_at: new Date().toISOString() }
  if (nota !== null) cambios.nota = nota.trim().slice(0, 500) || null
  const { data, error } = await sb.from('cartela_peticiones').update(cambios).eq('id', id).select('id').maybeSingle()
  if (error) return { ok: false as const, error: error.message, status: 500 }
  if (!data) return { ok: false as const, error: 'No existe', status: 404 }
  return { ok: true as const }
}

// URLs firmadas de las fotos para la bandeja (una hora).
export async function firmarAdjuntos(rutas: string[]) {
  if (!rutas.length) return new Map<string, string>()
  const { data } = await sb.storage.from(BUCKET_CARTELA).createSignedUrls(rutas, 3600)
  return new Map((data || []).filter(d => d.signedUrl && d.path).map(d => [d.path as string, d.signedUrl]))
}
