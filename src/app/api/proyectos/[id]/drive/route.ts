import { NextResponse } from 'next/server'
import { crearCarpetaProyecto } from '@/lib/drive'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'
export const maxDuration = 30

// «Crear carpeta de Drive» / «Reintentar» en /proyectos y en la ficha del lead. Se puede repetir: reutiliza
// lo que ya exista y solo comparte si aún no estaba compartida.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const r = await crearCarpetaProyecto(Number(params.id))
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 502 })
  if ('omitido' in r) return NextResponse.json({ error: r.omitido }, { status: 400 })
  return NextResponse.json(r)
}
