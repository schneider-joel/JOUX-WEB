import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServer } from '@/lib/supabase-server'

const BUCKET = 'compras'

function autorizado() {
  const cookie = cookies().get('joux_auth')?.value
  return !!cookie && !!process.env.APP_PASSWORD && cookie === process.env.APP_PASSWORD
}

// Alta de una compra: guarda el archivo en el bucket privado y la fila en `compras`.
export async function POST(req: NextRequest) {
  if (!autorizado()) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const form = await req.formData()
    const archivo = form.get('archivo') as File | null
    const fecha = String(form.get('fecha') || '')
    const proveedor = String(form.get('proveedor') || '').trim()
    const base = Number(form.get('base'))
    if (!fecha || !proveedor || !Number.isFinite(base)) {
      return NextResponse.json({ error: 'Faltan fecha, proveedor o base' }, { status: 400 })
    }

    let archivo_path: string | null = null
    let archivo_nombre: string | null = null
    if (archivo && archivo.size > 0) {
      archivo_nombre = archivo.name
      const limpio = archivo.name.replace(/[^\w.\-]+/g, '_')
      archivo_path = `${fecha.slice(0, 4)}/${Date.now()}-${limpio}`
      const { error: upErr } = await supabaseServer.storage.from(BUCKET)
        .upload(archivo_path, Buffer.from(await archivo.arrayBuffer()), { contentType: archivo.type || 'application/octet-stream' })
      if (upErr) return NextResponse.json({ error: `No se pudo subir el archivo: ${upErr.message}` }, { status: 500 })
    }

    const { data, error } = await supabaseServer.from('compras').insert([{
      fecha, proveedor, base,
      concepto: String(form.get('concepto') || '').trim() || null,
      iva_pct: Number(form.get('iva_pct') ?? 21),
      deducible_pct: Number(form.get('deducible_pct') ?? 100),
      archivo_path, archivo_nombre,
    }]).select().single()
    if (error) {
      if (archivo_path) await supabaseServer.storage.from(BUCKET).remove([archivo_path])
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ compra: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!autorizado()) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { data: compra } = await supabaseServer.from('compras').select('archivo_path').eq('id', id).single()
  const { error } = await supabaseServer.from('compras').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (compra?.archivo_path) await supabaseServer.storage.from(BUCKET).remove([compra.archivo_path])
  return NextResponse.json({ ok: true })
}
