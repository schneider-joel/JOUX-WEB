import { supabaseServer as sb } from '@/lib/supabase-server'
import { notificar } from '@/lib/push'

// Cambios de Cartela, fase 1 (diseño en 01 Agencias web/cartela/joux-hub/CAMBIOS-AUTOMATICOS.md):
// el local pide un cambio desde /cambios/<token>, la petición entra en la bandeja (/cartela/cambios)
// y Joel la aplica a mano con el motor. Sin agente todavía.

export const BUCKET_CARTELA = 'cartela'
const PUBLICA = 'https://joux-web.vercel.app'
export const ESTADOS_PETICION = ['recibida', 'en_curso', 'publicada', 'escalada', 'cancelada'] as const
export type EstadoPeticion = typeof ESTADOS_PETICION[number]

// Uso razonable: no se anuncia como tope, solo corta abusos del enlace.
const MAX_AL_DIA = 10
const MAX_TEXTO = 2000
const MAX_FOTO = 5 * 1024 * 1024
const TIPOS_FOTO: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }

export type Local = { id: number; nombre: string; slug: string; plan: string; url_carta: string | null; estado: string; prueba: boolean; proyecto_id: number | null }
export type Peticion = {
  id: number; local_id: number; texto: string; adjuntos: string[]; estado: EstadoPeticion; nota: string | null; created_at: string; actualizada_at: string | null
  // Desde la carta (2026-11-02): el plato tocado, qué se pidió (precio, agotado, quitar, otra, deshacer) y su valor.
  plato_id: string | null; plato_nombre: string | null; op: string | null; valor: string | null; parar: boolean; deshace_id: number | null
}
export const COLUMNAS_PETICION = 'id, local_id, texto, adjuntos, estado, nota, created_at, actualizada_at, plato_id, plato_nombre, op, valor, parar, deshace_id'
export const OPS = ['precio', 'agotado', 'quitar', 'otra', 'nuevo', 'horario', 'foto', 'deshacer'] as const

export async function localDeToken(token: string): Promise<Local | null> {
  // 64 caracteres hex: cualquier otra cosa ni se consulta.
  if (!/^[0-9a-f]{64}$/.test(token)) return null
  const { data } = await sb.from('cartela_locales').select('id, nombre, slug, plan, url_carta, estado, prueba, proyecto_id').eq('token_cambios', token).maybeSingle()
  return data && data.estado !== 'baja' ? data as Local : null
}

// El enlace de cambios es del servicio anual: hasta que Joel aprueba y entrega la carta, la página solo dice que está
// en revisión (las correcciones van respondiendo al correo). Un local sin proyecto (de ejemplo) ya está entregado.
export async function cartaEntregada(local: Pick<Local, 'proyecto_id'>) {
  if (!local.proyecto_id) return true
  const { data } = await sb.from('proyectos').select('fase').eq('id', local.proyecto_id).maybeSingle()
  return data?.fase === 'entregado' || data?.fase === 'cerrado'
}

// QR de la carta (lo sube el agente con web-lista a cartela/qr/<slug>.png), para descargarlo desde su página.
export async function qrDelLocal(local: Pick<Local, 'slug'>) {
  const { data } = await sb.storage.from(BUCKET_CARTELA).download(`qr/${local.slug}.png`)
  return data ? Buffer.from(await data.arrayBuffer()) : null
}

export async function peticionesDe(localId: number, limite = 30) {
  const { data } = await sb.from('cartela_peticiones').select(COLUMNAS_PETICION)
    .eq('local_id', localId).neq('estado', 'cancelada').order('created_at', { ascending: false }).limit(limite)
  return (data || []) as Peticion[]
}

// Lo que ve el cliente: sin rutas de adjuntos (solo cuántas fotos mandó).
export const peticionPublica = (p: Peticion) => ({
  id: p.id, texto: p.texto, fotos: p.adjuntos.length, estado: p.estado, nota: p.nota, created_at: p.created_at, actualizada_at: p.actualizada_at,
  plato_id: p.plato_id, plato_nombre: p.plato_nombre, op: p.op, valor: p.valor, parar: p.parar,
})
export type PeticionPublica = ReturnType<typeof peticionPublica>

type Resultado = { ok: true; peticion: PeticionPublica } | { ok: false; error: string; status: number }

// Lo que llega de la carta además del texto (todo opcional; la página de /cambios/<token> solo manda texto y foto).
export type Extra = { plato_id?: string | null; plato_nombre?: string | null; op?: string | null; valor?: string | null; deshace_id?: number | null }

export const extraDeForm = (f: FormData): Extra => {
  const t = (k: string, max: number) => { const v = String(f.get(k) ?? '').trim(); return v ? v.slice(0, max) : null }
  const op = t('op', 20)
  const deshace = Number(f.get('deshace_id'))
  return {
    plato_id: t('plato_id', 80), plato_nombre: t('plato_nombre', 120), op: op && (OPS as readonly string[]).includes(op) ? op : null,
    valor: t('valor', 40), deshace_id: Number.isInteger(deshace) && deshace > 0 ? deshace : null,
  }
}

// Desde el enlace de siempre (/cambios/<token>).
export async function crearPeticion(token: string, texto: string, foto: File | null): Promise<Resultado> {
  const local = await localDeToken(token)
  if (!local) return { ok: false, error: 'enlace', status: 404 }
  return crearPeticionDe(local, texto, foto, {})
}

// Guarda la petición del cliente (texto y, si la hay, una foto) y avisa a Joel por push.
export async function crearPeticionDe(local: Local, texto: string, foto: File | null, extra: Extra): Promise<Resultado> {
  if (local.estado === 'pausado') return { ok: false, error: 'pausado', status: 403 }
  if (!(await cartaEntregada(local))) return { ok: false, error: 'revision', status: 409 }
  texto = texto.trim().slice(0, MAX_TEXTO)
  if (!texto && !foto) return { ok: false, error: 'vacio', status: 400 }
  if (foto && (!TIPOS_FOTO[foto.type] || foto.size > MAX_FOTO)) return { ok: false, error: 'foto', status: 400 }

  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count } = await sb.from('cartela_peticiones').select('id', { count: 'exact', head: true }).eq('local_id', local.id).gte('created_at', desde)
  if ((count || 0) >= MAX_AL_DIA) return { ok: false, error: 'limite', status: 429 }

  // «Deshacer» solo de una petición publicada de este mismo local.
  if (extra.deshace_id) {
    const { data: d } = await sb.from('cartela_peticiones').select('id').eq('id', extra.deshace_id).eq('local_id', local.id).eq('estado', 'publicada').maybeSingle()
    if (!d) extra = { ...extra, deshace_id: null }
  }
  const { data: p, error } = await sb.from('cartela_peticiones').insert({ local_id: local.id, texto: texto || '(foto)', ...extra }).select(COLUMNAS_PETICION).single()
  if (error || !p) { console.error('cartela/peticion', error?.message); return { ok: false, error: 'servidor', status: 500 } }

  let peticion = p as Peticion
  if (foto) {
    const ruta = `${local.id}/${peticion.id}/foto.${TIPOS_FOTO[foto.type]}`
    const subida = await sb.storage.from(BUCKET_CARTELA).upload(ruta, Buffer.from(await foto.arrayBuffer()), { contentType: foto.type, upsert: true })
    if (subida.error) console.error('cartela/foto', subida.error.message)
    else {
      const { data } = await sb.from('cartela_peticiones').update({ adjuntos: [ruta] }).eq('id', peticion.id).select(COLUMNAS_PETICION).single()
      if (data) peticion = data as Peticion
    }
  }

  // La petición ya está guardada: si falla el aviso, el cliente no tiene que repetirla.
  try {
    await notificar({
      titulo: `Cambio · ${local.nombre}${local.prueba ? ' (prueba)' : ''}`,
      cuerpo: `${peticion.plato_nombre ? `${peticion.plato_nombre} · ` : ''}${peticion.texto.slice(0, 140)}${peticion.adjuntos.length ? ' · 📷' : ''}`,
      url: '/cartela/cambios',
      etiqueta: `cartela-peticion-${peticion.id}`,
    })
  } catch (e: any) {
    console.error('cartela/aviso', e?.message)
  }
  return { ok: true, peticion: peticionPublica(peticion) }
}

// El local cambia, cancela o pide parar una petición suya. Solo se toca lo que nadie ha empezado:
// cambiar y cancelar, en «recibida»; parar, en «en curso» (el agente ya no la recoge y Joel recibe un aviso).
// Updates condicionales: si el agente la coge a la vez, gana él y el local ve un 409.
export async function modificarPeticion(local: Local, id: number, accion: string, d: { texto?: string } & Extra) {
  const ahora = new Date().toISOString()
  let q
  if (accion === 'cambiar') {
    const texto = (d.texto || '').trim().slice(0, MAX_TEXTO)
    if (!texto) return { ok: false as const, error: 'vacio', status: 400 }
    q = sb.from('cartela_peticiones').update({ texto, op: d.op ?? null, valor: d.valor ?? null, actualizada_at: ahora }).eq('estado', 'recibida')
  } else if (accion === 'cancelar') {
    q = sb.from('cartela_peticiones').update({ estado: 'cancelada', actualizada_at: ahora }).eq('estado', 'recibida')
  } else if (accion === 'parar') {
    q = sb.from('cartela_peticiones').update({ parar: true, actualizada_at: ahora }).eq('estado', 'en_curso')
  } else return { ok: false as const, error: 'accion', status: 400 }
  const { data } = await q.eq('id', id).eq('local_id', local.id).select(COLUMNAS_PETICION).maybeSingle()
  if (!data) return { ok: false as const, error: 'estado', status: 409 }
  return { ok: true as const, peticion: data as Peticion }
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

// «Marcar ganado» de un lead de Cartela: el local nace con su enlace de cambios, que va en la bienvenida
// (ahí sube el cliente sus fotos; no hay carpeta de Drive). Repetirlo no duplica: uno por proyecto.
export async function crearLocalCartela(proyectoId: number, d: { nombre: string; plan: string | null; email: string | null; prueba: boolean }) {
  const { data: ya } = await sb.from('cartela_locales').select('id').eq('proyecto_id', proyectoId).maybeSingle()
  if (ya) return { ok: true as const, id: ya.id as number }
  const base = d.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'local'
  const { data: usados } = await sb.from('cartela_locales').select('slug').like('slug', `${base}%`)
  const libres = new Set((usados || []).map(u => u.slug))
  let slug = base
  for (let n = 2; libres.has(slug); n++) slug = `${base}-${n}`
  const plan = ['carta', 'casa', 'grupo'].find(p => (d.plan || '').toLowerCase().includes(p)) || 'carta'
  const { data, error } = await sb.from('cartela_locales').insert({ proyecto_id: proyectoId, nombre: d.nombre, slug, plan, email_aviso: d.email, prueba: d.prueba }).select('id').single()
  if (error || !data) return { ok: false as const, error: error?.message || 'No se pudo crear el local' }
  return { ok: true as const, id: data.id as number }
}

// {{cambios_url}} de los emails de un proyecto de Cartela: null si aún no tiene local.
// Si la carta ya está en su subdominio, el enlace entra por la propia carta (deja el móvil recordado: <carta>/cambios);
// si no, la página de siempre en el hub.
export async function enlaceCambios(proyectoId: number) {
  const { data } = await sb.from('cartela_locales').select('token_cambios, url_carta').eq('proyecto_id', proyectoId).neq('estado', 'baja').maybeSingle()
  if (!data) return null
  const origen = data.url_carta?.match(/^(https:\/\/[a-z0-9-]+\.cartela\.live)\//)?.[1]
  return origen ? `${origen}/cambios/entrar?k=${data.token_cambios}` : `${PUBLICA}/cambios/${data.token_cambios}`
}
