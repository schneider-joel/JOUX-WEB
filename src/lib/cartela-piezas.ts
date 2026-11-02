import { supabaseServer as sb } from '@/lib/supabase-server'
import { BUCKET_CARTELA } from '@/lib/cartela-cambios'

// Piezas con el QR de cada carta (Cartela, 2026-11-02): lo que promete la web, «pegatina de mesa, display y cartel
// de escaparate con tu diseño, en archivos listos para imprimir». Las genera la sesión de Cartela
// (clientes/motor/piezas.py, PDF con 3 mm de sangre) y el agente las sube una a una con /api/agente/piezas a
// cartela/piezas/<slug>/<pieza>.pdf (bucket privado). Van adjuntas a la entrega junto al QR.
export const PIEZAS = {
  'pegatina-mesa': 'Pegatina de mesa 8x8 cm',
  'display-mesa': 'Display de mesa A6',
  'cartel-escaparate': 'Cartel de escaparate A5',
} as const
export type Pieza = keyof typeof PIEZAS
export const esPieza = (v: unknown): v is Pieza => typeof v === 'string' && Object.hasOwn(PIEZAS, v)
export const rutaPieza = (slug: string, pieza: Pieza) => `piezas/${slug}/${pieza}.pdf`

export type Adjunto = { nombre: string; tipo: string; datos: Buffer }

// Las piezas que el agente ya subió, en el orden de PIEZAS (las que falten no se adjuntan).
export async function piezasDelLocal(slug: string): Promise<Adjunto[]> {
  const piezas = await Promise.all((Object.keys(PIEZAS) as Pieza[]).map(async (pieza): Promise<Adjunto | null> => {
    const { data } = await sb.storage.from(BUCKET_CARTELA).download(rutaPieza(slug, pieza))
    return data ? { nombre: `${PIEZAS[pieza]}.pdf`, tipo: 'application/pdf', datos: Buffer.from(await data.arrayBuffer()) } : null
  }))
  return piezas.filter((x): x is Adjunto => !!x)
}

// ¿Están las tres? Solo entonces la entrega las explica ({{#piezas}} en la plantilla).
export async function piezasCompletas(slug: string) {
  const { data } = await sb.storage.from(BUCKET_CARTELA).list(`piezas/${slug}`)
  const hay = new Set((data || []).map(o => o.name))
  return (Object.keys(PIEZAS) as Pieza[]).every(p => hay.has(`${p}.pdf`))
}
