import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { enviarGmail } from '@/lib/gmail'
import { remitenteLead } from '@/lib/remitentes'
import { notificar } from '@/lib/push'

// Acceso a los cambios desde la propia carta (<carta>.cartela.live/cambios), sin contraseña.
// El Worker de cada carta llama a /api/carta/* con CARTELA_CARTAS_KEY; quién es el local lo dice la sesión.
// - enlace: llega al correo del local (email_aviso); un solo uso y 30 min.
// - sesion: el móvil recordado (cookie HttpOnly del Worker), un año.
// El enlace de la entrega (?k=<token_cambios>) también abre sesión: es el de siempre, y «Cerrar accesos» lo renueva.
// Contrato en 01 Agencias web/cartela/joux-hub/CAMBIOS-EN-LA-CARTA.md.

export const CLAVE_CARTAS = [{ env: 'CARTELA_CARTAS_KEY', fuente: 'cartas' }] as const
const ENLACE_MIN = 30
export const SESION_DIAS = 365
const ENVIOS_AL_DIA = 5

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const iguales = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export type LocalCarta = {
  id: number; nombre: string; slug: string; plan: string; url_carta: string | null; estado: string; prueba: boolean
  proyecto_id: number | null; email_aviso: string | null; token_cambios: string
}

export async function localDeSlug(slug: string): Promise<LocalCarta | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null
  const { data } = await sb.from('cartela_locales').select('id, nombre, slug, plan, url_carta, estado, prueba, proyecto_id, email_aviso, token_cambios')
    .eq('slug', slug).maybeSingle()
  return data && data.estado !== 'baja' ? data as LocalCarta : null
}

// «hola@barcresta.es» → «h•••@barcresta.es»: el visitante sabe adónde ha ido sin ver la dirección.
export const ocultar = (email: string) => email.replace(/^(.)[^@]*/, '$1•••')

// Dirección pública de la carta del local (la que publica el agente): de ahí sale el enlace del correo.
export const origenCarta = (l: Pick<LocalCarta, 'url_carta'>) => l.url_carta?.match(/^(https:\/\/[a-z0-9-]+\.cartela\.live)\//)?.[1] || null

export async function enviarAcceso(l: LocalCarta) {
  const origen = origenCarta(l)
  if (!origen) return { ok: false as const, error: 'sin_carta', status: 409 }
  if (!l.email_aviso) return { ok: false as const, error: 'sin_correo', status: 409 }
  const desde = new Date(Date.now() - 24 * 3600e3).toISOString()
  const { count } = await sb.from('cartela_accesos').select('id', { count: 'exact', head: true }).eq('local_id', l.id).eq('tipo', 'enlace').gte('created_at', desde)
  if ((count || 0) >= ENVIOS_AL_DIA) return { ok: false as const, error: 'limite', status: 429 }

  const k = randomBytes(32).toString('hex')
  const { error } = await sb.from('cartela_accesos').insert({ local_id: l.id, tipo: 'enlace', hash: sha(k), expira: new Date(Date.now() + ENLACE_MIN * 60e3).toISOString() })
  if (error) { console.error('cartela/acceso', error.message); return { ok: false as const, error: 'servidor', status: 500 } }

  const url = `${origen}/cambios/entrar?k=${k}`
  const texto = `Hola:\n\nPara pedir cambios en la carta de ${l.nombre}, entra desde aquí:\n${url}\n\nEl enlace sirve una vez y caduca en ${ENLACE_MIN} minutos. Después, ese móvil queda recordado y entras directamente desde ${origen.replace('https://', '')}/cambios.\n\nSi no lo has pedido tú, ignora este correo: nadie puede entrar sin él.\n\nCartela`
  const html = `<p>Hola:</p><p>Para pedir cambios en la carta de <b>${esc(l.nombre)}</b>, entra desde aquí:</p>`
    + `<p><a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:99px;background:#D3371E;color:#fff;font-weight:700;text-decoration:none">Entrar a mis cambios</a></p>`
    + `<p style="color:#65574E;font-size:14px">El enlace sirve una vez y caduca en ${ENLACE_MIN} minutos. Después, ese móvil queda recordado y entras directamente desde ${esc(origen.replace('https://', ''))}/cambios.</p>`
    + `<p style="color:#65574E;font-size:14px">Si no lo has pedido tú, ignora este correo: nadie puede entrar sin él.</p><p>Cartela</p>`
  try {
    await enviarGmail({ de: remitenteLead('cartela', 'es')!, para: l.email_aviso, asunto: `Tu acceso a los cambios de ${l.nombre}`, texto, html })
  } catch (e: any) {
    console.error('cartela/acceso correo', e?.message)
    return { ok: false as const, error: 'correo', status: 502 }
  }
  return { ok: true as const, correo: ocultar(l.email_aviso) }
}

// Canjea el enlace del correo (o el de la entrega) por una sesión para ese móvil.
export async function entrar(l: LocalCarta, k: string, dispositivo: string | null) {
  if (!/^[0-9a-f]{64}$/.test(k)) return { ok: false as const, error: 'enlace', status: 401 }
  let valido = iguales(k, l.token_cambios)
  if (!valido) {
    const { data } = await sb.from('cartela_accesos').update({ usado_at: new Date().toISOString() })
      .eq('hash', sha(k)).eq('local_id', l.id).eq('tipo', 'enlace').is('usado_at', null).eq('revocado', false)
      .gt('expira', new Date().toISOString()).select('id').maybeSingle()
    valido = !!data
  }
  if (!valido) return { ok: false as const, error: 'enlace', status: 401 }
  const sesion = randomBytes(32).toString('hex')
  const { error } = await sb.from('cartela_accesos').insert({
    local_id: l.id, tipo: 'sesion', hash: sha(sesion), expira: new Date(Date.now() + SESION_DIAS * 864e5).toISOString(),
    dispositivo: dispositivo?.slice(0, 200) || null, ultimo_uso: new Date().toISOString(),
  })
  if (error) { console.error('cartela/sesion', error.message); return { ok: false as const, error: 'servidor', status: 500 } }
  return { ok: true as const, sesion, dias: SESION_DIAS }
}

// ¿Esta sesión es de este local y sigue viva?
export async function sesionValida(l: LocalCarta, sesion: string | null) {
  if (!sesion || !/^[0-9a-f]{64}$/.test(sesion)) return false
  const { data } = await sb.from('cartela_accesos').select('id, ultimo_uso').eq('hash', sha(sesion)).eq('local_id', l.id).eq('tipo', 'sesion')
    .eq('revocado', false).gt('expira', new Date().toISOString()).maybeSingle()
  if (!data) return false
  // Último uso, como mucho una escritura por hora y sin esperarla.
  if (!data.ultimo_uso || Date.now() - Date.parse(data.ultimo_uso) > 3600e3)
    sb.from('cartela_accesos').update({ ultimo_uso: new Date().toISOString() }).eq('id', data.id).then(() => {}, () => {})
  return true
}

// Panel: cierra todos los móviles del local y renueva el enlace de la entrega (el viejo deja de servir).
export async function cerrarAccesos(localId: number) {
  const { error } = await sb.from('cartela_accesos').update({ revocado: true }).eq('local_id', localId).eq('revocado', false)
  if (error) return { ok: false as const, error: error.message }
  const { error: e2 } = await sb.from('cartela_locales').update({ token_cambios: randomBytes(32).toString('hex') }).eq('id', localId)
  if (e2) return { ok: false as const, error: e2.message }
  return { ok: true as const }
}

export async function accesosActivos(localIds: number[]) {
  if (!localIds.length) return new Map<number, number>()
  const { data } = await sb.from('cartela_accesos').select('local_id').in('local_id', localIds).eq('tipo', 'sesion').eq('revocado', false).gt('expira', new Date().toISOString())
  const m = new Map<number, number>()
  for (const r of data || []) m.set(r.local_id, (m.get(r.local_id) || 0) + 1)
  return m
}

// Aviso a Joel cuando el local pide parar algo que ya estaba en marcha (no puede esperar a la bandeja).
export async function avisarParar(l: Pick<LocalCarta, 'nombre' | 'prueba'>, texto: string, id: number) {
  try {
    await notificar({ titulo: `Parar cambio · ${l.nombre}${l.prueba ? ' (prueba)' : ''}`, cuerpo: texto.slice(0, 140), url: '/cartela/cambios', etiqueta: `cartela-peticion-${id}` })
  } catch (e: any) { console.error('cartela/parar aviso', e?.message) }
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

// Cada llamada del Worker de una carta: su clave, el local por slug y, si hace falta, una sesión viva de ese local.
export async function autorizarCarta(req: Request, slug: string | null, conSesion = true) {
  const { fuenteDeClave } = await import('@/lib/intake')
  if (!fuenteDeClave(req.headers.get('authorization'), CLAVE_CARTAS)) return { error: 'no_autorizado', status: 401 } as const
  const local = slug ? await localDeSlug(slug) : null
  if (!local) return { error: 'local', status: 404 } as const
  if (conSesion && !(await sesionValida(local, req.headers.get('x-sesion')))) return { error: 'sesion', status: 401 } as const
  return { local } as const
}
