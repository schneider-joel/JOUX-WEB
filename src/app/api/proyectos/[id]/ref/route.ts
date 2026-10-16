import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// Ref de entrega: slug de arkevo-revision o carpeta de Pitchview. Es lo que llega como `ref` en
// POST /api/intake/evento para encontrar el proyecto. Vacía = sin enlazar.
const REF = /^[a-z0-9][a-z0-9._-]{0,199}$/i

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { ref } = await req.json().catch(() => ({}))
  const valor = typeof ref === 'string' ? ref.trim() : ''
  if (valor && !REF.test(valor)) return NextResponse.json({ error: 'Solo letras, números, guiones y puntos (sin espacios)' }, { status: 400 })
  const { data, error } = await sb.from('proyectos').update({ ref_entrega: valor || null }).eq('id', params.id).select('id')
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'Esa ref ya la usa otro proyecto' : error.message }, { status: error.code === '23505' ? 409 : 500 })
  if (!data?.length) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  return NextResponse.json({ ok: true, ref: valor || null })
}
