import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServer } from '@/lib/supabase-server'

// Abre el PDF original de una factura histórica con un enlace firmado corto.
export async function GET(req: NextRequest) {
  const cookie = cookies().get('joux_auth')?.value
  if (!cookie || !process.env.APP_PASSWORD || cookie !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const id = req.nextUrl.searchParams.get('id')
  const { data: factura } = await supabaseServer.from('facturas').select('archivo_path').eq('id', id).single()
  if (!factura?.archivo_path) return NextResponse.json({ error: 'Sin archivo' }, { status: 404 })
  const { data, error } = await supabaseServer.storage.from('facturas').createSignedUrl(factura.archivo_path, 300)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Error' }, { status: 500 })
  return NextResponse.redirect(data.signedUrl)
}
