import { NextResponse } from 'next/server'
import { supabaseServer as sb } from '@/lib/supabase-server'
import { faltaGanado, filasGanado, type FormGanado } from '@/lib/ganado'
import type { Lead } from '@/lib/leads'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// «Marcar ganado»: cliente fiscal (si es nuevo) + proyecto en fase «confirmado» + lead ganado + evento.
// Las filas salen de filasGanado(), la misma función que pinta la vista previa.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const form = await req.json().catch(() => null) as FormGanado | null
  if (!form || typeof form.cliente !== 'string') return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { data: lead } = await sb.from('leads').select('id, marca, estado, nombre, email, empresa, pais, idioma, interes, proyecto_id').eq('id', params.id).maybeSingle()
  if (!lead) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  if (lead.proyecto_id) return NextResponse.json({ error: 'Este lead ya tiene proyecto' }, { status: 409 })
  const { data: marca } = await sb.from('marcas').select('key, nombre, modo').eq('key', lead.marca).maybeSingle()
  if (!marca) return NextResponse.json({ error: 'Marca desconocida' }, { status: 400 })

  const falta = faltaGanado(form, marca)
  if (falta) return NextResponse.json({ error: falta }, { status: 400 })
  const { clienteFiscal, proyecto, evento } = filasGanado(lead as Lead, marca, form)

  // Cliente: el existente tiene que existir de verdad; el nuevo no puede pisar a otro con el mismo nombre.
  const { data: yaExiste } = await sb.from('clientes_fiscales').select('cliente').eq('cliente', proyecto.cliente).maybeSingle()
  if (form.existente && !yaExiste) return NextResponse.json({ error: `${proyecto.cliente} no está en Clientes` }, { status: 400 })
  if (!form.existente && yaExiste) return NextResponse.json({ error: `${proyecto.cliente} ya está en Clientes: elígelo de la lista` }, { status: 409 })
  if (clienteFiscal) {
    const { error } = await sb.from('clientes_fiscales').insert(clienteFiscal)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: nuevo, error: errP } = await sb.from('proyectos').insert(proyecto).select('id').single()
  if (errP || !nuevo) {
    // Sin proyecto no dejamos un cliente fiscal huérfano recién creado.
    if (clienteFiscal) await sb.from('clientes_fiscales').delete().eq('cliente', clienteFiscal.cliente)
    return NextResponse.json({ error: errP?.message || 'No se pudo crear el proyecto' }, { status: 500 })
  }

  const { error: errL } = await sb.from('leads').update({ estado: 'ganado', proyecto_id: nuevo.id, updated_at: new Date().toISOString() }).eq('id', lead.id)
  if (errL) return NextResponse.json({ error: errL.message, proyecto_id: nuevo.id }, { status: 500 })
  await sb.from('eventos').insert({ ...evento, lead_id: lead.id, proyecto_id: nuevo.id, datos: { ...evento.datos, de: lead.estado } })
  return NextResponse.json({ ok: true, proyecto_id: nuevo.id })
}
