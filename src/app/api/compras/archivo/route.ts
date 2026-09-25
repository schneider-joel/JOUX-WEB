import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServer } from '@/lib/supabase-server'

// Abre el archivo de una compra con un enlace firmado de corta duración
// (el bucket es privado; nunca se expone una URL permanente).
export async function GET(req: NextRequest) {
  const cookie = cookies().get('joux_auth')?.value
  if (!cookie || !process.env.APP_PASSWORD || cookie !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const id = req.nextUrl.searchParams.get('id')
  const { data: compra } = await supabaseServer.from('compras').select('archivo_path').eq('id', id).single()
  if (!compra?.archivo_path) return NextResponse.json({ error: 'Sin archivo' }, { status: 404 })
  const { data, error } = await supabaseServer.storage.from('compras').createSignedUrl(compra.archivo_path, 300)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Error' }, { status: 500 })
  return NextResponse.redirect(data.signedUrl)
}
