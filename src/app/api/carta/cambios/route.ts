import { NextRequest, NextResponse } from 'next/server'
import { autorizarCarta } from '@/lib/cartela-acceso'
import { cartaEntregada, crearPeticionDe, extraDeForm, peticionesDe, peticionPublica } from '@/lib/cartela-cambios'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Cambios del local desde su carta (Worker de la carta + sesión en X-Sesion). ?slug=<local>
export async function GET(req: NextRequest) {
  const a = await autorizarCarta(req, req.nextUrl.searchParams.get('slug'))
  if ('error' in a) return NextResponse.json({ error: a.error }, { status: a.status })
  const [entregada, peticiones] = await Promise.all([cartaEntregada(a.local), peticionesDe(a.local.id)])
  return NextResponse.json({
    local: { nombre: a.local.nombre, entregada, pausado: a.local.estado === 'pausado', prueba: a.local.prueba },
    peticiones: peticiones.map(peticionPublica),
  })
}

// Petición nueva: multipart con texto, foto (opcional) y plato_id, plato_nombre, op, valor, deshace_id.
export async function POST(req: NextRequest) {
  const a = await autorizarCarta(req, req.nextUrl.searchParams.get('slug'))
  if ('error' in a) return NextResponse.json({ error: a.error }, { status: a.status })
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'vacio' }, { status: 400 })
  const foto = form.get('foto')
  const r = await crearPeticionDe(a.local, String(form.get('texto') ?? ''), foto instanceof File && foto.size ? foto : null, extraDeForm(form))
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ peticion: r.peticion }, { status: 201 })
}
