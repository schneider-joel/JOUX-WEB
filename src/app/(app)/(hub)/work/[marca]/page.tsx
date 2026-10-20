import { notFound } from 'next/navigation'
import { supabaseServer as sb } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache.
export const fetchCache = 'force-no-store'

// Marca: su pestaña de siempre (webs o treatments), que pinta el hub. Aquí solo el título y el 404.
export async function generateMetadata({ params }: { params: { marca: string } }) {
  const { data } = await sb.from('marcas').select('nombre').eq('key', params.marca).maybeSingle()
  return { title: `${data?.nombre || 'Marca'} · JOUX Hub` }
}

export default async function MarcaPage({ params }: { params: { marca: string } }) {
  const { data } = await sb.from('marcas').select('key').eq('key', params.marca).maybeSingle()
  if (!data) notFound()
  return null
}
