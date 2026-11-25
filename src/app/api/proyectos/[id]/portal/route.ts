import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { limpiarPendientes } from '@/lib/portal'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache.
export const fetchCache = 'force-no-store'

const enlace = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) return null
  const u = /^https?:\/\//.test(s) ? s : `https://${s}`
  try { return new URL(u).protocol.startsWith('http') ? u : undefined } catch { return undefined }
}

// Ficha del proyecto › «Portal del cliente»: lo que el cliente ve en su enlace y no sale de otro sitio (review mode,
// web en vivo, dominio y lo que le toca mandar). Privada (cookie del hub, en el middleware).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const b = await req.json().catch(() => null)
  if (!Number.isInteger(id) || !b || typeof b !== 'object') return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 })
  const url_revision = enlace(b.url_revision), url_live = enlace(b.url_live)
  if (url_revision === undefined || url_live === undefined) return NextResponse.json({ error: 'Enlace no válido' }, { status: 400 })
  const dominio = typeof b.dominio === 'string' ? b.dominio.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase() || null : null
  const dominio_estado = b.dominio_estado === 'conectado' ? 'conectado' : dominio ? 'pendiente' : null
  const fila = { url_revision, url_live, dominio, dominio_estado, pendientes_cliente: limpiarPendientes(b.pendientes) }
  const { error } = await sb.from('proyectos').update(fila).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ...fila })
}
