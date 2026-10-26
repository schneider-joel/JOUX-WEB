// Clave del agente /prueba-gratis (rutas /api/agente/*). Solo servidor.
import { MAX_BYTES_INTAKE } from '@/lib/intake'

export const CLAVE_AGENTE = [{ env: 'INTAKE_KEY_AGENTE', fuente: 'agente-prueba' }] as const

// Cuerpo JSON de una petición del agente, con el mismo límite que las de intake (web-lista de una carta
// pide más: lleva el QR en base64).
export async function cuerpoAgente(req: Request, maximo = MAX_BYTES_INTAKE): Promise<Record<string, unknown> | null | 'grande'> {
  if (Number(req.headers.get('content-length') || 0) > maximo) return 'grande'
  const crudo = await req.text()
  if (Buffer.byteLength(crudo) > maximo) return 'grande'
  try {
    const b = JSON.parse(crudo)
    return b && typeof b === 'object' && !Array.isArray(b) ? b : null
  } catch { return null }
}

export const idLead = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null

export function urlHttps(v: unknown) {
  if (typeof v !== 'string' || v.length > 2000) return null
  try { const u = new URL(v.trim()); return u.protocol === 'https:' ? u.toString() : null } catch { return null }
}

export const idProyecto = idLead

// Frases cortas que manda el agente (cambios, notas): como mucho 20 de ≤ 300 caracteres. null = no valen.
export function frasesAgente(v: unknown): string[] | null {
  if (v == null) return []
  if (!Array.isArray(v) || v.length > 20 || v.some(c => typeof c !== 'string' || !c.trim() || c.length > 300)) return null
  return (v as string[]).map(c => c.trim())
}
