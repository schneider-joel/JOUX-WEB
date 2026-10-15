import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// Tarjeta «Leads» del Overview: los nuevos sin atender (protegido por el cookie del hub).
export async function GET() {
  const [{ data, error }, { data: marcas }] = await Promise.all([
    sb.from('leads').select('id, marca, nombre, email, empresa, recibido_en').eq('estado', 'nuevo').order('recibido_en', { ascending: false }).limit(50),
    sb.from('marcas').select('key, nombre'),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const nombre = new Map((marcas || []).map(m => [m.key, m.nombre]))
  return NextResponse.json({ nuevos: (data || []).map(l => ({ ...l, marca_nombre: nombre.get(l.marca) || l.marca })) })
}
