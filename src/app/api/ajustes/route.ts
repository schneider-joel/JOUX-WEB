import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { guardarPausa, guardarRespuestaAuto } from '@/lib/autonomia'
import { CATEGORIAS, MARCAS_CON_IA } from '@/lib/ia'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// Interruptores de autonomía de /ajustes. Cada cambio queda en la línea de tiempo (evento `autonomia.cambio`).
export async function PATCH(req: Request) {
  const b = await req.json().catch(() => ({}))
  const activo = b.activo === true
  if (typeof b.activo !== 'boolean') return NextResponse.json({ error: 'Falta activo' }, { status: 400 })

  if (b.tipo === 'pausa') {
    const { error } = await guardarPausa(activo)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (b.tipo === 'plantilla') {
    // Una plantilla = sus dos idiomas a la vez.
    if (typeof b.clave !== 'string' || typeof b.marca !== 'string') return NextResponse.json({ error: 'Falta la plantilla' }, { status: 400 })
    const { data, error } = await sb.from('plantillas').update({ auto: activo }).eq('clave', b.clave).eq('marca', b.marca).select('clave')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: 'No existe esa plantilla' }, { status: 404 })
  } else if (b.tipo === 'categoria') {
    if (!MARCAS_CON_IA.includes(b.marca) || !(CATEGORIAS as readonly string[]).includes(b.categoria) || b.categoria === 'spam') return NextResponse.json({ error: 'Marca o categoría desconocida' }, { status: 400 })
    const { error } = await guardarRespuestaAuto(b.marca, b.categoria, activo)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else return NextResponse.json({ error: 'Tipo desconocido' }, { status: 400 })

  await sb.from('eventos').insert({ tipo: 'autonomia.cambio', fuente: 'joux-hub', datos: { tipo: b.tipo, clave: b.clave, marca: b.marca, categoria: b.categoria, activo } })
  return NextResponse.json({ ok: true })
}
