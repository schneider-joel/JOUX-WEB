import { NextResponse } from 'next/server'
import { crearPeticion } from '@/lib/cartela-cambios'

export const dynamic = 'force-dynamic'
// supabase-js usa fetch: sin esto, Next guarda sus respuestas en el Data Cache y la lista sale vieja.
export const fetchCache = 'force-no-store'

// Petición de cambio de un local de Cartela (/cambios/<token>). Pública en el middleware: el token es la llave.
// Formulario multipart: `texto` y, opcional, `foto` (la página la reduce antes de subirla).
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'vacio' }, { status: 400 })
  const foto = form.get('foto')
  const r = await crearPeticion(params.token, String(form.get('texto') ?? ''), foto instanceof File && foto.size ? foto : null)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ peticion: r.peticion }, { status: 201 })
}
