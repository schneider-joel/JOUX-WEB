// Claves de las rutas de entrada (/api/intake/*), de servidor a servidor. Solo servidor.
import { createHash, timingSafeEqual } from 'crypto'

// Se comparan los hashes: mismo largo siempre, así timingSafeEqual no filtra la longitud de la clave.
const sha = (s: string) => createHash('sha256').update(s).digest()

// La fuente cuya clave (variable de entorno `env`) coincide con el «Authorization: Bearer …».
export function fuenteDeClave<F extends { env: string }>(auth: string | null, fuentes: readonly F[]): F | null {
  const m = auth?.match(/^Bearer\s+(.+)$/)
  if (!m) return null
  const dada = sha(m[1].trim())
  let encontrada: F | null = null
  for (const f of fuentes) {
    const clave = process.env[f.env]?.trim()
    // Sin cortar el bucle: el tiempo no depende de qué clave coincide.
    if (clave && timingSafeEqual(dada, sha(clave))) encontrada = f
  }
  return encontrada
}

export const MAX_BYTES_INTAKE = 64 * 1024
