// Token de Google (Gmail + Drive de joel@joelschneider.io) guardado en la base (solo servidor).
// «Reconectar Google» en /ajustes lo renueva sin tocar Vercel: /api/google/conectar → Google →
// /api/google/callback. Se guarda cifrado en `google_token` (una fila, RLS sin políticas).
// GMAIL_REFRESH_TOKEN queda de respaldo mientras la base no tenga uno válido.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'crypto'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { notificar } from '@/lib/push'

export const CUENTA_GOOGLE = 'joel@joelschneider.io'
// Los 4 de siempre: Gmail (enviar y leer hilos de leads) y Drive (carpetas que crea la app y nombres de lo que sube el cliente).
export const PERMISOS_GOOGLE = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
]
export const rutaCallback = (origen: string) => `${origen}/api/google/callback`

const limpio = (v?: string) => v?.trim().replace(/^["']|["']$/g, '')
export const clienteGoogle = () => ({ id: limpio(process.env.GMAIL_CLIENT_ID), secreto: limpio(process.env.GMAIL_CLIENT_SECRET) })

// Clave de cifrado derivada del client secret: vive solo en Vercel (y .env.local), nunca en la base.
function clave() {
  const { secreto } = clienteGoogle()
  if (!secreto) throw new Error('Falta GMAIL_CLIENT_SECRET')
  return Buffer.from(hkdfSync('sha256', secreto, 'joux-hub', 'google-token', 32))
}

function cifrar(texto: string) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', clave(), iv)
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), datos]).toString('base64')
}

function descifrar(b64: string) {
  const b = Buffer.from(b64, 'base64')
  const d = createDecipheriv('aes-256-gcm', clave(), b.subarray(0, 12))
  d.setAuthTag(b.subarray(12, 28))
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')
}

// `state` firmado contra CSRF: fecha + azar + HMAC. Vale 10 minutos.
export function firmarState() {
  const cuerpo = `${Date.now()}.${randomBytes(12).toString('base64url')}`
  return `${cuerpo}.${createHmac('sha256', clave()).update(cuerpo).digest('base64url')}`
}

export function stateValido(state: string | null) {
  const partes = state?.split('.') || []
  if (partes.length !== 3) return false
  const esperado = createHmac('sha256', clave()).update(`${partes[0]}.${partes[1]}`).digest()
  const recibido = Buffer.from(partes[2], 'base64url')
  if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) return false
  return Date.now() - Number(partes[0]) < 10 * 60_000
}

export type EstadoGoogle = { cuenta: string; estado: 'conectado' | 'caducado'; permisos: string[]; conectado_at: string; caducado_at: string | null }

export async function estadoGoogle(): Promise<EstadoGoogle | null> {
  const { data } = await sb.from('google_token').select('cuenta, estado, permisos, conectado_at, caducado_at').eq('id', 1).maybeSingle()
  return data as EstadoGoogle | null
}

// Refresh token de la base, si está conectado y se puede descifrar.
export async function tokenDeLaBase() {
  const { data } = await sb.from('google_token').select('token_cifrado, estado').eq('id', 1).maybeSingle()
  if (!data || data.estado !== 'conectado') return null
  try { return descifrar(data.token_cifrado) } catch { return null }
}

export async function guardarToken(refresh: string, cuenta: string, permisos: string[]) {
  const { error } = await sb.from('google_token').upsert({
    id: 1, cuenta, token_cifrado: cifrar(refresh), permisos, estado: 'conectado', conectado_at: new Date().toISOString(), caducado_at: null,
  })
  if (error) throw new Error(error.message)
}

// Google dijo invalid_grant: se marca una sola vez y se avisa a Joel (no falla en silencio).
export async function marcarCaducado() {
  const { data } = await sb.from('google_token').update({ estado: 'caducado', caducado_at: new Date().toISOString() })
    .eq('id', 1).eq('estado', 'conectado').select('id')
  if (data?.length) {
    await notificar({ titulo: 'Google desconectado', cuerpo: 'Gmail y Drive no tienen permiso: los emails no salen. Reconéctalo en Ajustes.', url: '/ajustes', etiqueta: 'google-caducado' }).catch(() => {})
  }
}
